import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  awardXp,
  createCharacter,
  defaultRules,
  execute,
  gainXp,
  grantProfession,
  parseRulesConfig,
  raceLevel,
  scaleDistribution,
  statBudgetTotal,
  trackCap,
  withTrackBudgets,
  type Campaign,
  type Character,
  type Command,
  type GradeRules,
} from '../src';
import { kit, preMeRules, rawRules, run, testContext } from './helpers/events';

// ME.1 (DESIGN §4, L26/L27): every track grants stats. Rules config shape
// (D300): an optional `trackBudget` per grade; rules stored before ME have none
// and keep their old numbers.

const TABLE: Record<string, [number, number, number]> = {
  G: [8, 5, 5],
  F: [11, 7, 6],
  E: [16, 10, 10],
  D: [24, 15, 15],
  C: [36, 23, 22],
  B: [54, 33, 33],
  A: [80, 50, 50],
};

function raw(): Record<string, any> {
  return JSON.parse(JSON.stringify(DEFAULT_RULES));
}

describe('per-grade track budgets (ME.1)', () => {
  it('match DESIGN §4 for class, profession and race', () => {
    for (const grade of DEFAULT_RULES.grades) {
      const want = TABLE[grade.id];
      expect(want, grade.id).toBeDefined();
      expect(grade.trackBudget, grade.id).toEqual({
        class: want![0],
        profession: want![1],
        race: want![2],
      });
    }
  });

  it('rules stored before ME (no track budgets) still parse, without budgets', () => {
    const r = raw();
    for (const g of r.grades) delete g.trackBudget;
    r.tracks.professionUnlockGrade = 'E'; // as stored before ME
    const result = parseRulesConfig(r);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.config.grades.every((g) => g.trackBudget === undefined)).toBe(true);
  });

  it('allows professions from the first grade once every grade has a budget', () => {
    const r = raw();
    r.tracks.professionUnlockGrade = 'G';
    expect(parseRulesConfig(r).ok).toBe(true);
  });

  it('offers professions from the start', () => {
    expect(DEFAULT_RULES.tracks.professionUnlockGrade).toBe('G');
  });
});

const rules = defaultRules();
const order = rules.stats.list.map((s) => s.id);
const fresh = (): Character =>
  createCharacter(rules, {
    id: 'c1',
    name: 'Jake',
    className: 'Archer',
    classSkills: kit,
    classWeights: { perception: 2, agility: 1, endurance: 1, strength: 1 },
  });
const atGrade = (c: Character, grade: GradeRules): Character => ({
  ...c,
  grade: grade.id,
  classLevel: Math.max(c.classLevel, grade.topLevel === 4 ? 0 : topBefore(grade)),
  professionLevel: c.profession === null ? 0 : Math.max(c.professionLevel, topBefore(grade)),
});
const topBefore = (grade: GradeRules): number => {
  const i = rules.grades.findIndex((g) => g.id === grade.id);
  return i === 0 ? 0 : (rules.grades[i - 1] as GradeRules).topLevel;
};
const gained = (before: Character, after: Character) =>
  statBudgetTotal(after) - statBudgetTotal(before);

describe('every track grants stats (ME.1, DESIGN §2/§4)', () => {
  it.each(DEFAULT_RULES.grades.map((g) => [g.id] as const))(
    '%s: one class level with no profession grants class + profession share (+ race)',
    (id) => {
      const grade = rules.grades.find((g) => g.id === id) as GradeRules;
      const b = grade.trackBudget!;
      const c = atGrade(fresh(), grade);
      const r = gainXp(rules, c, 'class', grade.xpPerLevel);
      expect(r.character.classLevel).toBe(c.classLevel + 1);
      // No profession: race level = class level, so every class level is a race level.
      expect(gained(c, r.character)).toBe(b.class + b.profession + b.race);
      // The class weights' points go to stats; the race's are all free (Human).
      const free = r.character.freePointBatches.at(-1);
      expect(free).toEqual({
        raceLevel: raceLevel(rules, r.character),
        points: b.race,
        allocation: null,
        locked: false,
      });
    },
  );

  it.each(DEFAULT_RULES.grades.map((g) => [g.id] as const))(
    '%s: with a profession, class and profession levels grant their own budgets, race levels the race',
    (id) => {
      const grade = rules.grades.find((g) => g.id === id) as GradeRules;
      const b = grade.trackBudget!;
      const base = atGrade(grantProfession(rules, fresh(), 'Smith'), grade);
      const cls = gainXp(rules, base, 'class', grade.xpPerLevel).character;
      const raisedRace = raceLevel(rules, cls) > raceLevel(rules, base);
      expect(gained(base, cls)).toBe(b.class + (raisedRace ? b.race : 0));
      const prof = gainXp(rules, cls, 'profession', grade.xpPerLevel).character;
      const raisedAgain = raceLevel(rules, prof) > raceLevel(rules, cls);
      expect(raisedRace || raisedAgain).toBe(true);
      expect(gained(cls, prof)).toBe(b.profession + (raisedAgain ? b.race : 0));
      // Both levels together: the grade's full per-level total, as DESIGN §4 says.
      expect(gained(base, prof)).toBe(b.class + b.profession + b.race);
    },
  );

  it("follows Luke's G example exactly with set distributions", () => {
    let c = grantProfession(rules, fresh(), 'Alchemist');
    c = {
      ...c,
      distributions: {
        class: { stats: { strength: 1, agility: 2, intelligence: 3 }, free: 2 },
        profession: { stats: { intelligence: 1, wisdom: 1, vitality: 1 }, free: 2 },
        race: { stats: { perception: 2, intelligence: 2 }, free: 1 },
      },
    };
    const after = gainXp(
      rules,
      gainXp(rules, c, 'class', 100).character,
      'profession',
      100,
    ).character;
    const delta = Object.fromEntries(
      order.map((id) => [id, (after.stats[id] ?? 0) - (c.stats[id] ?? 0)]),
    );
    expect(delta).toMatchObject({
      strength: 1,
      agility: 2,
      intelligence: 6,
      wisdom: 1,
      vitality: 1,
      perception: 2,
      endurance: 0,
      toughness: 0,
      willpower: 0,
    });
    // 5 free points: the class level's 2 (no race level yet: race = floor(1/2) = 0),
    // then the profession's 2 and the race's 1 in race level 1's batch.
    expect(after.freePointBatches).toEqual([
      { raceLevel: 0, track: 'class', trackLevel: 1, points: 2, allocation: null, locked: false },
      { raceLevel: 1, points: 3, allocation: null, locked: false },
    ]);
  });

  it('scales a distribution to another grade budget exactly, keeping free points free', () => {
    const d = { stats: { strength: 1, agility: 2, intelligence: 3 }, free: 2 };
    for (const g of rules.grades) {
      for (const budget of [g.trackBudget!.class, g.trackBudget!.profession, 0, 1, 7]) {
        const s = scaleDistribution(d, budget, order);
        const total = Object.values(s.stats).reduce((a, b) => a + b, 0) + s.free;
        expect(total, `${g.id} ${budget}`).toBe(budget);
      }
    }
    expect(scaleDistribution(d, 16, order)).toEqual({
      stats: { strength: 2, agility: 4, intelligence: 6 },
      free: 4,
    });
    expect(scaleDistribution({ stats: {}, free: 0 }, 5, order)).toEqual({ stats: {}, free: 5 });
    expect(scaleDistribution({ stats: {}, free: 3 }, 5, order)).toEqual({ stats: {}, free: 5 });
  });

  it('all tracks levelling together reach the ME check values', () => {
    // Base 90; G 4 × 18, F 10 × 24, E 35 × 36, D 50 × 54, C 50 × 81, B 50 × 120, A 41 × 180.
    const want: Record<number, number> = {
      4: 162,
      14: 402,
      49: 1662,
      99: 4362,
      149: 8412,
      199: 14412,
      240: 21792,
    };
    let c = grantProfession(rules, fresh(), 'Smith');
    const seen: Record<number, number> = {};
    for (const grade of rules.grades) {
      c = { ...c, grade: grade.id };
      while (c.classLevel < trackCap(rules, grade.id)) {
        c = gainXp(rules, c, 'class', grade.xpPerLevel).character;
        c = gainXp(rules, c, 'profession', grade.xpPerLevel).character;
      }
      seen[c.classLevel] = statBudgetTotal(c);
    }
    expect(seen).toEqual(want);
  });

  it('overflow is unchanged: a capped class levels the profession, which grants its own points', () => {
    const grade = rules.grades[0] as GradeRules;
    let c = grantProfession(rules, fresh(), 'Smith');
    c = gainXp(rules, c, 'class', 4 * grade.xpPerLevel).character;
    const r = awardXp(rules, c, 'class', 2 * grade.xpPerLevel + 30);
    expect(r).toMatchObject({ overflowed: 2 * grade.xpPerLevel + 30, lost: 0 });
    expect(r.character.professionLevel).toBe(2);
    expect(r.character.xp.profession).toBe(30);
    // Profession levels 1 and 2: race 2 → 3 at the second.
    expect(gained(c, r.character)).toBe(
      2 * grade.trackBudget!.profession + grade.trackBudget!.race,
    );
  });
});

describe('distributions and batches through events (ME.1)', () => {
  const gm = testContext('d');
  const ok = (c: Campaign, command: Command, ctx = gm): Campaign => {
    const r = execute(c, command, ctx);
    if (!r.ok) throw new Error(r.error);
    return r.campaign;
  };
  const no = (c: Campaign, command: Command, ctx = gm): string => {
    const r = execute(c, command, ctx);
    expect(r.ok).toBe(false);
    return r.ok ? '' : r.error;
  };
  const start = () =>
    run([
      { type: 'campaign.create', name: 'W', rules: rawRules() },
      { type: 'character.create', id: 'kim', name: 'Kim', className: 'Caster', classSkills: kit },
    ]);
  const award = (track: 'class' | 'profession', amount: number): Command => ({
    type: 'xp.award',
    track,
    amount,
    participants: [{ characterId: 'kim' }],
  });

  it('the GM sets, replaces and resets a distribution; bad ones are refused', () => {
    let c = start();
    const set = (
      track: 'class' | 'profession' | 'race',
      stats: Record<string, number>,
      free: number,
    ) =>
      ({
        type: 'character.setDistribution',
        characterId: 'kim',
        track,
        distribution: { stats, free },
      }) as Command;
    c = ok(c, set('class', { intelligence: 3, wisdom: 0 }, 2));
    expect(c.state?.characters['kim']?.distributions).toEqual({
      class: { stats: { intelligence: 3 }, free: 2 },
    });
    expect(no(c, set('race', { luck: 1 }, 0))).toMatch(/luck/);
    expect(no(c, set('race', {}, 0))).toMatch(/at least one point/);
    expect(no(c, set('race', { strength: -1 }, 0))).toBeTruthy();
    expect(
      no(c, {
        type: 'character.setDistribution',
        characterId: 'kim',
        track: 'race',
        distribution: null,
      }),
    ).toMatch(/no race distribution/);
    c = ok(c, {
      type: 'character.setDistribution',
      characterId: 'kim',
      track: 'class',
      distribution: null,
    });
    expect(c.state?.characters['kim']?.distributions).toBeUndefined();
    // A player cannot set one.
    const player = { ...testContext('p'), actor: { role: 'player' as const, characterId: 'kim' } };
    expect(no(c, set('class', { intelligence: 8 }, 0), player)).toBeTruthy();
  });

  it("a profession level's own batch is assigned and overridden by its track and level", () => {
    let c = ok(start(), award('class', 100));
    c = ok(c, { type: 'character.grantProfession', characterId: 'kim', profession: 'Alchemist' });
    c = ok(c, {
      type: 'character.setDistribution',
      characterId: 'kim',
      track: 'profession',
      distribution: { stats: { wisdom: 3 }, free: 2 },
    });
    c = ok(c, award('profession', 100));
    const kim = c.state!.characters['kim']!;
    const batch = kim.freePointBatches.at(-1)!;
    expect(batch).toEqual({
      raceLevel: 1,
      track: 'profession',
      trackLevel: 2,
      points: 2,
      allocation: null,
      locked: false,
    });
    // The race-level batch for level 1 is a different batch.
    expect(
      no(c, {
        type: 'freePoints.assign',
        characterId: 'kim',
        raceLevel: 1,
        allocation: { agility: 2 },
      }),
    ).toMatch(/exactly 5 points|already/);
    expect(
      no(c, {
        type: 'freePoints.assign',
        characterId: 'kim',
        raceLevel: 1,
        track: 'class',
        trackLevel: 2,
        allocation: { agility: 2 },
      }),
    ).toMatch(/no free-point batch for class level 2/);
    c = ok(c, {
      type: 'freePoints.assign',
      characterId: 'kim',
      raceLevel: 1,
      track: 'profession',
      trackLevel: 2,
      allocation: { agility: 2 },
    });
    expect(c.state!.characters['kim']!.freePointBatches.at(-1)).toMatchObject({
      allocation: { agility: 2 },
      locked: true,
    });
    c = ok(c, {
      type: 'freePoints.override',
      characterId: 'kim',
      raceLevel: 1,
      track: 'profession',
      trackLevel: 2,
      allocation: null,
    });
    expect(c.state!.characters['kim']!.freePointBatches.at(-1)).toMatchObject({
      allocation: null,
      locked: false,
    });
  });
});

describe('campaigns created before ME (D300)', () => {
  const gm = testContext('o');
  const ok = (c: Campaign, command: Command): Campaign => {
    const r = execute(c, command, gm);
    if (!r.ok) throw new Error(r.error);
    return r.campaign;
  };
  const award: Command = {
    type: 'xp.award',
    track: 'class',
    amount: 100,
    participants: [{ characterId: 'jake' }],
  };

  it('keep their numbers until the GM switches, then the budgets apply from the next level-up', () => {
    let c = run([
      { type: 'campaign.create', name: 'Old', rules: preMeRules() },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
    ]);
    c = ok(ok(c, award), award);
    const before = c.state!.characters['jake']!;
    // Old G numbers: 4 class spread and 2 free points per level.
    expect(statBudgetTotal(before)).toBe(90 + 2 * 6);
    expect(before.freePointBatches.map((b) => b.points)).toEqual([2, 2]);
    c = ok(c, { type: 'rules.set', rules: withTrackBudgets(c.state!.rules) });
    expect(c.state!.rules.tracks.professionUnlockGrade).toBe('G');
    // Nothing already granted changes.
    expect(c.state!.characters['jake']).toEqual(before);
    c = ok(c, award);
    const after = c.state!.characters['jake']!;
    expect(statBudgetTotal(after) - statBudgetTotal(before)).toBe(18);
    expect(after.freePointBatches.map((b) => b.points)).toEqual([2, 2, 5]);
  });

  it('withTrackBudgets keeps budgets a grade already has and the old profession grade if a grade has none', () => {
    const r = preMeRules();
    r.grades[1].trackBudget = { class: 1, profession: 1, race: 1 };
    const switched = withTrackBudgets(r);
    expect(switched.grades[1].trackBudget).toEqual({ class: 1, profession: 1, race: 1 });
    expect(switched.grades[0].trackBudget).toEqual({ class: 8, profession: 5, race: 5 });
    expect(switched.tracks.professionUnlockGrade).toBe('G');
    const odd = preMeRules();
    odd.grades[2].id = 'X';
    expect(withTrackBudgets(odd).tracks.professionUnlockGrade).toBe('E');
    expect(withTrackBudgets(odd).grades[2].trackBudget).toBeUndefined();
  });
});
