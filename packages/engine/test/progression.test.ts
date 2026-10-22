import { describe, expect, it } from 'vitest';
import {
  aboveLevelBonus,
  classSpread,
  createCharacter,
  defaultRules,
  execute,
  gainXp,
  grantProfession,
  largestRemainderSplit,
  raceLevel,
  reshapeClassWeights,
  splitXp,
  statBudgetTotal,
  xpForLevels,
  type Character,
  type Command,
  type GradeRules,
  gradeGapXpFactor,
  shareXp,
  typicalSessionXp,
} from '../src';
import { kit, rawRules, run, seededRandom, testContext } from './helpers/events';

const rules = defaultRules();
const stats = rules.stats.list.map((s) => s.id);
const fresh = (weights?: Record<string, number>): Character =>
  createCharacter(rules, {
    id: 'c1',
    name: 'Jake',
    className: 'Archer',
    classSkills: kit,
    classWeights: weights,
  });

/** Stand-in for evolution (M1.10): move to the next grade once race level tops this one. */
function evolveIfReady(c: Character): Character {
  const index = rules.grades.findIndex((g) => g.id === c.grade);
  const grade = rules.grades[index] as GradeRules;
  const next = rules.grades[index + 1];
  if (!next || raceLevel(rules, c) < grade.topLevel) return c;
  let out: Character = { ...c, grade: next.id };
  if (next.id === rules.tracks.professionUnlockGrade && out.profession === null) {
    out = grantProfession(rules, out, 'Smith');
  }
  out = gainXp(rules, out, 'class', 0).character;
  return out.profession === null ? out : gainXp(rules, out, 'profession', 0).character;
}

const pick = (c: Character) => ({
  classWeights: c.classWeights,
  classSpreadTotals: c.classSpreadTotals,
});

describe('largestRemainderSplit', () => {
  it('splits evenly and gives remainders to the earliest largest remainders', () => {
    expect(largestRemainderSplit(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(largestRemainderSplit(10, [1, 1, 1, 1])).toEqual([3, 3, 2, 2]);
    expect(largestRemainderSplit(100, [1, 2])).toEqual([33, 67]);
    expect(largestRemainderSplit(0, [1, 1])).toEqual([0, 0]);
    expect(largestRemainderSplit(7, [0, 1])).toEqual([0, 7]);
  });

  it('always sums to the amount (seed 4242, 2,000 cases)', () => {
    const SEED = 4242;
    const rand = seededRandom(SEED);
    for (let n = 0; n < 2000; n++) {
      const amount = Math.floor(rand() * 100_000);
      const weights = Array.from({ length: 1 + Math.floor(rand() * 6) }, () =>
        Math.floor(rand() * 50),
      );
      if (!weights.some((w) => w > 0)) weights[0] = 1;
      const parts = largestRemainderSplit(amount, weights);
      const total = weights.reduce((a, b) => a + b, 0);
      expect(
        parts.reduce((a, b) => a + b, 0),
        `seed ${SEED}, case ${n}`,
      ).toBe(amount);
      parts.forEach((p, i) => {
        expect(
          Math.abs(p - (amount * (weights[i] as number)) / total),
          `seed ${SEED}, case ${n}`,
        ).toBeLessThan(1);
      });
    }
  });

  it('rejects bad input', () => {
    expect(() => largestRemainderSplit(-1, [1])).toThrow('whole number');
    expect(() => largestRemainderSplit(1.5, [1])).toThrow('whole number');
    expect(() => largestRemainderSplit(5, [])).toThrow('Nothing to split');
    expect(() => largestRemainderSplit(5, [0, 0])).toThrow('above 0');
    expect(() => largestRemainderSplit(5, [1, -1])).toThrow('Weights');
    expect(() => largestRemainderSplit(1e8, [1001, 1])).toThrow('0 to 1000');
    expect(largestRemainderSplit(1e8, [1000, 1, 1])).toEqual([99800399, 99801, 99800]);
  });
});

describe('classSpread', () => {
  // Seed 77 stays under 1 point; the rule's general bound is about one point (D35).
  const even = Object.fromEntries(stats.map((s) => [s, 1]));
  const zero = Object.fromEntries(stats.map((s) => [s, 0]));

  it('sums exactly every level and rotates equal weights across stats', () => {
    let totals = { ...zero };
    for (let level = 0; level < 9; level++) {
      const spread = classSpread(even, totals, stats, 4);
      expect(Object.values(spread).reduce((a, b) => a + b, 0)).toBe(4);
      for (const s of stats) totals = { ...totals, [s]: (totals[s] ?? 0) + (spread[s] ?? 0) };
    }
    // 36 points over 9 equal stats: exactly 4 each, not a front-loaded split.
    expect(Object.values(totals)).toEqual(Array(9).fill(4));
  });

  it('follows weights and never gives points to zero-weight stats', () => {
    const weights = { ...zero, agility: 3, perception: 1 };
    let totals = { ...zero };
    for (let level = 0; level < 10; level++) {
      const spread = classSpread(weights, totals, stats, 8);
      for (const s of stats) totals = { ...totals, [s]: (totals[s] ?? 0) + (spread[s] ?? 0) };
    }
    expect(totals['agility']).toBe(60);
    expect(totals['perception']).toBe(20);
    expect(totals['strength']).toBe(0);
  });

  it('stays within one point of the exact share (seed 77)', () => {
    const SEED = 77;
    const rand = seededRandom(SEED);
    const weights = Object.fromEntries(stats.map((s) => [s, Math.floor(rand() * 10)]));
    weights['strength'] = 1;
    const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);
    let totals = { ...zero };
    let given = 0;
    for (let level = 0; level < 200; level++) {
      const points = Math.floor(rand() * 41);
      const spread = classSpread(weights, totals, stats, points);
      expect(
        Object.values(spread).reduce((a, b) => a + b, 0),
        `seed ${SEED}`,
      ).toBe(points);
      for (const s of stats) totals = { ...totals, [s]: (totals[s] ?? 0) + (spread[s] ?? 0) };
      given += points;
      for (const s of stats) {
        const exact = (given * (weights[s] as number)) / weightSum;
        expect(
          Math.abs((totals[s] as number) - exact),
          `seed ${SEED}, level ${level}, ${s}`,
        ).toBeLessThan(1);
      }
    }
  });

  it('pins the highest-deficit rule where it differs from per-level largest remainder (D35)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const weights = { a: 8, b: 9, c: 1, d: 8, e: 5 };
    const none = { a: 0, b: 0, c: 0, d: 0, e: 0 };
    expect(classSpread(weights, none, ids, 16)).toEqual({ a: 4, b: 5, c: 1, d: 4, e: 2 });
    expect(largestRemainderSplit(16, [8, 9, 1, 8, 5])).toEqual([4, 5, 0, 4, 3]);
    // Ties go to the earlier stat in rules order.
    expect(classSpread({ a: 1, b: 1 }, { a: 0, b: 0 }, ['a', 'b'], 1)).toEqual({ a: 1, b: 0 });
  });

  it('reshaping weights resets the totals so the new weights govern at once', () => {
    let c = gainXp(rules, fresh({ strength: 1 }), 'class', 400).character;
    expect(c.stats['strength']).toBe(26);
    c = reshapeClassWeights(rules, { ...c, grade: 'F' }, { strength: 1, agility: 1 });
    expect(Object.values(c.classSpreadTotals).every((t) => t === 0)).toBe(true);
    const next = gainXp(rules, c, 'class', 2 * 300).character;
    expect(next.stats['strength']).toBe(26 + 5);
    expect(next.stats['agility']).toBe(10 + 5);
    expect(() => reshapeClassWeights(rules, c, { luck: 1 })).toThrow('Unknown stat');
    expect(() => reshapeClassWeights(rules, c, { agility: 1001 })).toThrow('0 to 1000');
    expect(() => reshapeClassWeights(rules, c, {})).toThrow('at least one stat');
  });

  it('rejects all-zero weights and bad point counts', () => {
    expect(() => classSpread(zero, zero, stats, 4)).toThrow('all zero');
    expect(() => classSpread(even, zero, stats, -1)).toThrow('whole number');
  });
});

describe('gainXp', () => {
  it('uses the current grade curve, grants spread per class level and free points per race level', () => {
    const { character, levelUps } = gainXp(rules, fresh(), 'class', 250);
    expect(character.classLevel).toBe(2);
    expect(character.xp.class).toBe(50);
    expect(levelUps).toEqual([
      { track: 'class', level: 1 },
      { track: 'race', level: 1 },
      { track: 'class', level: 2 },
      { track: 'race', level: 2 },
    ]);
    expect(Object.values(character.stats).reduce((a, b) => a + b, 0)).toBe(90 + 2 * 4);
    expect(character.freePointBatches).toEqual([
      { raceLevel: 1, points: 2, allocation: null, locked: false },
      { raceLevel: 2, points: 2, allocation: null, locked: false },
    ]);
  });

  it('freezes at the grade cap and banks XP, which applies after evolution', () => {
    const capped = gainXp(rules, fresh(), 'class', 1000).character;
    expect(capped.classLevel).toBe(4);
    expect(capped.xp.class).toBe(600);
    expect(gainXp(rules, capped, 'class', 0).levelUps).toEqual([]);
    // 600 banked at F's 300 per level (MQ.10) pays for two levels.
    const evolved = gainXp(rules, { ...capped, grade: 'F' }, 'class', 0).character;
    expect(evolved.classLevel).toBe(6);
    expect(evolved.xp.class).toBe(0);
  });

  it('rejects profession XP without a profession and bad amounts', () => {
    expect(() => gainXp(rules, fresh(), 'profession', 10)).toThrow('has no profession');
    expect(() => gainXp(rules, fresh(), 'class', -5)).toThrow('whole number');
  });

  it('diverging tracks: class 30, profession 10 gives race 20 with matching points and spread', () => {
    const base: Character = {
      ...fresh(),
      grade: 'E',
      profession: 'Smith',
      classLevel: 20,
      professionLevel: 10,
    };
    expect(raceLevel(rules, base)).toBe(15);
    const { character, levelUps } = gainXp(rules, base, 'class', 10 * 900);
    expect(character.classLevel).toBe(30);
    expect(raceLevel(rules, character)).toBe(20);
    expect(levelUps.filter((l) => l.track === 'race').map((l) => l.level)).toEqual([
      16, 17, 18, 19, 20,
    ]);
    expect(character.freePointBatches.map((b) => b.points)).toEqual([4, 4, 4, 4, 4]);
    expect(statBudgetTotal(character) - statBudgetTotal(base)).toBe(10 * 8 + 5 * 4);
    // Per stat, with weights agility 3 : perception 1 (80 spread points).
    const weighted = gainXp(
      rules,
      { ...base, ...pick(fresh({ agility: 3, perception: 1 })) },
      'class',
      10 * 900,
    ).character;
    expect(weighted.stats['agility']).toBe(10 + 60);
    expect(weighted.stats['perception']).toBe(10 + 20);
    expect(weighted.stats['strength']).toBe(10);
    // Profession levels raise race level (and free points) but grant no spread.
    const prof = gainXp(rules, character, 'profession', 2 * 900);
    expect(prof.character.professionLevel).toBe(12);
    expect(raceLevel(rules, prof.character)).toBe(21);
    expect(prof.character.stats).toEqual(character.stats);
    expect(prof.character.freePointBatches).toHaveLength(6);
  });

  it('all-tracks-equal simulation reproduces the DESIGN §4 check values', () => {
    const checks: Record<number, number> = {
      14: 194,
      49: 614,
      99: 1514,
      149: 2864,
      199: 4864,
      240: 7324,
    };
    let c = fresh();
    expect(statBudgetTotal(c)).toBe(90);
    const seen: Record<number, number> = {};
    for (let step = 0; step < 300 && c.classLevel < 240; step++) {
      const need = xpForLevels(rules, c, 'class', 1);
      c = gainXp(rules, c, 'class', need).character;
      if (c.profession !== null)
        c = gainXp(rules, c, 'profession', xpForLevels(rules, c, 'profession', 1)).character;
      expect(c.professionLevel === 0 || c.professionLevel === c.classLevel).toBe(true);
      if (checks[c.classLevel] !== undefined) seen[c.classLevel] = statBudgetTotal(c);
      c = evolveIfReady(c);
    }
    expect(seen).toEqual(checks);
    expect(c.classLevel).toBe(240);
    // Class spread totals match the stats the spread raised.
    expect(Object.values(c.classSpreadTotals).reduce((a, b) => a + b, 0)).toBe(
      rules.grades.reduce((sum, g, i) => {
        const prevTop = i === 0 ? 0 : (rules.grades[i - 1] as GradeRules).topLevel;
        return sum + (g.topLevel - prevTop) * g.classSpreadPerLevel;
      }, 0),
    );
  });
});

describe('xp helpers', () => {
  it('above-level bonus: +10% per level above, capped at +100%, none when not above', () => {
    expect(aboveLevelBonus(rules, 5, 8)).toBeCloseTo(0.3);
    expect(aboveLevelBonus(rules, 5, 50)).toBe(1);
    expect(aboveLevelBonus(rules, 8, 5)).toBe(0);
  });

  it('splitXp: even split, bonus per participant on top of its share', () => {
    const jake = gainXp(rules, fresh(), 'class', 200).character; // race 2
    const kim = { ...fresh(), id: 'k1', name: 'Kim' }; // race 0
    const shares = splitXp(
      rules,
      { c1: jake, k1: kim },
      {
        amount: 101,
        participants: [{ characterId: 'c1' }, { characterId: 'k1' }],
        enemyLevel: 4,
      },
    );
    expect(shares).toEqual([
      { characterId: 'c1', share: 51, bonus: 10, gained: 61 },
      { characterId: 'k1', share: 50, bonus: 20, gained: 70 },
    ]);
    expect(() =>
      splitXp(rules, { c1: jake }, { amount: 1, participants: [{ characterId: 'zz' }] }),
    ).toThrow('Unknown character');
    expect(() =>
      splitXp(
        rules,
        { c1: jake },
        { amount: 1, participants: [{ characterId: 'c1' }, { characterId: 'c1' }] },
      ),
    ).toThrow('listed twice');
    expect(
      splitXp(rules, { c1: jake }, { amount: 9, participants: [{ characterId: 'c1' }] }),
    ).toEqual([{ characterId: 'c1', share: 9, bonus: 0, gained: 9 }]);
  });

  it('XP per level triples each grade (DESIGN §5, MQ.10)', () => {
    expect(rules.grades.map((g) => g.xpPerLevel)).toEqual([
      100, 300, 900, 2700, 8100, 24300, 72900,
    ]);
    // The "typical session ≈ 6 levels" helper per grade.
    expect(rules.grades.map((g) => typicalSessionXp(rules, g.id))).toEqual([
      600, 1800, 5400, 16200, 48600, 145800, 437400,
    ]);
    expect(() => typicalSessionXp(rules, 'S')).toThrow();
  });

  it("targets below the character's grade give ⅓ XP one grade down, none further (MQ.10)", () => {
    expect(gradeGapXpFactor(rules, 'E', null)).toBe(1);
    expect(gradeGapXpFactor(rules, 'E', 'E')).toBe(1);
    expect(gradeGapXpFactor(rules, 'E', 'D')).toBe(1);
    expect(gradeGapXpFactor(rules, 'E', 'F')).toBe(1 / 3);
    expect(gradeGapXpFactor(rules, 'E', 'G')).toBe(0);
    expect(gradeGapXpFactor(rules, 'A', 'G')).toBe(0);
    expect(() => gradeGapXpFactor(rules, 'E', 'S')).toThrow('Unknown grade "S"');
    // Stored rules from before MQ.10 have no factors: no reduction.
    const old = { ...rules, xp: { ...rules.xp, gradeBelowFactors: [] } };
    expect(gradeGapXpFactor(old, 'E', 'G')).toBe(1);
    // Three entries: the last one covers every larger gap.
    const steps = { ...rules, xp: { ...rules.xp, gradeBelowFactors: [0.5, 0.25, 0.1] } };
    expect([3, 4, 5, 6].map((i) => gradeGapXpFactor(steps, 'A', rules.grades[6 - i]?.id))).toEqual([
      0.1, 0.1, 0.1, 0.1,
    ]);
    // Shares scale (floored) before the above-level bonus.
    const e = { ...fresh(), grade: 'E' };
    expect(shareXp(rules, e, 100, null, 'F')).toBe(33);
    expect(shareXp(rules, e, 100, null, 'G')).toBe(0);
    // Race level 0 vs enemy level 5: +50% on the scaled 33.
    expect(shareXp(rules, e, 99, 5, 'F')).toBe(33 + 16);
    expect(
      splitXp(
        rules,
        { c1: e },
        { amount: 90, participants: [{ characterId: 'c1' }], enemyGrade: 'F' },
      ),
    ).toEqual([{ characterId: 'c1', share: 90, bonus: 0, gained: 30 }]);
  });

  it('xpForLevels counts XP already held', () => {
    const c = gainXp(rules, fresh(), 'class', 30).character;
    expect(xpForLevels(rules, c, 'class', 6)).toBe(570);
    expect(() => xpForLevels(rules, c, 'class', -1)).toThrow('whole number');
  });

  it('rejects bad class weights at creation', () => {
    expect(() => fresh({ luck: 1 })).toThrow('Unknown stat "luck"');
    expect(() => fresh({ agility: 1.5 })).toThrow('whole number');
    expect(() => fresh({ agility: 0 })).toThrow('at least one stat');
  });
});

type Award = Extract<Command, { type: 'xp.award' }>;

describe('xp.award command and event', () => {
  const setup = (): Command[] => [
    { type: 'campaign.create', name: 'W', rules: rawRules() },
    { type: 'character.create', id: 'a', name: 'A', className: 'Archer', classSkills: kit },
    { type: 'character.create', id: 'b', name: 'B', className: 'Mage', classSkills: kit },
  ];
  const award = (participants: Award['participants'], extra: Partial<Award> = {}): Command => ({
    type: 'xp.award',
    track: 'class',
    amount: 300,
    participants,
    ...extra,
  });

  it('awards an even split that sums to the award and levels both characters', () => {
    const c = run([...setup(), award([{ characterId: 'a' }, { characterId: 'b' }])]);
    const event = c.events[c.events.length - 1];
    expect(event?.payload).toMatchObject({
      shares: [
        { characterId: 'a', share: 150 },
        { characterId: 'b', share: 150 },
      ],
      enemyLevel: null,
      reason: '',
    });
    expect(c.state?.characters['a']).toMatchObject({ classLevel: 1, xp: { class: 50 } });
  });

  it('accepts hand-set shares that sum to the award and rejects ones that do not', () => {
    const c = run([
      ...setup(),
      award([
        { characterId: 'a', share: 250 },
        { characterId: 'b', share: 50 },
      ]),
    ]);
    expect(c.state?.characters['a']?.classLevel).toBe(2);
    const base = run(setup());
    const ctx = testContext('z');
    const bad = execute(
      base,
      award([
        { characterId: 'a', share: 250 },
        { characterId: 'b', share: 49 },
      ]),
      ctx,
    );
    expect(bad).toMatchObject({
      ok: false,
      error: expect.stringContaining('shares sum to 299, not the award of 300'),
    });
    const mixed = execute(
      base,
      award([{ characterId: 'a', share: 250 }, { characterId: 'b' }]),
      ctx,
    );
    expect(mixed).toMatchObject({ ok: false, error: 'Give every participant a share, or none' });
    const twice = execute(base, award([{ characterId: 'a' }, { characterId: 'a' }]), ctx);
    expect(twice).toMatchObject({ ok: false, error: expect.stringContaining('listed twice') });
    const ghost = execute(base, award([{ characterId: 'ghost' }]), ctx);
    expect(ghost).toMatchObject({
      ok: false,
      error: expect.stringContaining('unknown character "ghost"'),
    });
    const prof = execute(base, award([{ characterId: 'a' }], { track: 'profession' }), ctx);
    expect(prof).toMatchObject({ ok: false, error: expect.stringContaining('has no profession') });
    const both = execute(base, award([{ characterId: 'a', share: 300, weight: 2 }]), ctx);
    expect(both).toMatchObject({
      ok: false,
      error: expect.stringContaining('both a share and a weight'),
    });
    const zero = execute(base, award([{ characterId: 'a', weight: 0 }]), ctx);
    expect(zero).toMatchObject({ ok: false, error: 'At least one weight must be above 0' });
  });

  it('rejects a whole profession award when one participant has no profession', () => {
    const base = run(setup());
    const state = base.state;
    if (!state) throw new Error('no state');
    const a = state.characters['a'] as Character;
    const withProf: typeof base = {
      ...base,
      state: {
        ...state,
        characters: { ...state.characters, a: { ...a, grade: 'E', profession: 'Smith' } },
      },
    };
    const result = execute(
      withProf,
      award([{ characterId: 'a' }, { characterId: 'b' }], { track: 'profession' }),
      testContext('z'),
    );
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('B has no profession'),
    });
  });

  it('applies the above-level bonus on apply and undo removes the whole award', () => {
    const before = run(setup());
    const c = run(
      [award([{ characterId: 'a' }], { amount: 100, enemyLevel: 5 })],
      testContext('y'),
      before,
    );
    expect(c.state?.characters['a']).toMatchObject({ classLevel: 1, xp: { class: 50 } });
    const undone = run([{ type: 'event.undo', eventId: 'y1' }], testContext('u'), c);
    expect(undone.state).toEqual(before.state);
  });
});
