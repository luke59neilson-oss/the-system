import { CharacterRuleError, createCharacter } from '../character';
import type { TrackDistribution } from '../character';
import { checkDistribution } from '../progression/budget';
import { classSpread } from '../progression/xp';
import type { RulesConfig } from '../rules';

/**
 * Class, race and profession libraries (ROADMAP M4.2). GM-only catalogues the
 * character creation form and later builders read. A character never points
 * at an entry: creating a character copies the class's name, skills and
 * weights into `character.created` (D30), so later edits change nothing that
 * already happened. Pure.
 */

/** A skill named by a class or profession entry; its text comes from the skill library (M4.1). */
export interface LibrarySkillRef {
  readonly name: string;
  readonly rarity: string;
}

/** A starting class: stat weights and the starting class skills (DESIGN §2). */
export interface ClassDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly skills: readonly LibrarySkillRef[];
  /** Integer weight per stat id (0–1000, at least one above 0). */
  readonly weights: Readonly<Record<string, number>>;
  /**
   * ML.2 (DESIGN §2): whole points per stat plus free points per class level.
   * Absent on classes made before ML.2: their weights show as converted points.
   */
  readonly points?: TrackDistribution | undefined;
}

/** A race (DESIGN §2: Human). The race skill comes from the rules config. */
export interface RaceDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** ML.2: points per race level; absent = all free points (Human, D301). */
  readonly points?: TrackDistribution | undefined;
}

/** A profession (offered from the E-grade evolution) and its skill ideas for menus. */
export interface ProfessionDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly skills: readonly LibrarySkillRef[];
  /** ML.2: points per profession level; absent = the class's shape (D301). */
  readonly points?: TrackDistribution | undefined;
}

/** Most skill ideas a profession entry may list. */
export const MAX_PROFESSION_SKILLS = 10;

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function uniqueName(
  kind: string,
  def: { id: string; name: string },
  library: Readonly<Record<string, { id: string; name: string }>>,
): void {
  for (const other of Object.values(library)) {
    if (other.id !== def.id && sameName(other.name, def.name)) {
      throw new CharacterRuleError(`The ${kind} library already has [${other.name}]`);
    }
  }
}

/**
 * Throws CharacterRuleError when the class could not start a character: the
 * same checks as character creation (skill count, rarities within the first
 * grade's ceiling, no repeated names or the race skill, weights).
 */
export function validateClassDef(
  rules: RulesConfig,
  def: ClassDef,
  library: Readonly<Record<string, ClassDef>>,
): void {
  createCharacter(rules, {
    id: 'class-check',
    name: 'Class check',
    className: def.name,
    classSkills: def.skills,
    classWeights: def.weights,
  });
  checkPoints(rules, def.points);
  uniqueName('class', def, library);
}

/** ML.2: an entry's points name known stats with whole numbers ≥ 0. */
function checkPoints(rules: RulesConfig, points: TrackDistribution | undefined): void {
  if (points)
    checkDistribution(
      points,
      rules.stats.list.map((s) => s.id),
    );
}

export function validateRaceDef(
  def: RaceDef,
  library: Readonly<Record<string, RaceDef>>,
  rules: RulesConfig,
): void {
  checkPoints(rules, def.points);
  uniqueName('race', def, library);
}

/** Profession skill ideas: known, unreserved rarities and no repeated names. */
export function validateProfessionDef(
  rules: RulesConfig,
  def: ProfessionDef,
  library: Readonly<Record<string, ProfessionDef>>,
): void {
  if (def.skills.length > MAX_PROFESSION_SKILLS) {
    throw new CharacterRuleError(`A profession lists at most ${MAX_PROFESSION_SKILLS} skills`);
  }
  const seen = new Set<string>();
  for (const skill of def.skills) {
    const rarity = rules.skills.rarities.find((r) => r.id === skill.rarity);
    if (!rarity) throw new CharacterRuleError(`${skill.name}: unknown rarity "${skill.rarity}"`);
    if (rarity.reserved) {
      throw new CharacterRuleError(`${skill.name}: rarity "${rarity.name}" is reserved`);
    }
    const key = skill.name.trim().toLowerCase();
    if (seen.has(key)) throw new CharacterRuleError(`Duplicate skill "${skill.name}"`);
    seen.add(key);
  }
  checkPoints(rules, def.points);
  uniqueName('profession', def, library);
}

/** ML.2: the library tracks that carry points per level. */
export type EntryTrack = 'class' | 'race' | 'profession';

/**
 * ML.2 (DESIGN §2): one level's budget for a library entry's track at a grade
 * (G: class 8, race 5, profession 5), or null when the grade has no budgets.
 */
export function entryBudget(rules: RulesConfig, gradeId: string, track: EntryTrack): number | null {
  return rules.grades.find((g) => g.id === gradeId)?.trackBudget?.[track] ?? null;
}

/**
 * ML.2: an entry's points per level as the library shows them. A class made
 * before ML.2 has only weights: they show converted to whole points at the
 * class budget of `gradeId` (the first level's split, D35 deciding the
 * remainders, D301). A race or profession with none has no points to show.
 */
export function entryPoints(
  rules: RulesConfig,
  gradeId: string,
  entry: {
    readonly points?: TrackDistribution | undefined;
    readonly weights?: Readonly<Record<string, number>>;
  },
): { readonly points: TrackDistribution; readonly converted: boolean } | null {
  if (entry.points) return { points: entry.points, converted: false };
  const budget = entryBudget(rules, gradeId, 'class');
  if (!entry.weights || budget === null) return null;
  const order = rules.stats.list.map((s) => s.id);
  if (order.every((id) => (entry.weights?.[id] ?? 0) === 0)) return null;
  const spread = classSpread(entry.weights, {}, order, budget);
  const stats: Record<string, number> = {};
  for (const [id, n] of Object.entries(spread)) if (n > 0) stats[id] = n;
  return { points: { stats, free: 0 }, converted: true };
}

/** ML.2: points per stat plus free points of one level. */
export function pointsTotal(points: TrackDistribution): number {
  return Object.values(points.stats).reduce((a, b) => a + b, 0) + points.free;
}
