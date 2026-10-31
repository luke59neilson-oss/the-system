import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  PLAYER_VIEW_LIMITS,
  execute,
  projectForGm,
  type CampaignState,
  type Command,
  type PlayerView,
} from '@the-system/engine';
import { LiveHub } from '../src/hub';
import type { ServerMessage } from '../src/protocol';
import { CampaignStore } from '../src/store';

// QF.52: views stay small as the campaign grows.
let dataDir = '';
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

const GM_KEY = 'k'.repeat(32);
const kit = [
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic Stealth', rarity: 'inferior' },
  { name: 'Archer’s Eye', rarity: 'common' },
];

function setup() {
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-viewsize-'));
  let ms = Date.UTC(2026, 9, 31, 2);
  const now = () => new Date((ms += 1000)).toISOString();
  const store = CampaignStore.open('main', { dataDir, now });
  let n = 0;
  const newId = () => `e${++n}`;
  const gm = (command: Command) => {
    const r = execute(store.campaign, command, {
      actor: { role: 'gm' },
      sessionId: null,
      now,
      newId,
    });
    if (!r.ok) throw new Error(r.error);
    store.appendAll(r.events);
  };
  gm({ type: 'campaign.create', name: 'W', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) });
  gm({ type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit });
  gm({ type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit });
  const hub = new LiveHub(store, {
    gmKey: GM_KEY,
    now,
    newId,
    rateLimit: { burst: 1e6, perSecond: 1e6 },
  });
  const join = (characterId: string | null, extra: object = {}) => {
    const got: { message: ServerMessage; raw: string | undefined }[] = [];
    const conn = hub.connect((message, raw) => got.push({ message, raw }));
    conn.receive(
      JSON.stringify(
        characterId === null
          ? { type: 'join', role: 'gm', gmKey: GM_KEY, lastSeq: 0 }
          : { type: 'join', role: 'player', characterId, lastSeq: 0, ...extra },
      ),
    );
    let req = 0;
    const send = (command: object) => {
      const requestId = `r${++req}`;
      conn.receive(JSON.stringify({ type: 'command', requestId, command }));
      return got.find((g) => g.message.type === 'result' && g.message.requestId === requestId)
        ?.message;
    };
    const lastView = () => {
      const all = got.filter((g) => g.message.type === 'view');
      const m = all[all.length - 1]?.message;
      return m?.type === 'view' ? m.view : null;
    };
    const views = () => got.filter((g) => g.message.type === 'view').length;
    return { got, send, conn, lastView, views };
  };
  return { store, gm, join };
}

const longBody = (tag: string) => `${tag} ${'x'.repeat(600)} END`;

describe('QF.52 player view limits', () => {
  it('carries the newest practice and messages, totals, and cut note bodies', () => {
    const { gm, join } = setup();
    for (let i = 0; i < 20; i++) {
      gm({
        type: 'practice.log',
        characterId: 'jake',
        action: `step ${i}`,
        skills: ['Basic Archery'],
      });
    }
    gm({
      type: 'system.broadcast',
      text: 'Pinned',
      characterIds: null,
      display: { mode: 'pinned' },
    } as Command);
    for (let i = 0; i < 70; i++)
      gm({ type: 'system.broadcast', text: `Notice ${i}`, characterIds: null });
    const jake = join('jake');
    jake.send({ type: 'note.create', characterId: 'jake', kind: 'party', body: longBody('camp') });
    const view = jake.lastView() as PlayerView;
    expect(view.practice.map((p) => p.action)).toEqual(
      Array.from({ length: 8 }, (_, i) => `step ${12 + i}`),
    );
    expect(view.practiceTotal).toBe(20);
    expect(view.messagesTotal).toBe(71);
    // The newest page, plus the old pinned banner (it stays up until removed).
    expect(view.messages).toHaveLength(PLAYER_VIEW_LIMITS.messages + 1);
    expect(view.messages[0]?.text).toBe('Pinned');
    expect(view.messages[view.messages.length - 1]?.text).toBe('Notice 69');
    const note = view.notes[0];
    expect(note?.bodyCut).toBe(true);
    expect(note?.body).toHaveLength(PLAYER_VIEW_LIMITS.noteBody);
  });

  it('sends more messages and whole notes when the player asks, within what they may read', () => {
    const { gm, join } = setup();
    for (let i = 0; i < 70; i++)
      gm({ type: 'system.broadcast', text: `Notice ${i}`, characterIds: null });
    const kim = join('kim');
    kim.send({
      type: 'note.create',
      characterId: 'kim',
      kind: 'journal',
      body: longBody('secret'),
    });
    const jake = join('jake');
    jake.send({ type: 'note.create', characterId: 'jake', kind: 'party', body: longBody('camp') });
    const party = (jake.lastView() as PlayerView).notes[0];
    const kimNote = (kim.lastView() as PlayerView).notes.find((n) => n.kind === 'journal');
    const before = jake.views();
    jake.conn.receive(
      JSON.stringify({ type: 'view.limits', messages: 100, openNotes: [party?.id, kimNote?.id] }),
    );
    expect(jake.views()).toBe(before + 1);
    const view = jake.lastView() as PlayerView;
    expect(view.messages).toHaveLength(70);
    expect(view.notes).toHaveLength(1); // Kim's journal stays Kim's
    expect(view.notes[0]?.body).toBe(longBody('camp'));
    expect(view.notes[0]?.bodyCut).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('secret');
    // The same limits again send nothing new.
    jake.conn.receive(JSON.stringify({ type: 'view.limits', messages: 100 }));
    expect(jake.views()).toBe(before + 1);
    // A rejoin starts from the defaults.
    jake.conn.receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'jake' }));
    expect((jake.lastView() as PlayerView).messages).toHaveLength(PLAYER_VIEW_LIMITS.messages);
  });

  it('refuses limits beyond the caps and ignores them from the GM', () => {
    const { join } = setup();
    const jake = join('jake');
    jake.conn.receive(JSON.stringify({ type: 'view.limits', messages: 10_001 }));
    expect(jake.got[jake.got.length - 1]?.message).toMatchObject({ type: 'error' });
    jake.conn.receive(
      JSON.stringify({
        type: 'view.limits',
        openNotes: Array.from({ length: 21 }, (_, i) => `n${i}`),
      }),
    );
    expect(jake.got[jake.got.length - 1]?.message).toMatchObject({ type: 'error' });
    const gmSock = join(null);
    const count = gmSock.got.length;
    gmSock.conn.receive(JSON.stringify({ type: 'view.limits', messages: 100 }));
    expect(gmSock.got.length).toBe(count);
  });

  it('sends each view already serialized, the same JSON as the message', () => {
    const { join } = setup();
    const jake = join('jake');
    jake.send({ type: 'note.create', characterId: 'jake', kind: 'party', body: 'camp' });
    const sent = jake.got.filter((g) => g.message.type === 'view');
    expect(sent.length).toBeGreaterThan(0);
    for (const g of sent) expect(g.raw).toBe(JSON.stringify(g.message));
  });
});

describe('QF.52 GM state patches', () => {
  const apply = (got: { message: ServerMessage }[]): CampaignState | null => {
    let state: CampaignState | null = null;
    for (const { message } of got) {
      if (message.type === 'state') state = message.state;
      if (message.type === 'statePatch') {
        const next = { ...state, ...message.set } as Record<string, unknown>;
        for (const k of message.unset ?? []) delete next[k];
        state = next as unknown as CampaignState;
      }
    }
    return state;
  };

  it('sends a whole state on join, then only the changed keys, rebuilding the same state', () => {
    const { store, join } = setup();
    const gmSock = join(null);
    const jake = join('jake');
    expect(gmSock.got.filter((g) => g.message.type === 'state')).toHaveLength(1);
    jake.send({
      type: 'practice.log',
      characterId: 'jake',
      action: 'aim',
      skills: ['Basic Archery'],
    });
    const patch = gmSock.got[gmSock.got.length - 1]?.message;
    expect(patch?.type).toBe('statePatch');
    if (patch?.type !== 'statePatch') return;
    expect(Object.keys(patch.set)).toContain('practice');
    expect(Object.keys(patch.set)).not.toContain('characters');
    expect(Object.keys(patch.set)).not.toContain('rules');
    // Undo, a journal, a shared journal: the patched state is always the projection.
    jake.send({
      type: 'note.create',
      characterId: 'jake',
      kind: 'journal',
      body: 'hidden thoughts',
    });
    expect(JSON.stringify(gmSock.got.map((g) => g.message))).not.toContain('hidden thoughts');
    const note = Object.values(store.campaign.state?.notes ?? {})[0];
    jake.send({ type: 'note.edit', noteId: note?.id, characterId: 'jake', shareable: true });
    gmSock.send({
      type: 'xp.award',
      track: 'class',
      amount: 50,
      participants: [{ characterId: 'kim' }],
    });
    const last = store.campaign.events[store.campaign.events.length - 1];
    gmSock.send({ type: 'event.undo', eventId: last?.id });
    expect(apply(gmSock.got)).toEqual(projectForGm(store.campaign.state as CampaignState));
    expect(JSON.stringify(apply(gmSock.got))).toContain('hidden thoughts');
  });
});
