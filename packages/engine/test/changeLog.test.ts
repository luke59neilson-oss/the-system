import { describe, expect, it } from 'vitest';
import {
  CHANGE_LOG_DEFAULT_PAGE,
  CHANGE_LOG_MAX_PAGE,
  changeLog,
  changeLogCategory,
  changeLogPage,
  execute,
  humanize,
  updateChangeLog,
  type Campaign,
  type ChangeLogCache,
  type Command,
} from '../src';
import { kit, randomCommand, rawRules, run, seededRandom, testContext } from './helpers/events';

// M4.8: the GM's change log rows.

describe('changeLog (M4.8)', () => {
  it('lists every event but undo markers, in words, marking what was undone', () => {
    const ctx = testContext('c');
    const setup: Command[] = [
      { type: 'campaign.create', name: 'Log', rules: rawRules() },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
      { type: 'system.broadcast', text: 'Hello, Jake.' },
    ];
    let c: Campaign = run(setup, ctx);
    const broadcastId = c.events.at(-1)!.id;
    const r = execute(c, { type: 'event.undo', eventId: broadcastId }, ctx);
    if (!r.ok) throw new Error(r.error);
    c = r.campaign;
    const rows = changeLog(c);
    expect(rows.map((x) => x.type)).toEqual([
      'campaign.created',
      'character.created',
      'system.broadcast',
    ]);
    const last = rows.at(-1)!;
    expect(last.lines.join(' ')).toContain('Hello, Jake.');
    expect(last.category).toBe('messages');
    expect(last.undoneBy).toBe(c.events.at(-1)!.id);
    expect(rows[0]!.undoneBy).toBeNull();
    expect(rows[0]!.lines).toEqual(['Campaign created (Log)']);
    expect(rows[1]!.category).toBe('characters');
  });

  it('gives words to events the session log does not describe, never a raw type', () => {
    const ctx = testContext('w');
    const c = run(
      [
        { type: 'campaign.create', name: 'Words', rules: rawRules() },
        {
          type: 'character.create',
          id: 'jake',
          name: 'Jake',
          className: 'Archer',
          classSkills: kit,
        },
        { type: 'skillDef.define', name: 'Arcane Powershot', rarity: 'rare' },
        { type: 'skill.nickname', characterId: 'jake', skill: 'Basic Archery', nickname: 'Pew' },
      ] as Command[],
      ctx,
    );
    const rows = changeLog(c);
    const def = rows.find((r) => r.type === 'skillDef.defined')!;
    expect(def.lines).toEqual(['Skill added to the library (Arcane Powershot)']);
    expect(def.category).toBe('library');
    const nick = rows.find((r) => r.type === 'skill.nicknamed')!;
    expect(nick.lines).toEqual(['Jake skill nicknamed (Basic Archery)']);
    expect(rows.every((r) => !r.lines.includes(r.type))).toBe(true);
  });

  it('never shows a note title, so a private journal stays private', () => {
    const ctx = testContext('n');
    let c = run(
      [
        { type: 'campaign.create', name: 'Notes', rules: rawRules() },
        {
          type: 'character.create',
          id: 'jake',
          name: 'Jake',
          className: 'Archer',
          classSkills: kit,
        },
      ],
      ctx,
    );
    const r = execute(
      c,
      {
        type: 'note.create',
        characterId: 'jake',
        kind: 'journal',
        title: 'Secret plan',
        body: 'Betray Bob',
      },
      { ...ctx, actor: { role: 'player', characterId: 'jake' } },
    );
    if (!r.ok) throw new Error(r.error);
    c = r.campaign;
    const row = changeLog(c).at(-1)!;
    expect(row.type).toBe('note.created');
    expect(row.lines).toEqual(['Jake note written']);
    expect(JSON.stringify(row)).not.toContain('Secret');
    expect(JSON.stringify(row)).not.toContain('Betray');
  });
  it('files unknown event areas under campaign', () => {
    expect(changeLogCategory('mystery.thing')).toBe('campaign');
  });
});

describe('humanize (M4.8)', () => {
  it('turns an event type into words', () => {
    expect(humanize('quest.statusSet')).toBe('quest status set');
    expect(humanize('session.started')).toBe('session started');
  });
});

// QF.13: the change log kept incrementally and served a bounded page at a time.
describe('updateChangeLog and changeLogPage (QF.13)', () => {
  const start = (): [Campaign, ReturnType<typeof testContext>] => {
    const ctx = testContext('q');
    return [
      run(
        [
          { type: 'campaign.create', name: 'Long', rules: rawRules() },
          {
            type: 'character.create',
            id: 'jake',
            name: 'Jake',
            className: 'Archer',
            classSkills: kit,
          },
        ],
        ctx,
      ),
      ctx,
    ];
  };

  it('matches a full rebuild after every command, undos included (seed 1313)', () => {
    const seed = 1313;
    const rand = seededRandom(seed);
    const [first0, ctx] = start();
    let c = first0;
    let cache: ChangeLogCache | null = null;
    let undos = 0;
    for (let i = 0; i < 300; i++) {
      const undoable = c.events.filter((e) => e.type !== 'event.undone');
      const command: Command =
        rand() < 0.1 && undoable.length > 2
          ? { type: 'event.undo', eventId: undoable[Math.floor(rand() * undoable.length)]!.id }
          : randomCommand(rand, c);
      const r = execute(c, command, ctx);
      if (!r.ok) continue;
      c = r.campaign;
      if (command.type === 'event.undo') undos++;
      cache = updateChangeLog(cache, c);
      expect(cache.rows, `seed ${seed}, step ${i}`).toEqual(changeLog(c));
    }
    expect(undos, `seed ${seed}`).toBeGreaterThan(3);
    expect(c.events.length, `seed ${seed}`).toBeGreaterThan(60);
  });

  it('extends without re-describing old rows, and rebuilds for an undo or another log', () => {
    const [first0, ctx] = start();
    let c = first0;
    const first = updateChangeLog(null, c);
    expect(updateChangeLog(first, c)).toBe(first);
    c = run([{ type: 'system.broadcast', text: 'One' }], ctx, c);
    const second = updateChangeLog(first, c);
    expect(second.rows[0]).toBe(first.rows[0]);
    expect(second.rows.at(-1)!.lines.join(' ')).toContain('One');
    const r = execute(c, { type: 'event.undo', eventId: c.events.at(-1)!.id }, ctx);
    if (!r.ok) throw new Error(r.error);
    const third = updateChangeLog(second, r.campaign);
    expect(third.rows.at(-1)!.undoneBy).toBe(r.campaign.events.at(-1)!.id);
    expect(third.rows[0]).not.toBe(second.rows[0]);
    const [other] = start();
    expect(updateChangeLog(third, other).rows).toEqual(changeLog(other));
  });

  it('serves a 10k-event log a bounded page at a time, newest first, filtered across the whole log', () => {
    const [first0, ctx] = start();
    let c = first0;
    const commands: Command[] = [];
    for (let i = 0; i < 10_000; i++) {
      commands.push({
        type: 'system.broadcast',
        text: i % 1000 === 0 ? `Marker ${i}` : `Line ${i}`,
      });
    }
    c = run(commands, ctx, c);
    const cache = updateChangeLog(null, c);
    expect(cache.rows).toHaveLength(10_002);
    const head = changeLogPage(cache.rows);
    expect(head.rows).toHaveLength(CHANGE_LOG_DEFAULT_PAGE);
    expect(head.rows[0]!.lines.join(' ')).toContain('Line 9999');
    expect(head.matching).toBe(10_002);
    expect(head.older).toBe(head.rows.at(-1)!.seq);
    const next = changeLogPage(cache.rows, { before: head.older });
    expect(next.rows[0]!.seq).toBe(head.older! - 1);
    expect(next.rows).toHaveLength(CHANGE_LOG_DEFAULT_PAGE);
    // No request can ask for the whole log.
    expect(changeLogPage(cache.rows, { limit: 1_000_000 }).rows).toHaveLength(CHANGE_LOG_MAX_PAGE);
    expect(changeLogPage(cache.rows, { limit: 0 }).rows).toHaveLength(1);
    // Search reaches the oldest rows; the last page has no older cursor.
    const markers = changeLogPage(cache.rows, { text: 'marker' });
    expect(markers.matching).toBe(10);
    expect(markers.rows.at(-1)!.lines.join(' ')).toContain('Marker 0');
    expect(markers.older).toBeNull();
    expect(changeLogPage(cache.rows, { who: 'player' }).matching).toBe(0);
    expect(changeLogPage(cache.rows, { kind: 'characters' }).rows.map((r) => r.type)).toEqual([
      'character.created',
    ]);
    // One more event extends the cache by one row; old rows are reused as is.
    const more = run([{ type: 'system.broadcast', text: 'Line 10000' }], ctx, c);
    const extended = updateChangeLog(cache, more);
    expect(extended.rows).toHaveLength(10_003);
    expect(extended.rows[5_000]).toBe(cache.rows[5_000]);
  });
});
