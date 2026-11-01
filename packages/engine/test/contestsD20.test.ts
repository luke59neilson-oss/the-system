import { describe, expect, it } from 'vitest';
import { appendEvent, execute, projectForPlayer, type Command, type DomainEvent } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// MK.1: contests shared under the d20 setting carry each side's dice.

const d20Rules = () => {
  const r = rawRules() as { resolution: Record<string, unknown> };
  r.resolution['rolls'] = 'd20';
  return r;
};

const setup = (rules: unknown = d20Rules()): Command[] => [
  { type: 'campaign.create', name: 'C', rules },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'mira', name: 'Mira', className: 'Archer', classSkills: kit },
];

const side = (label: string, value: number, grade: string, characterIds: string[] = []) => ({
  label,
  value,
  grade,
  characterIds,
  stat: characterIds.length ? 'perception' : null,
});

const die = (n: number, how: 'typed' | 'app' = 'typed') => ({ die: n, how });

const share = (extra: Partial<Extract<Command, { type: 'contest.share' }>> = {}): Command => ({
  type: 'contest.share',
  contestId: 'k1',
  a: side('Jake · Perception', 20, 'G', ['jake']),
  b: side('Pale hunter', 10, 'G'),
  mode: 'gradeWalls',
  roll: null,
  dice: [{ a: die(9), b: die(13, 'app') }],
  ...extra,
});

describe('d20 contests shared with the table (MK.1)', () => {
  it('stores each die, how it was rolled, the modifiers and the totals', () => {
    const c = run([...setup(), share()]);
    expect(c.state?.contests['k1']).toMatchObject({
      rolls: 'd20',
      roll: null,
      walled: false,
      success: false,
      yours: 20,
      theirs: 10,
      d20: {
        modA: 3,
        modB: 0,
        rounds: [{ a: { die: 9, how: 'typed', total: 12 }, b: { die: 13, how: 'app', total: 13 } }],
        attacker: 'a',
      },
    });
  });

  it('a tie goes to the attacker, whichever side acts (ML.3)', () => {
    const tie = [{ a: die(10), b: die(13) }]; // 10 + 3 = 13 + 0
    const a = run([...setup(), share({ dice: tie })]);
    expect(a.state?.contests['k1']).toMatchObject({ success: true, chance: 0.66 });
    expect(a.state?.contests['k1']?.d20?.rounds).toHaveLength(1);
    const b = run([...setup(), share({ dice: tie, attacker: 'b' })]);
    expect(b.state?.contests['k1']).toMatchObject({ success: false, chance: 0.6175 });
    expect(b.state?.contests['k1']?.d20?.attacker).toBe('b');
  });

  it('refuses dice that do not fit: a re-roll, an odds roll, no dice, dice on a wall', () => {
    const base = run(setup());
    const ctx = testContext('x');
    const refused = (cmd: Command, text: string) =>
      expect(execute(base, cmd, ctx)).toMatchObject({
        ok: false,
        error: expect.stringContaining(text),
      });
    refused(
      share({
        dice: [
          { a: die(10), b: die(13) },
          { a: die(15), b: die(2) },
        ],
      }),
      'no re-roll',
    );
    refused(share({ roll: 0.5 }), 'takes dice');
    refused(share({ dice: [] }), 'needs each side');
    refused(share({ dice: [{ a: die(21), b: die(1) }] }), '1–20');
    refused(share({ b: side('D brute', 1, 'D') }), 'grade wall');
    // Walled: no dice, the higher grade wins.
    const walled = run([...setup(), share({ b: side('D brute', 1, 'D'), dice: [] })]);
    expect(walled.state?.contests['k1']).toMatchObject({
      walled: true,
      success: false,
      roll: null,
    });
    expect(walled.state?.contests['k1']).not.toHaveProperty('d20');
  });

  it('one grade apart takes 5 off the lower side', () => {
    const c = run([
      ...setup(),
      share({ b: side('F hunter', 10, 'F'), dice: [{ a: die(10), b: die(4) }] }),
    ]);
    expect(c.state?.contests['k1']?.d20).toMatchObject({ modA: 3 - 5, modB: 0 });
    expect(c.state?.contests['k1']?.success).toBe(true); // 8 vs 4
  });

  it('a command may pick odds or d20 over the campaign setting', () => {
    const c = run([...setup(), share({ rolls: 'odds', roll: 0.1, dice: undefined })]);
    expect(c.state?.contests['k1']).toMatchObject({ roll: 0.1, success: true });
    expect(c.state?.contests['k1']).not.toHaveProperty('rolls');
    const oddsCampaign = run([...setup(rawRules()), share({ rolls: 'd20' })]);
    expect(oddsCampaign.state?.contests['k1']?.rolls).toBe('d20');
  });

  it('an odds campaign shares exactly the pre-MK payload', () => {
    const c = run([...setup(rawRules()), share({ roll: 0.6, dice: undefined })]);
    const ev = c.events[c.events.length - 1] as DomainEvent;
    expect(Object.keys(ev.payload as object).sort()).toEqual(
      [
        'a',
        'b',
        'chance',
        'contestId',
        'mode',
        'roll',
        'success',
        'theirs',
        'walled',
        'yours',
      ].sort(),
    );
  });

  it('players see the dice from their side', () => {
    const c = run([
      ...setup(),
      share({
        b: { ...side('Mira · Agility', 10, 'G', ['mira']), stat: 'agility' },
        dice: [{ a: die(9), b: die(13, 'app') }],
      }),
    ]);
    const state = c.state;
    if (!state) throw new Error('no state');
    expect(projectForPlayer(state, 'jake').contests[0]?.d20).toEqual({
      yourModifier: 3,
      theirModifier: 0,
      rounds: [
        {
          yours: { die: 9, how: 'typed', total: 12 },
          theirs: { die: 13, how: 'app', total: 13 },
        },
      ],
    });
    expect(projectForPlayer(state, 'mira').contests[0]).toMatchObject({
      won: true,
      d20: { yourModifier: 0, theirModifier: 3 },
    });
  });

  it('a replay checks stored dice for consistency only', () => {
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
          roll: null,
          yours: 10,
          theirs: 10,
          chance: 0.5,
          walled: false,
          success: true,
          rolls: 'd20',
          d20: {
            modA: 0,
            modB: 0,
            rounds: [{ a: { ...die(5), total: 5 }, b: { ...die(3), total: 3 } }],
          },
          ...payload,
        },
      }) as DomainEvent;
    expect(appendEvent(c, event({})).state?.contests['k9']?.success).toBe(true);
    expect(() => appendEvent(c, event({ success: false }))).toThrow(/does not match the dice/);
    expect(() =>
      appendEvent(
        c,
        event({
          d20: {
            modA: 1,
            modB: 0,
            rounds: [{ a: { ...die(5), total: 5 }, b: { ...die(3), total: 3 } }],
          },
        }),
      ),
    ).toThrow(/total does not match/);
    expect(() => appendEvent(c, event({ roll: 0.2 }))).toThrow(/no odds roll/);
    expect(() => appendEvent(c, event({ rolls: undefined }))).toThrow(/odds contest has no dice/);
    // Shared before ML.3 (no attacker): tied rounds rolled again replay as stored.
    const tied = {
      modA: 0,
      modB: 0,
      rounds: [
        { a: { ...die(4), total: 4 }, b: { ...die(4), total: 4 } },
        { a: { ...die(5), total: 5 }, b: { ...die(3), total: 3 } },
      ],
    };
    expect(appendEvent(c, event({ d20: tied })).state?.contests['k9']?.success).toBe(true);
    // From ML.3 on: one round, a tie goes to the attacker.
    const one = (attacker: 'a' | 'b') => ({
      modA: 0,
      modB: 0,
      rounds: [{ a: { ...die(4), total: 4 }, b: { ...die(4), total: 4 } }],
      attacker,
    });
    expect(appendEvent(c, event({ d20: one('a') })).state?.contests['k9']?.success).toBe(true);
    expect(() => appendEvent(c, event({ d20: one('b') }))).toThrow(/does not match the dice/);
    expect(() => appendEvent(c, event({ d20: { ...tied, attacker: 'a' } }))).toThrow(
      /one roll per side/,
    );
  });
});
