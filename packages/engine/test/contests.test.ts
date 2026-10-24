import { describe, expect, it } from 'vitest';
import { appendEvent, execute, projectForPlayer, type Command, type DomainEvent } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// M7.3: contest rolls the GM shares become events; participants see them from their side.

const setup = (): Command[] => [
  { type: 'campaign.create', name: 'C', rules: rawRules() },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'mira', name: 'Mira', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'ana', name: 'Ana', className: 'Archer', classSkills: kit },
];

const side = (label: string, value: number, grade: string, characterIds: string[] = []) => ({
  label,
  value,
  grade,
  characterIds,
  stat: characterIds.length ? 'perception' : null,
});

const share = (extra: Partial<Extract<Command, { type: 'contest.share' }>> = {}): Command => ({
  type: 'contest.share',
  contestId: 'k1',
  a: side('Jake · Perception', 30, 'G', ['jake']),
  b: side('Pale hunter', 10, 'G'),
  mode: 'gradeWalls',
  roll: 0.6,
  ...extra,
});

describe('contest.shared (M7.3)', () => {
  it('derives the result from the stored roll: 30 vs 10 is 75%, a roll of 0.6 wins', () => {
    const c = run([...setup(), share()]);
    expect(c.state?.contests['k1']).toMatchObject({
      chance: 0.75,
      roll: 0.6,
      success: true,
      walled: false,
      yours: 30,
      theirs: 10,
      mode: 'gradeWalls',
    });
    expect(c.state?.contestOrder).toEqual(['k1']);
    const lost = run([...setup(), share({ roll: 0.8 })]);
    expect(lost.state?.contests['k1']).toMatchObject({ success: false });
  });

  it('applies the grade-gap mode: one grade below counts ×⅓; two below is walled with no roll', () => {
    const c = run([
      ...setup(),
      share({ b: side('Fresh F', 10, 'F'), roll: 0.4 }),
      share({ contestId: 'k2', b: side('E brute', 1, 'E'), roll: null }),
    ]);
    expect(c.state?.contests['k1']).toMatchObject({ yours: 10, theirs: 10, chance: 0.5 });
    expect(c.state?.contests['k2']).toMatchObject({
      walled: true,
      roll: null,
      success: false,
      chance: 0,
    });
    // The mode defaults to the campaign's.
    const d = run([...setup(), share({ mode: undefined })]);
    expect(d.state?.contests['k1']?.mode).toBe('gradeWalls');
  });

  it('refuses a roll that does not fit: a walled contest with a roll, a rolled one without', () => {
    const base = run(setup());
    const ctx = testContext('x');
    expect(execute(base, share({ b: side('E brute', 1, 'E'), roll: 0.2 }), ctx)).toMatchObject({
      ok: false,
      error: expect.stringContaining('has no roll'),
    });
    expect(execute(base, share({ roll: null }), ctx)).toMatchObject({
      ok: false,
      error: expect.stringContaining('needs a roll'),
    });
    expect(execute(base, share({ roll: 1 }), ctx)).toMatchObject({ ok: false });
    expect(execute(base, share({ b: side('Mira', 10, 'G', ['jake']) }), ctx)).toMatchObject({
      ok: false,
      error: expect.stringContaining('listed twice'),
    });
    expect(execute(base, share({ b: side('Ghost', 10, 'G', ['nobody']) }), ctx)).toMatchObject({
      ok: false,
      error: expect.stringContaining('unknown character'),
    });
    expect(execute(base, share({ b: side('X', 10, 'Z') }), ctx)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/unknown grade/i),
    });
    const dup = run([share()], testContext('y'), base);
    expect(execute(dup, share(), ctx)).toMatchObject({
      ok: false,
      error: expect.stringContaining('already exists'),
    });
  });

  it('is GM-only: a player cannot share a contest', () => {
    const base = run(setup());
    const ctx = { ...testContext('p'), actor: { role: 'player' as const, characterId: 'jake' } };
    expect(execute(base, share(), ctx)).toMatchObject({ ok: false });
  });

  it('shows each participant the contest from their side, and nothing to others', () => {
    const c = run([
      ...setup(),
      share({
        a: side('Jake · Perception', 30, 'G', ['jake']),
        b: { ...side('Mira · Agility', 10, 'G', ['mira']), stat: 'agility' },
        roll: 0.6,
      }),
    ]);
    const state = c.state;
    if (!state) throw new Error('no state');
    const jake = projectForPlayer(state, 'jake').contests;
    const mira = projectForPlayer(state, 'mira').contests;
    expect(jake).toEqual([
      {
        id: 'k1',
        at: expect.any(String),
        yours: { label: 'Jake · Perception', stat: 'perception', value: 30 },
        theirs: 'Mira · Agility',
        chance: 0.75,
        walled: false,
        won: true,
      },
    ]);
    expect(mira).toMatchObject([
      { yours: { label: 'Mira · Agility', value: 10 }, theirs: 'Jake · Perception', won: false },
    ]);
    expect(mira[0]?.chance).toBeCloseTo(0.25);
    expect(projectForPlayer(state, 'ana').contests).toEqual([]);
    // An NPC side's value never reaches the player.
    const npc = run([share({ contestId: 'k2' })], testContext('n'), c);
    const view = JSON.stringify(projectForPlayer(npc.state ?? state, 'jake'));
    expect(view).toContain('Pale hunter');
    expect(projectForPlayer(npc.state ?? state, 'jake').contests[1]).not.toHaveProperty(
      'theirs.value',
    );
  });

  it('rounds a player’s chance to a whole percent, so an NPC value cannot be solved back', () => {
    const c = run([...setup(), share({ b: side('Beast', 31337, 'G'), mode: 'none', roll: 0.5 })]);
    const state = c.state;
    if (!state) throw new Error('no state');
    expect(state.contests['k1']?.chance).toBeCloseTo(30 / 31367);
    // Below 1% shows as 1%, never the exact ratio.
    expect(projectForPlayer(state, 'jake').contests[0]?.chance).toBe(0.01);
    expect(JSON.stringify(projectForPlayer(state, 'jake'))).not.toContain('31337');
  });

  it('keeps the outcome stored when shared; a replay checks it only for consistency', () => {
    const c = run(setup());
    const event = (payload: object): DomainEvent =>
      ({
        id: 'raw1',
        type: 'contest.shared',
        timestamp: '2026-10-24T12:00:00.000Z',
        actor: { role: 'gm' },
        sessionId: null,
        schemaVersion: 1,
        payload: {
          contestId: 'k9',
          a: side('A', 10, 'G'),
          b: side('B', 10, 'G'),
          mode: 'none',
          roll: 0.8,
          yours: 10,
          theirs: 10,
          chance: 0.9,
          walled: false,
          success: true,
          ...payload,
        },
      }) as DomainEvent;
    // Settled under other rules at the time (90%): the stored outcome stands.
    expect(appendEvent(c, event({})).state?.contests['k9']).toMatchObject({
      chance: 0.9,
      success: true,
    });
    expect(() => appendEvent(c, event({ success: false }))).toThrow(/does not match the roll/);
    expect(() => appendEvent(c, event({ walled: true }))).toThrow(/has no roll/);
    expect(() =>
      appendEvent(c, event({ walled: true, roll: null, chance: 0.5, success: false })),
    ).toThrow(/does not match the wall/);
  });

  it('keeps only the latest ten contests in a player view, oldest first', () => {
    const cmds = Array.from({ length: 12 }, (_, i) => share({ contestId: `k${i + 1}` }));
    const c = run([...setup(), ...cmds]);
    const state = c.state;
    if (!state) throw new Error('no state');
    const view = projectForPlayer(state, 'jake').contests;
    expect(view.map((v) => v.id)).toEqual(Array.from({ length: 10 }, (_, i) => `k${i + 3}`));
  });

  it('undo removes a shared contest', () => {
    const before = run(setup());
    const c = run([share()], testContext('y'), before);
    const undone = run([{ type: 'event.undo', eventId: 'y1' }], testContext('u'), c);
    expect(undone.state).toEqual(before.state);
  });
});
