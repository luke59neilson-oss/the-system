import { describe, expect, it } from 'vitest';
import {
  dueSelections,
  execute,
  parseRulesConfig,
  raceLevel,
  replay,
  type Campaign,
  type Character,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, seededRandom, testContext } from './helpers/events';

// QF.68: the campaign simulation runs on pre-ME rules; this one plays the
// default rules: three-step releases at every grade, with random options and
// choices, through as many grades as the seed's levels reach.
const SEED = 20261101;
const GRADES_PLAYED = 6;
const rules = (() => {
  const r = parseRulesConfig(rawRules());
  if (!r.ok) throw new Error('bad rules');
  return r.config;
})();
const statIds = rules.stats.list.map((s) => s.id);

function play(seed: number) {
  const rand = seededRandom(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const ctx = testContext('sim');
  const player: CommandContext = { ...ctx, actor: { role: 'player', characterId: 'jake' } };
  let c: Campaign | undefined;
  const exec = (command: Command, context: CommandContext = ctx): void => {
    const r = execute(c ?? { state: null, events: [], undone: {} }, command, context);
    if (!r.ok) throw new Error(`seed ${seed}: ${command.type} rejected: ${r.error}`);
    c = r.campaign;
  };
  const jake = (): Character => c?.state?.characters['jake'] as Character;
  let uniq = 0;
  /** A step's option: `budget` points split at random between stats and free. */
  const option = (step: string, budget: number, bonus: number) => {
    const stats: Record<string, number> = {};
    let free = 0;
    for (let p = 0; p < budget; p++) {
      const stat = statIds[int(0, statIds.length - 1)] as string;
      if (rand() < 0.2) free++;
      else stats[stat] = (stats[stat] ?? 0) + 1;
    }
    const name = `${step} ${++uniq}`;
    return {
      id: name,
      name,
      rarity: 'common',
      description: 'Evolve.',
      distribution: { stats, free },
      statBonus: bonus > 0 ? { [statIds[int(0, statIds.length - 1)] as string]: bonus } : {},
    };
  };
  const clearMenus = () => {
    for (const slot of dueSelections(rules, jake())) {
      exec({
        type: 'selection.offer',
        characterId: 'jake',
        level: slot.level,
        options: Array.from({ length: rules.skills.menuSize.min }, (_, i) => ({
          name: `Pick ${++uniq}`,
          rarity:
            i === 0 && slot.capstone
              ? rules.grades.find((x) => x.id === slot.grade)?.rarityCeiling
              : 'common',
          kind: 'class',
          description: 'A skill.',
        })),
      } as Command);
      const record = jake().selections.find((s) => s.level === slot.level);
      exec(
        {
          type: 'selection.choose',
          characterId: 'jake',
          level: slot.level,
          skill: record?.options[0]?.name,
          offerId: record?.offerId,
        } as Command,
        player,
      );
    }
  };

  exec({ type: 'campaign.create', name: 'Steps', rules: rawRules() } as Command);
  exec({
    type: 'character.create',
    id: 'jake',
    name: 'Jake',
    className: 'Archer',
    classSkills: kit,
  } as Command);

  const evolutions: { to: string; professionLevelKept: boolean }[] = [];
  for (let g = 0; g < GRADES_PLAYED; g++) {
    const grade = rules.grades[g]!;
    const target = rules.grades[g + 1]!;
    for (const track of ['class', 'profession'] as const) {
      if (track === 'profession' && jake().profession === null) continue;
      const level = track === 'class' ? jake().classLevel : jake().professionLevel;
      const levels = grade.topLevel - level;
      if (levels > 0) {
        exec({
          type: 'xp.award',
          track,
          amount: levels * grade.xpPerLevel,
          participants: [{ characterId: 'jake' }],
        } as Command);
      }
    }
    clearMenus();
    const budget = target.trackBudget;
    if (!budget) throw new Error(`seed ${seed}: grade ${target.id} has no budget`);
    expect(jake().classLevel, `seed ${seed}: top of ${grade.id}`).toBe(grade.topLevel);

    const bonus = int(0, 3);
    const steps = {
      class: Array.from({ length: int(1, 3) }, () => option('class', budget.class, bonus)),
      profession: Array.from({ length: int(1, 3) }, () =>
        option('profession', budget.profession, bonus),
      ),
      race: Array.from({ length: int(1, 2) }, () => option('race', budget.race, bonus)),
    };
    exec({
      type: 'evolution.release',
      characterId: 'jake',
      rerateApproved: true,
      steps,
    } as unknown as Command);

    const before = jake();
    const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T;
    const held = before.profession !== null;
    // Without a profession the player may wait ("none for now").
    const profession = !held && rand() < 0.4 ? null : pick(steps.profession);
    const cls = pick(steps.class);
    const race = pick(steps.race);
    exec(
      {
        type: 'evolution.choose',
        characterId: 'jake',
        choices: { class: cls.id, profession: profession?.id ?? null, race: race.id },
      } as unknown as Command,
      player,
    );
    const after = jake();
    const label = `seed ${seed}: ${grade.id} to ${target.id}`;
    expect(after.grade, label).toBe(target.id);
    expect(after.classLevel, label).toBe(before.classLevel);
    expect(after.race, label).toBe(race.name);
    expect(after.distributions?.class, label).toEqual(cls.distribution);
    expect(after.distributions?.race, label).toEqual(race.distribution);
    if (profession) {
      expect(after.profession, label).toBe(profession.name);
      expect(after.distributions?.profession, label).toEqual(profession.distribution);
      expect(after.professionLevel, label).toBe(held ? before.professionLevel : after.classLevel);
    } else {
      expect(after.profession, label).toBeNull();
      for (const o of steps.profession) expect(after.professionOffers, label).toContain(o.name);
    }
    evolutions.push({ to: target.id, professionLevelKept: held });

    // The next level pays exactly the new grade's budgets, split as chosen.
    const stats0 = { ...after.stats };
    const free0 = after.freePointBatches.reduce((a, b) => a + b.points, 0);
    exec({
      type: 'xp.award',
      track: 'class',
      amount: target.xpPerLevel,
      participants: [{ characterId: 'jake' }],
    } as Command);
    clearMenus();
    const paid = jake();
    const gained = statIds.reduce((a, s) => a + (paid.stats[s] ?? 0) - (stats0[s] ?? 0), 0);
    const freeGained = paid.freePointBatches.reduce((a, b) => a + b.points, 0) - free0;
    expect(paid.classLevel, label).toBe(after.classLevel + 1);
    const raceUp = raceLevel(rules, paid) - raceLevel(rules, after);
    expect(gained + freeGained, `${label}: stat points of one class level`).toBe(
      budget.class + raceUp * budget.race + (paid.profession === null ? budget.profession : 0),
    );
  }
  return { campaign: c as Campaign, evolutions };
}

describe('three-step evolutions on the default rules (QF.68)', () => {
  it(`plays ${GRADES_PLAYED} random evolutions and replays to the same state (seed ${SEED})`, () => {
    const { campaign, evolutions } = play(SEED);
    expect(evolutions).toHaveLength(GRADES_PLAYED);
    expect(evolutions.some((e) => e.professionLevelKept)).toBe(true);
    const copy = JSON.parse(JSON.stringify(campaign.events)) as unknown[];
    expect(replay(copy).state).toEqual(campaign.state);
  });
});
