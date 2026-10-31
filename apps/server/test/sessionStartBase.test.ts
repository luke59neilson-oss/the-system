// QF.54: a session started live hands the session log the state its start
// was applied to, so writes (and the End session report) never fold the
// whole campaign; the report reads exactly as one built from a full fold.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute, type Command, type CommandContext } from '@the-system/engine';
import { SessionLogWriter } from '../src/sessionLog';
import { CampaignStore } from '../src/store';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-startbase-'));
  dirs.push(dataDir);
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 9, 22, 19) + 1000 * tick++).toISOString();
  const store = CampaignStore.open('main', { dataDir, now });
  let n = 0;
  const ctx: CommandContext = {
    actor: { role: 'gm' },
    sessionId: null,
    now,
    newId: () => `e${++n}`,
  };
  const apply = (command: Command) => {
    const r = execute(store.campaign, command, ctx);
    if (!r.ok) throw new Error(r.error);
    store.appendAll(r.events);
  };
  const writer = (dir: string) =>
    new SessionLogWriter(store, {
      exportsDir: path.join(dataDir, dir),
      now: () => '2026-10-22T22:00:00.000Z',
      every: () => () => undefined,
    });
  return { store, apply, writer, dataDir };
}

describe('SessionLogWriter.sessionStarted (QF.54)', () => {
  it('keeps the pre-session state and writes the same report as a full fold', () => {
    const { store, apply, writer, dataDir } = setup();
    apply({
      type: 'campaign.create',
      name: 'Whale',
      rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
    });
    apply({
      type: 'character.create',
      id: 'jake',
      name: 'Jake',
      className: 'Archer',
      classSkills: [
        { name: 'Basic Archery', rarity: 'inferior' },
        { name: 'Basic Stealth', rarity: 'inferior' },
        { name: 'Archer’s Eye', rarity: 'common' },
      ],
    });
    const primed = writer('a');
    const plain = writer('b');
    const before = store.campaign.state;
    apply({ type: 'session.start' });
    primed.sessionStarted();
    expect((Reflect.get(primed, 'base') as { state: unknown; fromSeq: number }).state).toBe(before);
    expect((Reflect.get(primed, 'base') as { fromSeq: number }).fromSeq).toBe(2);
    apply({
      type: 'xp.award',
      track: 'class',
      amount: 250,
      participants: [{ characterId: 'jake' }],
    });
    apply({ type: 'system.broadcast', text: 'Into the canyons' });
    apply({ type: 'session.end' });
    primed.flush();
    plain.flush();
    // The primed base was used, not replaced by a fold.
    expect((Reflect.get(primed, 'base') as { state: unknown }).state).toBe(before);
    const read = (dir: string) =>
      readFileSync(path.join(dataDir, dir, 'main', 'session-01.md'), 'utf8');
    expect(read('a')).toContain('Into the canyons');
    expect(read('a')).toBe(read('b'));
    primed.close();
    plain.close();
    store.close();
  });

  it('does nothing unless the newest event is a live session start', () => {
    const { store, apply, writer, dataDir } = setup();
    apply({
      type: 'campaign.create',
      name: 'Whale',
      rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
    });
    const w = writer('a');
    w.sessionStarted();
    expect(Reflect.get(w, 'base')).toBeNull();
    apply({ type: 'session.start' });
    w.close();
    store.close();
    // A log read from disk has no recorded state before its last event: the
    // writer folds as before.
    const reopened = CampaignStore.open('main', { dataDir, now: () => '2026-10-22T23:00:00.000Z' });
    const again = new SessionLogWriter(reopened, {
      exportsDir: path.join(dataDir, 'c'),
      now: () => '2026-10-22T22:00:00.000Z',
      every: () => () => undefined,
    });
    again.sessionStarted();
    expect(Reflect.get(again, 'base')).toBeNull();
    again.close();
    reopened.close();
  });
});
