import { CharacterRuleError, type Character, type CharacterSkill } from '../character';
import type { RulesConfig } from '../rules';

/**
 * Skill library (ROADMAP M4.1, MQ.12): the GM's catalogue of skills by
 * official name (and, under `rules.skills.libraryByRarity`, rarity).
 * When a character gains a skill the library knows, its System description and
 * flavour are filled from the entry (only fields still empty; D90). `effects`
 * is the GM's table note; MQ.12 shows it to the skill's owner only. Pure.
 */

export interface SkillDef {
  readonly id: string;
  /** Official System name; unique in the library, ignoring case. */
  readonly name: string;
  readonly rarity: string;
  readonly tags: readonly string[];
  /** System description shown to players once granted ("" = none). */
  readonly description: string;
  /** Italic flavour line shown to players once granted ("" = none). */
  readonly flavor: string;
  /** GM-only effects text (mechanics, numbers, reminders). */
  readonly effects: string;
}

/** Longest tag, and most tags, a library skill may carry. */
export const MAX_SKILL_TAG = 40;
export const MAX_SKILL_TAGS = 20;

/** Trims tags, drops blanks and case-insensitive duplicates (first spelling wins). */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (tag === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Throws CharacterRuleError when the definition breaks a library rule. */
export function validateSkillDef(
  rules: RulesConfig,
  def: SkillDef,
  library: Readonly<Record<string, SkillDef>>,
): void {
  const rarity = rules.skills.rarities.find((r) => r.id === def.rarity);
  if (!rarity) throw new CharacterRuleError(`Unknown rarity "${def.rarity}"`);
  if (rarity.reserved) throw new CharacterRuleError(`Rarity "${rarity.name}" is reserved`);
  if (def.tags.length > MAX_SKILL_TAGS) {
    throw new CharacterRuleError(`A skill has at most ${MAX_SKILL_TAGS} tags`);
  }
  for (const tag of def.tags) {
    if (tag.length > MAX_SKILL_TAG) {
      throw new CharacterRuleError(`A tag is at most ${MAX_SKILL_TAG} characters`);
    }
  }
  // MQ.12 (L4): one entry per name and rarity; before it, one per name (D90).
  const byRarity = rules.skills.libraryByRarity;
  for (const other of Object.values(library)) {
    if (
      other.id !== def.id &&
      sameName(other.name, def.name) &&
      (!byRarity || other.rarity === def.rarity)
    ) {
      const which = byRarity ? ` (${rarity.name})` : '';
      throw new CharacterRuleError(`The library already has [${other.name}]${which}`);
    }
  }
}

/**
 * The library entry for an official skill name (exact, then ignoring case), if
 * any. With a rarity (MQ.12), only an entry of that rarity matches.
 */
export function librarySkill(
  library: Readonly<Record<string, SkillDef>>,
  name: string,
  rarity?: string,
): SkillDef | undefined {
  const defs = Object.values(library).filter((d) => rarity === undefined || d.rarity === rarity);
  return defs.find((d) => d.name === name) ?? defs.find((d) => sameName(d.name, name));
}

/** The entry a character's skill copy follows under the campaign's rules. */
export function entryForSkill(
  rules: RulesConfig,
  library: Readonly<Record<string, SkillDef>>,
  skill: Pick<CharacterSkill, 'name' | 'rarity'>,
): SkillDef | undefined {
  return librarySkill(library, skill.name, rules.skills.libraryByRarity ? skill.rarity : undefined);
}

/**
 * MQ.12 (L4): a copy the GM has not edited takes its entry's text; an empty
 * field in the entry leaves the copy's own text. Returns `skill` when nothing
 * changes.
 */
export function syncSkillText(skill: CharacterSkill, def: SkillDef | undefined): CharacterSkill {
  if (!def || skill.textEdited) return skill;
  const description = def.description.trim() || skill.description;
  const flavor = def.flavor.trim() || skill.flavor;
  return description === skill.description && flavor === skill.flavor
    ? skill
    : { ...skill, description, flavor };
}

/**
 * MQ.12: after an event, every skill copy that is new, changed rarity, or
 * whose entry is in `touched`, takes its entry's text (unless hand-edited).
 * Returns `after` itself when nothing changes.
 */
export function syncCharacterSkills(
  rules: RulesConfig,
  before: Character | undefined,
  after: Character,
  library: Readonly<Record<string, SkillDef>>,
  touched: readonly SkillDef[],
): Character {
  const had = new Map(before?.skills.map((s) => [s.name, s.rarity]) ?? []);
  let changed = false;
  const skills = after.skills.map((skill) => {
    const fresh = had.get(skill.name) !== skill.rarity;
    const hit = touched.some((t) => t.rarity === skill.rarity && sameName(t.name, skill.name));
    if (!fresh && !hit) return skill;
    const synced = syncSkillText(skill, entryForSkill(rules, library, skill));
    if (synced !== skill) changed = true;
    return synced;
  });
  return changed ? { ...after, skills } : after;
}

/** Fills a granted skill's empty description and flavour from its library entry. */
export function fillSkillText(skill: CharacterSkill, def: SkillDef | undefined): CharacterSkill {
  if (!def) return skill;
  const description = skill.description ?? (def.description.trim() || null);
  const flavor = skill.flavor ?? (def.flavor.trim() || null);
  return description === skill.description && flavor === skill.flavor
    ? skill
    : { ...skill, description, flavor };
}

/**
 * Fills text for every skill `after` has that `before` did not (by name): the
 * skills an event just granted. Returns `after` itself when nothing changes.
 */
export function fillGrantedSkills(
  before: Character | undefined,
  after: Character,
  library: Readonly<Record<string, SkillDef>>,
): Character {
  const had = new Set(before?.skills.map((s) => s.name) ?? []);
  let changed = false;
  const skills = after.skills.map((skill) => {
    if (had.has(skill.name)) return skill;
    const filled = fillSkillText(skill, librarySkill(library, skill.name));
    if (filled !== skill) changed = true;
    return filled;
  });
  return changed ? { ...after, skills } : after;
}
