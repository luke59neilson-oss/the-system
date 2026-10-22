import { CharacterRuleError, createCharacter } from '../character';
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
}

/** A race (DESIGN §2: Human). The race skill comes from the rules config. */
export interface RaceDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

/** A profession (offered from the E-grade evolution) and its skill ideas for menus. */
export interface ProfessionDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly skills: readonly LibrarySkillRef[];
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
  uniqueName('class', def, library);
}

export function validateRaceDef(def: RaceDef, library: Readonly<Record<string, RaceDef>>): void {
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
  uniqueName('profession', def, library);
}
