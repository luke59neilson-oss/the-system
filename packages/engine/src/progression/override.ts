import {
  CharacterRuleError,
  gradeIndexOf,
  isAtCap,
  raceLevel,
  trackCap,
  type Character,
} from '../character';
import { evolutionTarget, selectionSlots } from '../evolution/model';
import type { GradeRules, RulesConfig } from '../rules';

/**
 * GM override for levels, XP and grade (MT.5, Q59, DESIGN §7 GM authority).
 * The GM sets the values directly; nothing the normal path would grant on the
 * way (class spread, free points, evolution bonuses) is granted. The warning
 * the GM confirms lists what the change skips.
 */
export interface ProgressionTarget {
  readonly grade: string;
  readonly classLevel: number;
  readonly professionLevel: number;
  readonly xp: Readonly<{ class: number; profession: number }>;
}

export interface ProgressionOverrideSummary {
  /** What changes, in order: grade, levels, XP. */
  readonly changes: readonly string[];
  /** What the change skips or leaves as it is. */
  readonly skips: readonly string[];
}

/** The grade whose level range holds a level (the last grade past the top). */
export function gradeOfLevel(rules: RulesConfig, level: number): GradeRules {
  const found = rules.grades.find((g) => level <= g.topLevel);
  return (found ?? rules.grades[rules.grades.length - 1]) as GradeRules;
}

const sumOver = (from: number, to: number, perLevel: (level: number) => number): number => {
  let total = 0;
  for (let l = from + 1; l <= to; l++) total += perLevel(l);
  return total;
};

const list = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] as string}`;

/**
 * The character after the override, or a CharacterRuleError saying why the
 * values cannot stand: an unknown grade, a level above the grade's top, a
 * profession level or XP without a profession, XP that would already have
 * paid for a level, or no change at all.
 */
export function applyProgressionOverride(
  rules: RulesConfig,
  character: Character,
  target: ProgressionTarget,
): Character {
  gradeIndexOf(rules, target.grade);
  const cap = trackCap(rules, target.grade);
  const per = (rules.grades[gradeIndexOf(rules, target.grade)] as GradeRules).xpPerLevel;
  const tracks = [
    ['class', 'Class', target.classLevel],
    ['profession', 'Profession', target.professionLevel],
  ] as const;
  for (const [track, label, level] of tracks) {
    if (!Number.isInteger(level) || level < 0) {
      throw new CharacterRuleError(`${label} level must be a whole number of 0 or more`);
    }
    if (level > cap) {
      throw new CharacterRuleError(
        `${label} level ${level} is above the ${target.grade}-grade top of ${cap}`,
      );
    }
    const xp = target.xp[track];
    if (!Number.isInteger(xp) || xp < 0) {
      throw new CharacterRuleError(`${label} XP must be a whole number of 0 or more`);
    }
    if (track === 'profession' && character.profession === null) {
      if (level !== 0 || xp !== 0) {
        throw new CharacterRuleError(
          `${character.name} has no profession, so profession level and XP stay 0`,
        );
      }
      continue;
    }
    if (isAtCap(rules, target.grade, level)) {
      if (rules.xp.overflow && xp !== 0) {
        throw new CharacterRuleError(
          `${label} level ${level} is the ${target.grade}-grade top, so its XP is 0 (XP does not bank)`,
        );
      }
    } else if (xp >= per) {
      throw new CharacterRuleError(
        `${label} XP must be below ${per}, the XP for one level at ${target.grade}-grade`,
      );
    }
  }
  const same =
    target.grade === character.grade &&
    target.classLevel === character.classLevel &&
    target.professionLevel === character.professionLevel &&
    target.xp.class === character.xp.class &&
    target.xp.profession === character.xp.profession;
  if (same) throw new CharacterRuleError('Nothing to change: the values are the current ones');
  const next: Character = {
    ...character,
    grade: target.grade,
    classLevel: target.classLevel,
    professionLevel: target.professionLevel,
    xp: { class: target.xp.class, profession: target.xp.profession },
  };
  return keepsEvolution(rules, character, next) ? next : { ...next, evolution: null };
}

/**
 * A released evolution stays only while it still applies: same grade, and the
 * character still at the gate for the grade it aims at.
 */
function keepsEvolution(rules: RulesConfig, was: Character, next: Character): boolean {
  if (was.evolution === null) return true;
  if (next.grade !== was.grade) return false;
  return evolutionTarget(rules, next)?.id === was.evolution.toGrade;
}

/**
 * What the override changes and what it skips, for the GM's warning. Pure
 * and total: it describes even values the engine would refuse.
 */
export function progressionOverrideSummary(
  rules: RulesConfig,
  character: Character,
  target: ProgressionTarget,
): ProgressionOverrideSummary {
  const changes: string[] = [];
  const skips: string[] = [];
  const known = rules.grades.some((g) => g.id === target.grade);
  const fromIndex = rules.grades.findIndex((g) => g.id === character.grade);
  const toIndex = known ? rules.grades.findIndex((g) => g.id === target.grade) : fromIndex;

  if (target.grade !== character.grade) {
    changes.push(`Grade ${character.grade} → ${target.grade}`);
    if (toIndex > fromIndex) {
      const passed = rules.grades.slice(fromIndex + 1, toIndex + 1).map((g) => `${g.id}-grade`);
      skips.push(
        `The evolution to ${list(passed)}: no evolution stat bonus, skill re-rating, pool refill or profession offer`,
      );
    } else if (toIndex < fromIndex) {
      skips.push(
        `Going down a grade takes nothing back: evolution bonuses, re-rated skills and skills above the ${target.grade}-grade ceiling stay`,
      );
    }
  }

  const fromClass = character.classLevel;
  const toClass = Math.max(0, Math.trunc(target.classLevel) || 0);
  if (toClass !== fromClass) {
    changes.push(`Class level ${fromClass} → ${toClass}`);
    if (toClass > fromClass) {
      const spread = sumOver(fromClass, toClass, (l) => gradeOfLevel(rules, l).classSpreadPerLevel);
      skips.push(`${spread} class spread points (base stats stay as they are)`);
      const chosen = new Set(
        character.selections.filter((s) => s.chosen !== null).map((s) => s.level),
      );
      const reached = selectionSlots(rules)
        .filter((s) => s.level > fromClass && s.level <= toClass && !chosen.has(s.level))
        .map((s) => String(s.level));
      if (reached.length > 0) {
        skips.push(
          `No skills are granted: the selection${reached.length === 1 ? '' : 's'} at class level ${list(reached)} become${reached.length === 1 ? 's' : ''} due, for you to offer as usual`,
        );
      }
    } else {
      skips.push(
        'Lowering a level takes nothing back: stats, free points and skills from those levels stay, and earning those levels again grants their class spread again',
      );
    }
  }
  if (character.profession !== null && target.professionLevel !== character.professionLevel) {
    changes.push(`Profession level ${character.professionLevel} → ${target.professionLevel}`);
  }

  const fromRace = raceLevel(rules, character);
  const toRace = raceLevel(rules, {
    profession: character.profession,
    classLevel: toClass,
    professionLevel: Math.max(0, Math.trunc(target.professionLevel) || 0),
  });
  if (toRace !== fromRace) {
    changes.push(`Race level ${fromRace} → ${toRace}`);
    if (toRace > fromRace) {
      const had = new Set(character.freePointBatches.map((b) => b.raceLevel));
      const points = sumOver(fromRace, toRace, (r) =>
        had.has(r) ? 0 : gradeOfLevel(rules, r).freePointsPerRaceLevel,
      );
      if (points > 0) skips.push(`${points} free points (no new batches to assign)`);
    }
  }

  if (character.evolution !== null && known) {
    const next = {
      ...character,
      grade: target.grade,
      classLevel: toClass,
      professionLevel: Math.max(0, Math.trunc(target.professionLevel) || 0),
    };
    if (!keepsEvolution(rules, character, next)) {
      const offers = character.evolution.professions.length;
      skips.push(
        `The released evolution to ${character.evolution.toGrade}-grade is withdrawn${offers > 0 ? ', with its profession offers' : ''}; release it again if it still applies`,
      );
    }
  }
  if (target.xp.class !== character.xp.class) {
    changes.push(`Class XP ${character.xp.class} → ${target.xp.class}`);
  }
  if (character.profession !== null && target.xp.profession !== character.xp.profession) {
    changes.push(`Profession XP ${character.xp.profession} → ${target.xp.profession}`);
  }
  return { changes, skips };
}
