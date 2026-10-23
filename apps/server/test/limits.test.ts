import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute, type Command } from '@the-system/engine';
import { LiveHub, RATE_LIMITED, type HubOptions } from '../src/hub';
import type { ServerMessage } from '../src/protocol';
import { CampaignStore } from '../src/store';

// QF.3: limits on player-made data, seen through the live hub.
let dataDir = '';
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

const GM_KEY = 'k'.repeat(32);
const kit = [
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic Stealth', rarity: 'inferior' },
  { name: 'Archer’s Eye', rarity: 'common' },
];

/** A store with Jake and Kim, a movable clock, and a hub over it. */
function setup(rules: unknown, hubOptions: Partial<HubOptions> = {}) {
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-limits-'));
  let ms = Date.UTC(2026, 9, 23, 2);
  const now = () => new Date(ms).toISOString();
  const store = CampaignStore.open('main', { dataDir, now });
  let n = 0;
  const newId = () => `e${++n}`;
  const commands: Command[] = [
    { type: 'campaign.create', name: 'W', rules },
    { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
    { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
  ];
  for (const command of commands) {
    const r = execute(store.campaign, command, {
      actor: { role: 'gm' },
      sessionId: null,
      now,
      newId,
    });
    if (!r.ok) throw new Error(r.error);
    store.appendAll(r.events);
  }
  const hub = new LiveHub(store, { gmKey: GM_KEY, now, newId, ...hubOptions });
  const join = (characterId: string | null) => {
    const got: ServerMessage[] = [];
    const conn = hub.connect((m) => got.push(m));
    conn.receive(
      JSON.stringify(
        characterId === null
          ? { type: 'join', role: 'gm', gmKey: GM_KEY, lastSeq: 0 }
          : { type: 'join', role: 'player', characterId, lastSeq: 0 },
      ),
    );
    let req = 0;
    const send = (command: object) => {
      const requestId = `r${++req}`;
      conn.receive(JSON.stringify({ type: 'command', requestId, command }));
      return got.find((m) => m.type === 'result' && m.requestId === requestId);
    };
    return { got, send };
  };
  return { store, hub, join, advance: (by: number) => (ms += by) };
}

const rules = (limits?: object) =>
  JSON.parse(JSON.stringify(limits ? { ...DEFAULT_RULES, limits } : DEFAULT_RULES)) as unknown;
const journal = (characterId: string, body: string) => ({
  type: 'note.create',
  characterId,
  kind: 'journal',
  body,
});

describe('QF.3 hub rate limit', () => {
  it('refuses a flood from one phone with a clear error, then refills over time', () => {
    const { join, advance } = setup(rules(), { rateLimit: { burst: 5, perSecond: 2 } });
    const jake = join('jake'); // the join spends 1 of 5
    const results = Array.from({ length: 6 }, (_, i) => jake.send(journal('jake', `n${i}`)));
    expect(results.slice(0, 4).every((r) => r?.type === 'result' && r.ok)).toBe(true);
    expect(results[4]).toMatchObject({ ok: false, error: RATE_LIMITED });
    expect(results[5]).toMatchObject({ ok: false, error: RATE_LIMITED });
    // Another phone has its own budget.
    const kim = join('kim');
    expect(kim.send(journal('kim', 'hi'))).toMatchObject({ ok: true });
    // Half a second refills one message.
    advance(500);
    expect(jake.send(journal('jake', 'later'))).toMatchObject({ ok: true });
    expect(jake.send(journal('jake', 'again'))).toMatchObject({ ok: false, error: RATE_LIMITED });
  });

  it('counts joins too, and never limits the GM', () => {
    const { hub, join } = setup(rules(), { rateLimit: { burst: 2, perSecond: 1 } });
    const got: ServerMessage[] = [];
    const conn = hub.connect((m) => got.push(m));
    for (let i = 0; i < 3; i++) {
      conn.receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'jake' }));
    }
    expect(got.filter((m) => m.type === 'joined')).toHaveLength(2);
    expect(got.at(-1)).toEqual({ type: 'error', error: RATE_LIMITED });
    const gm = join(null);
    for (let i = 0; i < 10; i++) {
      expect(
        gm.send({ type: 'note.create', characterId: null, kind: 'gm', body: `g${i}` }),
      ).toMatchObject({ ok: true });
    }
  });

  it('defaults to a budget a person tapping never meets', () => {
    const { join } = setup(rules());
    const jake = join('jake');
    const results = Array.from({ length: 29 }, (_, i) => jake.send(journal('jake', `n${i}`)));
    expect(results.every((r) => r?.type === 'result' && r.ok)).toBe(true);
    expect(jake.send(journal('jake', 'flood'))).toMatchObject({ ok: false, error: RATE_LIMITED });
  });
});

describe('QF.3 per-character caps through the hub', () => {
  it('shows the player the note and trade limits', () => {
    const { join } = setup(
      rules({ notesPerCharacter: 2, noteCharsPerCharacter: 50, openTradesPerCharacter: 1 }),
    );
    const jake = join('jake');
    expect(jake.send(journal('jake', 'x'.repeat(51)))).toMatchObject({
      ok: false,
      error: 'Notes are full (50 characters in all); shorten or delete a note first',
    });
    expect(jake.send(journal('jake', 'a'))).toMatchObject({ ok: true });
    expect(jake.send(journal('jake', 'b'))).toMatchObject({ ok: true });
    expect(jake.send(journal('jake', 'c'))).toMatchObject({
      ok: false,
      error: 'Note limit reached (2 notes); delete one to add another',
    });
    const trade = {
      type: 'trade.propose',
      characterId: 'jake',
      to: 'kim',
      give: {},
      get: { currency: 1 },
    };
    expect(jake.send(trade)).toMatchObject({ ok: true });
    expect(jake.send(trade)).toMatchObject({
      ok: false,
      error: 'Too many open trades (1); cancel one first',
    });
  });
});

describe('QF.3 unchanged views are not re-sent', () => {
  it("a player's private journal entry sends no new view to the other player", () => {
    const { join } = setup(rules());
    const jake = join('jake');
    const kim = join('kim');
    const gm = join(null);
    const views = (got: ServerMessage[]) => got.filter((m) => m.type === 'view').length;
    const states = () => gm.got.filter((m) => m.type === 'state').length;
    const [kimBefore, jakeBefore, gmBefore] = [views(kim.got), views(jake.got), states()];
    expect(jake.send(journal('jake', 'private thoughts'))).toMatchObject({ ok: true });
    expect(views(kim.got)).toBe(kimBefore); // Kim cannot see it: nothing new for her
    expect(views(jake.got)).toBe(jakeBefore + 1); // Jake's own view changed
    expect(states()).toBe(gmBefore + 1); // the GM always gets the state
    // A party note changes both views.
    expect(
      jake.send({ type: 'note.create', characterId: 'jake', kind: 'party', body: 'camp here' }),
    ).toMatchObject({ ok: true });
    expect(views(kim.got)).toBe(kimBefore + 1);
    expect(views(jake.got)).toBe(jakeBefore + 2);
    // A rejected command sends no views at all.
    expect(jake.send({ type: 'note.delete', noteId: 'nope', characterId: 'jake' })).toMatchObject({
      ok: false,
    });
    expect(views(kim.got)).toBe(kimBefore + 1);
    expect(views(jake.got)).toBe(jakeBefore + 2);
  });

  it('a rejoin always gets a view, even if it has not changed', () => {
    const { hub, join } = setup(rules());
    join('kim');
    const got: ServerMessage[] = [];
    const conn = hub.connect((m) => got.push(m));
    const message = JSON.stringify({
      type: 'join',
      role: 'player',
      characterId: 'kim',
      lastSeq: 0,
    });
    conn.receive(message);
    conn.receive(message);
    expect(got.filter((m) => m.type === 'view')).toHaveLength(2);
  });
});
