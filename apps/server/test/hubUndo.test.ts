import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, notificationHistory } from '@the-system/engine';
import { LiveHub } from '../src/hub';
import type { ServerMessage } from '../src/protocol';
import { CampaignStore } from '../src/store';

// QF.54: undoing the newest event sends `{undoneSeqs}` to the clients that
// held its notifications, keeps the history cache in step without a
// rebuild, and an older undo still resets the whole history.

const KEY = 'k'.repeat(32);
let dataDir = '';
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function setup() {
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-hubundo-'));
  const store = CampaignStore.open('main', { dataDir, now: () => '2026-10-21T00:00:00.000Z' });
  let n = 0;
  const hub = new LiveHub(store, {
    gmKey: KEY,
    now: () => '2026-10-21T00:00:00.000Z',
    newId: () => `e${++n}`,
  });
  const gmGot: ServerMessage[] = [];
  const gm = hub.connect((m) => gmGot.push(m));
  gm.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey: KEY, lastSeq: 0 }));
  let r = 0;
  const command = (c: object) => {
    const id = `r${++r}`;
    gm.receive(JSON.stringify({ type: 'command', requestId: id, command: c }));
    const res = gmGot.find((m) => m.type === 'result' && m.requestId === id);
    if (!res || res.type !== 'result' || !res.ok) throw new Error(JSON.stringify(res));
  };
  command({ type: 'campaign.create', name: 'W', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) });
  for (const [id, name] of [
    ['jake', 'Jake'],
    ['kim', 'Kim'],
  ]) {
    command({
      type: 'character.create',
      id,
      name,
      className: 'Archer',
      classSkills: [
        { name: 'Basic Archery', rarity: 'inferior' },
        { name: 'Basic Stealth', rarity: 'inferior' },
        { name: 'Archer’s Eye', rarity: 'common' },
      ],
    });
  }
  const phone = (id: string) => {
    const got: ServerMessage[] = [];
    hub
      .connect((m) => got.push(m))
      .receive(JSON.stringify({ type: 'join', role: 'player', characterId: id, lastSeq: 0 }));
    return got;
  };
  return { store, hub, gmGot, command, phone };
}

const notices = (got: ServerMessage[]) =>
  got.filter(
    (m): m is Extract<ServerMessage, { type: 'notifications' }> => m.type === 'notifications',
  );

describe('undo of the newest event (QF.54)', () => {
  it('sends undoneSeqs to the holders only and keeps the history in step', () => {
    const { store, hub, gmGot, command, phone } = setup();
    const jake = phone('jake');
    const kim = phone('kim');
    command({
      type: 'xp.award',
      track: 'class',
      amount: 100,
      participants: [{ characterId: 'jake' }],
    });
    const seq = hub.seq;
    const awardId = store.campaign.events.at(-1)!.id;
    gmGot.length = 0;
    jake.length = 0;
    kim.length = 0;
    command({ type: 'event.undo', eventId: awardId });
    expect(notices(jake)).toEqual([{ type: 'notifications', items: [], undoneSeqs: [seq] }]);
    expect(notices(gmGot)).toEqual([{ type: 'notifications', items: [], undoneSeqs: [seq] }]);
    expect(notices(kim)).toEqual([]);
    // A fresh join sees the same history a rebuild would give.
    const late = phone('jake');
    const want = notificationHistory(store.campaign).filter(
      (n) => n.notification.characterId === 'jake',
    );
    expect(notices(late)[0]?.items).toEqual(want);
    expect(want.some((n) => n.seq === seq)).toBe(false);
  });

  it('an undo of an older event still replaces every history', () => {
    const { store, gmGot, command, phone } = setup();
    const jake = phone('jake');
    command({
      type: 'xp.award',
      track: 'class',
      amount: 100,
      participants: [{ characterId: 'jake' }],
    });
    const awardId = store.campaign.events.at(-1)!.id;
    command({ type: 'system.broadcast', text: 'later', characterIds: null });
    gmGot.length = 0;
    jake.length = 0;
    command({ type: 'event.undo', eventId: awardId });
    const got = notices(jake);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ reset: true });
    expect(got[0]?.items).toEqual(
      notificationHistory(store.campaign).filter((n) => n.notification.characterId === 'jake'),
    );
  });
});
