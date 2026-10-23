import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  execute,
  replay,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
import { kit, run, testContext } from './helpers/events';

// QF.3: per-character caps on notes and open trades, from `rules.limits`.
const limits = {
  notesPerCharacter: 3,
  noteCharsPerCharacter: 100,
  openTradesPerCharacter: 2,
  practiceEntriesPerCharacter: 2,
  practiceEntryChars: 20,
};
const rules = () => JSON.parse(JSON.stringify({ ...DEFAULT_RULES, limits })) as unknown;
const ctx = testContext('l');
const make = (id: string): Command => ({
  type: 'character.create',
  id,
  name: id,
  className: 'Archer',
  classSkills: kit,
});
const base = (): Campaign =>
  run([{ type: 'campaign.create', name: 'Whale', rules: rules() }, make('jake'), make('kim')], ctx);
const as = (characterId: string): CommandContext => ({
  ...ctx,
  actor: { role: 'player', characterId },
});
const note = (body: string, kind: 'journal' | 'party' = 'journal'): Command => ({
  type: 'note.create',
  characterId: 'jake',
  kind,
  title: 't',
  body,
});

function step(c: Campaign, command: Command, context: CommandContext): Campaign {
  const result = execute(c, command, context);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}
function refuse(c: Campaign, command: Command, context: CommandContext): string {
  const result = execute(c, command, context);
  expect(result.ok, JSON.stringify(command)).toBe(false);
  return result.ok ? '' : result.error;
}

describe('rules.limits', () => {
  it('defaults are in the rules config, and old rules read them', () => {
    const state = base().state;
    expect(state?.rules.limits).toEqual(limits);
    const old = { ...(DEFAULT_RULES as Record<string, unknown>) };
    delete old['limits'];
    const c = run([{ type: 'campaign.create', name: 'Old', rules: old }], ctx);
    expect(c.state?.rules.limits).toEqual({
      notesPerCharacter: 300,
      noteCharsPerCharacter: 150_000,
      openTradesPerCharacter: 10,
      practiceEntriesPerCharacter: 5000,
      practiceEntryChars: 500,
    });
  });

  it('caps the number of notes a character writes, journal and party together', () => {
    let c = base();
    c = step(c, note('a'), as('jake'));
    c = step(c, note('b', 'party'), as('jake'));
    c = step(c, note('c'), as('jake'));
    expect(refuse(c, note('d'), as('jake'))).toBe(
      'Note limit reached (3 notes); delete one to add another',
    );
    // Another character has their own allowance; the GM is not capped.
    c = step(c, { ...note('k'), characterId: 'kim' } as Command, as('kim'));
    c = step(c, { type: 'note.create', characterId: null, kind: 'gm', body: 'x' }, ctx);
    c = step(c, { type: 'note.create', characterId: null, kind: 'party', body: 'y' }, ctx);
    // Deleting one frees a slot.
    const first = Object.values(c.state?.notes ?? {}).find((n) => n.author === 'jake');
    c = step(c, { type: 'note.delete', noteId: first?.id ?? '', characterId: 'jake' }, as('jake'));
    step(c, note('d'), as('jake'));
  });

  it('caps the total size of a character’s notes on create and on edit', () => {
    let c = step(base(), { ...note('x'.repeat(60)), noteId: 'n1' } as Command, as('jake'));
    const full = 'Notes are full (100 characters in all); shorten or delete a note first';
    // 61 used; 1 (title) + 39 = 40 more would be 101.
    expect(refuse(c, note('y'.repeat(39)), as('jake'))).toBe(full);
    c = step(c, note('y'.repeat(38)), as('jake'));
    const id = Object.values(c.state?.notes ?? {}).find((n) => n.body.startsWith('x'))?.id ?? '';
    expect(
      refuse(
        c,
        { type: 'note.edit', noteId: id, characterId: 'jake', body: 'x'.repeat(61) },
        as('jake'),
      ),
    ).toBe(full);
    // Tags count too.
    expect(
      refuse(c, { type: 'note.edit', noteId: id, characterId: 'jake', tags: ['ab'] }, as('jake')),
    ).toBe(full);
    // Shrinking is always allowed, and frees room.
    c = step(c, { type: 'note.edit', noteId: id, characterId: 'jake', body: 'short' }, as('jake'));
    step(c, note('z'.repeat(40)), as('jake'));
  });

  it('an edit that does not grow a note passes even over a lowered cap', () => {
    // Recorded under roomy rules, then replayed under tight ones: replay never checks caps.
    const roomy = run(
      [
        {
          type: 'campaign.create',
          name: 'Whale',
          rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
        },
        make('jake'),
      ],
      testContext('r'),
    );
    const big = step(roomy, { ...note('x'.repeat(500)), noteId: 'big' } as Command, as('jake'));
    const tight = big.events.map((e, i) =>
      i === 0
        ? {
            ...e,
            payload: { ...(e.payload as object), rules: rules() },
          }
        : e,
    );
    const replayed = replay(tight as typeof big.events);
    expect(replayed.state?.notes['big']?.body.length).toBe(500);
    const c = step(
      replayed,
      { type: 'note.edit', noteId: 'big', characterId: 'jake', body: 'x'.repeat(400) },
      as('jake'),
    );
    expect(
      refuse(
        c,
        { type: 'note.edit', noteId: 'big', characterId: 'jake', body: 'x'.repeat(401) },
        as('jake'),
      ),
    ).toContain('Notes are full');
  });

  it('caps open trades a character has proposed', () => {
    const offer = (tradeId: string): Command => ({
      type: 'trade.propose',
      tradeId,
      characterId: 'jake',
      to: 'kim',
      give: {},
      get: { currency: 1 },
    });
    let c = step(base(), offer('t1'), as('jake'));
    c = step(c, offer('t2'), as('jake'));
    expect(refuse(c, offer('t3'), as('jake'))).toBe('Too many open trades (2); cancel one first');
    // Kim's own proposals and the GM's are separate.
    c = step(c, { ...offer('k1'), characterId: 'kim', to: 'jake' } as Command, as('kim'));
    c = step(c, { ...offer('g1'), characterId: null, to: 'jake' } as Command, ctx);
    c = step(c, { ...offer('g2'), characterId: null, to: 'jake' } as Command, ctx);
    c = step(c, { ...offer('g3'), characterId: null, to: 'jake' } as Command, ctx);
    // A closed trade frees a slot.
    c = step(c, { type: 'trade.cancel', tradeId: 't1', characterId: 'jake' }, as('jake'));
    step(c, offer('t3'), as('jake'));
  });

  it('caps player practice entries by size and count; the GM is not capped', () => {
    const log = (action: string, tags: string[] = []): Command => ({
      type: 'practice.log',
      characterId: 'jake',
      action,
      tags,
      stat: 'agility',
    });
    let c = base();
    expect(refuse(c, log('x'.repeat(21)), as('jake'))).toBe(
      'A practice entry can be at most 20 characters',
    );
    expect(refuse(c, log('x'.repeat(10), ['y'.repeat(11)]), as('jake'))).toContain('at most 20');
    c = step(c, log('x'.repeat(20)), as('jake'));
    c = step(c, log('shot'), as('jake'));
    expect(refuse(c, log('again'), as('jake'))).toBe(
      'Practice log is full (2 entries); ask the GM',
    );
    c = step(c, log('a long GM entry well over the cap'), ctx);
    step(c, { ...log('kim'), characterId: 'kim' } as Command, as('kim'));
  });
});
