import {
  CharacterRuleError,
  gradeIndexOf,
  grantProfession,
  withOfferCard,
  newSkill,
  poolMax,
  raceLevel,
  trackCap,
  type Character,
  type CharacterSkill,
  type StatTrack,
  type TrackDistribution,
} from '../character';
import { gainXp, reshapeClassWeights, type LevelUp } from '../progression';
import type { GradeRules, RulesConfig } from '../rules';
import { markRules, marksAfterRarityChange } from '../skills/model';

/**
 * Skill selections and evolutions (ROADMAP M1.10, DESIGN §2, §3, §6). Pure;
 * rule breaks throw CharacterRuleError, which the reducer turns into
 * rejections.
 *
 * Selection: class levels at each grade's interval grant one pick from a GM
 * menu (DESIGN §3); the last selection of a grade is its capstone and its
 * menu must offer the grade's rarity ceiling (§6).
 *
 * Evolution: available when the gate track (race or class level, config
 * `tracks.evolutionGate`) reaches the top of the grade; the GM releases it with
 * options; the player (or GM) chooses one; the character moves to the next
 * grade, the option's skill transforms and spread reshape apply, a profession
 * offered at the unlock grade starts at the current class level, and banked XP
 * then applies at the new grade.
 */

export type SelectionKind = 'class' | 'profession';

/** One skill on a selection menu. */
export interface SkillOption {
  readonly name: string;
  readonly rarity: string;
  /** "profession" options appear only once a profession exists (DESIGN §6). */
  readonly kind: SelectionKind;
  readonly description: string;
}

/** A selection the GM has offered at a class level; `chosen` names the pick. */
export interface SelectionRecord {
  readonly level: number;
  readonly options: readonly SkillOption[];
  readonly chosen: string | null;
  /** Id of the offer event; a choice names it, so undoing a re-offer cannot re-aim a pick. */
  readonly offerId: string;
  /**
   * Unchosen options of this menu the GM withdrew afterwards (MQ.3, DESIGN §6):
   * they no longer appear as passed-over options. Absent when none, so states
   * from before MQ.3 are unchanged.
   */
  readonly withdrawn?: readonly string[];
}

/** One skill an evolution option rewrites (DESIGN §6 "Evolutions transform 1–2 skills"). */
export interface SkillTransform {
  /** Official name of the existing skill. */
  readonly skill: string;
  /** New official name (may equal the old one). */
  readonly name: string;
  /** New rarity: not below the old one, not above the new grade's ceiling. */
  readonly rarity: string;
  /**
   * A second skill this transform merges in (M5.2, DESIGN §6 "the evolution
   * builder prompts the GM to offer that merge"): consumed on choosing, with
   * the usual merge rules. Absent on plain transforms and older releases.
   */
  readonly merge?: string | undefined;
}

/** Times two skills were logged together (the merge alert's count). */
export type JointUses = (a: string, b: string) => number;

export interface EvolutionOption {
  readonly id: string;
  /** Class name after evolving (may be unchanged). */
  readonly className: string;
  readonly description: string;
  readonly transforms: readonly SkillTransform[];
  /** Reshaped class stat weights (DESIGN §4), or null to keep the current ones. */
  readonly classWeights: Readonly<Record<string, number>> | null;
  /** One-time stat bonus the GM sets as the System, added to base stats on choosing (D98). */
  readonly statBonus: Readonly<Record<string, number>>;
}

/**
 * A kept skill's rarity after the evolution (MR.1, MT.1; DESIGN §6
 * "Evolutions re-rate skills"): set per skill by the GM, who approves the list.
 */
export interface SkillRerate {
  readonly skill: string;
  readonly rarity: string;
}

/** An evolution the GM has released and the player has not chosen yet. */
export interface PendingEvolution {
  /** Grade the character evolves into. */
  readonly toGrade: string;
  /** Id of the release event; a choice names it (see SelectionRecord.offerId). */
  readonly releaseId: string;
  readonly options: readonly EvolutionOption[];
  /** Professions offered at the unlock grade (empty otherwise, or when none is offered). */
  readonly professions: readonly string[];
  /**
   * New rarity of each skill the chosen option does not transform (MR.1).
   * Absent on releases stored before MR.1, which re-rate nothing.
   */
  readonly rerate?: readonly SkillRerate[];
  /**
   * The GM approved the re-rating (MT.1, L19): a skill the list does not name
   * keeps its rarity. Absent on releases stored before MT.1, whose unnamed
   * skills take MR.1's one-step drop, so older logs replay unchanged.
   */
  readonly rerateApproved?: true;
  /**
   * MT.7 GM override: released with a skill selection pending, so the choice
   * skips that check too. Absent = false.
   */
  readonly override?: true;
  /**
   * ME.2 (DESIGN §2): the class, profession and race steps; absent on releases
   * stored before ME.2, which stay one choice.
   */
  readonly steps?: {
    readonly class: readonly ReleasedStepOption[];
    readonly profession: readonly ReleasedStepOption[];
    readonly race: readonly ReleasedStepOption[];
  };
  /**
   * ME.6 (a): the release was built for a character without a profession, so
   * its profession step holds offers. Derived when the release is folded (not
   * stored in the event), so older logs replay unchanged. Absent = false.
   */
  readonly professionOffered?: true;
}

/** ME.2: a released step option as stored on the pending evolution. */
export interface ReleasedStepOption extends EvolutionStepOption {
  readonly rarity: string;
  readonly description: string;
  readonly transforms: readonly SkillTransform[];
}

/** A class level that grants a selection (DESIGN §3). */
export interface SelectionSlot {
  readonly level: number;
  /** Grade whose level range holds this level. */
  readonly grade: string;
  /** Last selection of its grade: the menu must reach the grade's rarity ceiling. */
  readonly capstone: boolean;
}

const lower = (s: string) => s.trim().toLowerCase();

/** Every selection level up to the campaign cap, in order (29 with the defaults). */
export function selectionSlots(rules: RulesConfig): SelectionSlot[] {
  const out: SelectionSlot[] = [];
  let bottom = 1;
  for (const grade of rules.grades) {
    const top = Math.min(grade.topLevel, rules.campaign.levelCap);
    const interval = grade.selectionInterval;
    const levels: number[] = [];
    if (interval !== null) {
      for (let l = Math.ceil(bottom / interval) * interval; l <= top; l += interval) levels.push(l);
    }
    levels.forEach((level, i) =>
      out.push({ level, grade: grade.id, capstone: i === levels.length - 1 }),
    );
    bottom = grade.topLevel + 1;
    if (grade.topLevel >= rules.campaign.levelCap) break;
  }
  return out;
}

/** The selection granted at a class level, or null. */
export function selectionAt(rules: RulesConfig, level: number): SelectionSlot | null {
  return selectionSlots(rules).find((s) => s.level === level) ?? null;
}

/** Selection levels the character has reached and not chosen yet (offered or not). */
export function dueSelections(rules: RulesConfig, character: Character): SelectionSlot[] {
  const chosen = new Set(character.selections.filter((s) => s.chosen !== null).map((s) => s.level));
  return selectionSlots(rules).filter(
    (s) => s.level <= character.classLevel && !chosen.has(s.level),
  );
}

function rarityIndex(rules: RulesConfig, rarity: string): number {
  const index = rules.skills.rarities.findIndex((r) => r.id === rarity);
  if (index === -1) throw new CharacterRuleError(`Unknown rarity "${rarity}"`);
  if (rules.skills.rarities[index]?.reserved) {
    throw new CharacterRuleError(`Rarity "${rarity}" is reserved`);
  }
  return index;
}

const gradeRules = (rules: RulesConfig, id: string): GradeRules =>
  rules.grades[gradeIndexOf(rules, id)] as GradeRules;

/**
 * Throws unless `name` is free for a new skill: not a current skill (other than
 * `except`) and not a name the character's practice log still counts (a
 * merged-away skill), since skill-pair counts are keyed by name (D63).
 */
function checkFreeName(
  character: Character,
  name: string,
  history: ReadonlySet<string>,
  except: string | null = null,
): void {
  const key = lower(name);
  if (except !== null && key === lower(except)) return;
  if (character.skills.some((s) => lower(s.name) === key)) {
    throw new CharacterRuleError(`${character.name} already has a skill "${name}"`);
  }
  if (history.has(key)) {
    throw new CharacterRuleError(`"${name}" was a skill of ${character.name}'s; pick a new name`);
  }
}

/**
 * GM override (MT.7, DESIGN §7): gives a skill outside the selection schedule,
 * at any non-reserved rarity, past the grade ceiling and without a capstone
 * menu. The name must still be free (pair counts are keyed by name, D63), and
 * a profession skill needs a profession.
 */
export function grantSkill(
  rules: RulesConfig,
  character: Character,
  skill: {
    readonly name: string;
    readonly rarity: string;
    readonly kind: CharacterSkill['kind'];
    readonly description?: string | null | undefined;
    readonly flavor?: string | null | undefined;
  },
  history: ReadonlySet<string>,
): Character {
  const name = skill.name.trim();
  if (name === '') throw new CharacterRuleError('The skill needs a name');
  const rarity = rules.skills.rarities.find((r) => r.id === skill.rarity);
  if (!rarity) throw new CharacterRuleError(`Unknown rarity "${skill.rarity}"`);
  if (rarity.reserved) throw new CharacterRuleError(`Rarity "${skill.rarity}" is reserved`);
  if (skill.kind === 'profession' && character.profession === null) {
    throw new CharacterRuleError(`${character.name} has no profession for [${name}]`);
  }
  // QF.39: the starting race skill (Identify) can always be given back to a
  // character missing it, even though the practice log still counts its name.
  const start = rules.skills.startingRaceSkill;
  const restoring = skill.kind === 'race' && lower(name) === lower(start.name);
  checkFreeName(character, name, restoring ? new Set() : history);
  return {
    ...character,
    skills: [
      ...character.skills,
      newSkill(name, skill.rarity, skill.kind, {
        description: skill.description,
        flavor: skill.flavor,
      }),
    ],
  };
}

/** Lower-cased skill names in practice entries that are no longer current skills. */
export function retiredSkillNames(
  character: Character,
  practiceSkillNames: Iterable<string>,
): Set<string> {
  const current = new Set(character.skills.map((s) => lower(s.name)));
  const out = new Set<string>();
  for (const name of practiceSkillNames) if (!current.has(lower(name))) out.add(lower(name));
  return out;
}

/**
 * The GM offers (or re-offers) the menu for a reached selection level
 * (DESIGN §3, §6): `menuSize` options, each at or below the level's grade
 * ceiling, at least one at the ceiling for a capstone, profession options only
 * once a profession exists, names new to the character.
 */
export function offerSelection(
  rules: RulesConfig,
  character: Character,
  level: number,
  options: readonly SkillOption[],
  retired: ReadonlySet<string> = new Set(),
  offerId = `offer-${level}`,
): Character {
  const slot = selectionAt(rules, level);
  if (!slot) throw new CharacterRuleError(`Class level ${level} grants no skill selection`);
  if (level > character.classLevel) {
    throw new CharacterRuleError(
      `${character.name} has not reached class level ${level} (is ${character.classLevel})`,
    );
  }
  const existing = character.selections.find((s) => s.level === level);
  if (existing !== undefined && existing.chosen !== null) {
    throw new CharacterRuleError(`The level ${level} selection was already chosen`);
  }
  const { min, max } = rules.skills.menuSize;
  if (options.length < min || options.length > max) {
    throw new CharacterRuleError(
      `A selection menu has ${min}–${max} options (got ${options.length})`,
    );
  }
  const grade = gradeRules(rules, slot.grade);
  const ceiling = rarityIndex(rules, grade.rarityCeiling);
  const names = new Set<string>();
  let reachesCeiling = false;
  for (const option of options) {
    const name = option.name.trim();
    if (name === '') throw new CharacterRuleError('Every option needs a name');
    if (names.has(lower(name))) throw new CharacterRuleError(`"${name}" is on the menu twice`);
    names.add(lower(name));
    checkFreeName(character, name, retired);
    const taken = character.evolution?.options.some((o) =>
      o.transforms.some((t) => lower(t.name) === lower(name) && lower(t.skill) !== lower(name)),
    );
    if (taken) {
      throw new CharacterRuleError(`"${name}" is a skill name in the released evolution`);
    }
    const rank = rarityIndex(rules, option.rarity);
    if (rank > ceiling) {
      throw new CharacterRuleError(
        `[${name}] is above the ${grade.id}-grade ceiling (${grade.rarityCeiling})`,
      );
    }
    if (rank === ceiling) reachesCeiling = true;
    if (option.kind === 'profession' && character.profession === null) {
      throw new CharacterRuleError(`${character.name} has no profession for [${name}]`);
    }
  }
  if (slot.capstone && !reachesCeiling) {
    throw new CharacterRuleError(
      `Level ${level} is the ${grade.id}-grade capstone: offer at least one ${grade.rarityCeiling} option`,
    );
  }
  const record: SelectionRecord = {
    level,
    options: options.map((o) => ({ ...o, name: o.name.trim() })),
    chosen: null,
    offerId,
  };
  const selections = [...character.selections.filter((s) => s.level !== level), record].sort(
    (a, b) => a.level - b.level,
  );
  return { ...character, selections };
}

/**
 * Passed-over options (DESIGN §6, D103, MQ.3): options of earlier, chosen
 * selections that were not picked stay eligible for later selections, newest
 * menu first. An option drops out when the character already has (or had)
 * the skill or chose it on any menu, it is above the rarity ceiling of the selection being chosen,
 * it is on that selection's own menu, or it is a profession option and the
 * character has no profession. Pure; derived from the selection records, so
 * logs from before MQ.3 replay unchanged.
 */
export function passedOverOptions(
  rules: RulesConfig,
  character: Character,
  level: number,
  retired: ReadonlySet<string> = new Set(),
): SkillOption[] {
  const slot = selectionAt(rules, level);
  if (!slot) return [];
  const ceiling = rarityIndex(rules, gradeRules(rules, slot.grade).rarityCeiling);
  const record = character.selections.find((s) => s.level === level);
  const seen = new Set((record?.options ?? []).map((o) => lower(o.name)));
  const owned = new Set(character.skills.map((s) => lower(s.name)));
  // A chosen option leaves the list for good (DESIGN §6), even after an
  // evolution transform renames the skill it became (QF.1).
  for (const s of character.selections) if (s.chosen !== null) owned.add(lower(s.chosen));
  const out: SkillOption[] = [];
  const earlier = character.selections
    .filter((s) => s.level < level && s.chosen !== null)
    .sort((a, b) => b.level - a.level);
  for (const r of earlier) {
    const gone = new Set((r.withdrawn ?? []).map(lower));
    for (const o of r.options) {
      const key = lower(o.name);
      if (gone.has(key) || seen.has(key) || owned.has(key) || retired.has(key)) continue;
      if (o.kind === 'profession' && character.profession === null) continue;
      const rank = rules.skills.rarities.findIndex((x) => x.id === o.rarity);
      if (rank === -1 || rank > ceiling) continue;
      seen.add(key);
      out.push(o);
    }
  }
  return out;
}

/**
 * The GM withdraws a passed-over option (DESIGN §6 "withdrawn by the GM",
 * MQ.3): every chosen menu that left it unpicked records the withdrawal, so it
 * no longer appears in later menus. Refused when no chosen menu still holds it
 * unpicked, or when the character already has the skill. A pending menu's own
 * options are changed by offering it again.
 */
export function withdrawPassedOver(character: Character, name: string): Character {
  const key = lower(name);
  if (character.skills.some((s) => lower(s.name) === key)) {
    throw new CharacterRuleError(`${character.name} already has [${name.trim()}]`);
  }
  let hit = false;
  const selections = character.selections.map((r) => {
    if (r.chosen === null || lower(r.chosen) === key) return r;
    const option = r.options.find((o) => lower(o.name) === key);
    if (!option || (r.withdrawn ?? []).some((w) => lower(w) === key)) return r;
    hit = true;
    return { ...r, withdrawn: [...(r.withdrawn ?? []), option.name] };
  });
  if (!hit) {
    throw new CharacterRuleError(
      `[${name.trim()}] is not a passed-over option of ${character.name}`,
    );
  }
  return { ...character, selections };
}

/** The player (or GM) picks one option of an offered selection; the skill is granted. */
export function chooseSelection(
  rules: RulesConfig,
  character: Character,
  level: number,
  name: string,
  retired: ReadonlySet<string> = new Set(),
  offerId: string | null = null,
): Character {
  const index = character.selections.findIndex((s) => s.level === level);
  const record = character.selections[index];
  if (!record) throw new CharacterRuleError(`No selection is offered at level ${level}`);
  if (offerId !== null && offerId !== record.offerId) {
    throw new CharacterRuleError(
      `The level ${level} menu was offered again; choose from the new one`,
    );
  }
  if (record.chosen !== null) {
    throw new CharacterRuleError(`The level ${level} selection was already chosen`);
  }
  // A passed-over option from an earlier menu is a valid pick too (MQ.3).
  const option =
    record.options.find((o) => lower(o.name) === lower(name)) ??
    passedOverOptions(rules, character, level, retired).find((o) => lower(o.name) === lower(name));
  if (!option) throw new CharacterRuleError(`"${name}" is not on the level ${level} menu`);
  // The character may have gained the name since the offer (a transform, a merge).
  checkFreeName(character, option.name, retired);
  if (option.kind === 'profession' && character.profession === null) {
    throw new CharacterRuleError(`${character.name} has no profession for [${name}]`);
  }
  rarityIndex(rules, option.rarity);
  const selections = [...character.selections];
  selections[index] = { ...record, chosen: option.name };
  return {
    ...character,
    selections,
    skills: [
      ...character.skills,
      newSkill(option.name, option.rarity, option.kind, { description: option.description }),
    ],
  };
}

/** The level the evolution gate reads (DESIGN §2, `tracks.evolutionGate`). */
export function gateLevel(rules: RulesConfig, character: Character): number {
  return rules.tracks.evolutionGate === 'class'
    ? character.classLevel
    : raceLevel(rules, character);
}

/**
 * The grade the character can evolve into now, or null: the gate level is at
 * the top of the current grade and a next grade exists below the campaign cap.
 * Availability does not release it; the GM does (DESIGN §3).
 */
export function evolutionTarget(rules: RulesConfig, character: Character): GradeRules | null {
  const index = gradeIndexOf(rules, character.grade);
  const grade = rules.grades[index] as GradeRules;
  const next = rules.grades[index + 1];
  if (!next || grade.topLevel >= rules.campaign.levelCap) return null;
  return gateLevel(rules, character) >= trackCap(rules, grade.id) ? next : null;
}

/**
 * The default re-rating (MR.1, DESIGN §6): every skill drops one rarity, never
 * below the lowest; `overrides` (skill name → rarity) replaces the default for
 * the skills it names. Validation happens on release.
 */
export function defaultRerate(
  rules: RulesConfig,
  character: Character,
  overrides: Readonly<Record<string, string>> = {},
): SkillRerate[] {
  const ids = rules.skills.rarities.map((r) => r.id);
  return character.skills.map((s) => {
    const own = Object.prototype.hasOwnProperty.call(overrides, s.name)
      ? overrides[s.name]
      : undefined;
    if (own !== undefined) return { skill: s.name, rarity: own };
    const index = ids.indexOf(s.rarity);
    return { skill: s.name, rarity: index <= 0 ? s.rarity : (ids[index - 1] as string) };
  });
}

/**
 * The approved re-rating (MT.1, DESIGN §6): every skill at the rarity it has
 * going in, with `overrides` (skill name → rarity) for the ones the GM sets.
 */
export function keptRerate(
  character: Character,
  overrides: Readonly<Record<string, string>> = {},
): SkillRerate[] {
  return character.skills.map((s) => {
    const own = Object.prototype.hasOwnProperty.call(overrides, s.name)
      ? overrides[s.name]
      : undefined;
    return { skill: s.name, rarity: own ?? s.rarity };
  });
}

/**
 * Throws unless every re-rating names a current skill once, at a known rarity
 * no higher than the new grade's ceiling (a skill may keep a rarity above it).
 * Under an approved re-rating (MT.1) a race skill such as Identify is never
 * lowered (DESIGN §6 "Identify never drops").
 */
function checkRerate(
  rules: RulesConfig,
  character: Character,
  toGrade: GradeRules,
  rerate: readonly SkillRerate[],
  approved: boolean,
): void {
  const ceiling = rarityIndex(rules, toGrade.rarityCeiling);
  const seen = new Set<string>();
  for (const r of rerate) {
    const skill = character.skills.find((s) => s.name === r.skill);
    if (!skill) throw new CharacterRuleError(`${character.name} has no skill "${r.skill}"`);
    if (seen.has(r.skill)) throw new CharacterRuleError(`[${r.skill}] is re-rated twice`);
    seen.add(r.skill);
    const rank = rarityIndex(rules, r.rarity);
    if (approved && skill.kind === 'race' && rank < rarityIndex(rules, skill.rarity)) {
      throw new CharacterRuleError(`[${r.skill}] is a race skill and never drops a rarity`);
    }
    if (rank > ceiling && rank > rarityIndex(rules, skill.rarity)) {
      throw new CharacterRuleError(
        `[${r.skill}] cannot be raised above the ${toGrade.id}-grade ceiling (${toGrade.rarityCeiling})`,
      );
    }
  }
}

/**
 * MT.1 review: Identify never drops (DESIGN §6), so under an approved release
 * no option may merge a race skill away or rename it.
 */
function checkRaceSkillsKept(character: Character, option: EvolutionOption): void {
  // A transform to a lower rarity is already refused for every skill (checkOption).
  const race = new Set(character.skills.filter((s) => s.kind === 'race').map((s) => s.name));
  for (const t of option.transforms) {
    if (t.merge === undefined) continue;
    const gone = race.has(t.merge) ? t.merge : race.has(t.skill) ? t.skill : null;
    if (gone !== null) {
      throw new CharacterRuleError(
        `[${gone}] is a race skill and cannot be merged away at evolution`,
      );
    }
  }
}

/** Renaming a race skill loses it too: Identify is found by name (MT.1 round 2). */
function checkRaceSkillsNamed(character: Character, option: EvolutionOption): void {
  for (const t of option.transforms) {
    const skill = character.skills.find((s) => s.name === t.skill);
    if (t.merge === undefined && skill?.kind === 'race' && t.name.trim() !== t.skill) {
      throw new CharacterRuleError(`[${t.skill}] is a race skill and keeps its name at evolution`);
    }
  }
}

/** Throws unless the option can apply to the character evolving into `toGrade`. */
function checkOption(
  rules: RulesConfig,
  character: Character,
  toGrade: GradeRules,
  option: EvolutionOption,
  retired: ReadonlySet<string>,
  joint: JointUses,
): void {
  if (option.className.trim() === '') throw new CharacterRuleError('An option needs a class name');
  const { min, max } = rules.skills.evolutionTransforms;
  const count = option.transforms.length;
  if (count < min || count > max) {
    throw new CharacterRuleError(
      `Option "${option.id}" transforms ${count} skills (an evolution transforms ${min}–${max})`,
    );
  }
  const ceiling = rarityIndex(rules, toGrade.rarityCeiling);
  const from = new Set<string>();
  const to = new Set<string>();
  const merges = option.transforms.filter((t) => t.merge !== undefined).length;
  if (merges > 0) checkMergeAllowance(rules, character, merges);
  for (const t of option.transforms) {
    const skill = character.skills.find((s) => s.name === t.skill);
    if (!skill) throw new CharacterRuleError(`${character.name} has no skill "${t.skill}"`);
    if (from.has(t.skill)) throw new CharacterRuleError(`[${t.skill}] is transformed twice`);
    from.add(t.skill);
    const name = t.name.trim();
    if (name === '') throw new CharacterRuleError(`[${t.skill}] needs a new name`);
    const partner = t.merge === undefined ? null : checkMergePartner(rules, character, t, joint);
    if (partner !== null) {
      if (from.has(partner.name)) {
        throw new CharacterRuleError(`[${partner.name}] is transformed twice`);
      }
      from.add(partner.name);
    }
    if (to.has(lower(name))) throw new CharacterRuleError(`Two transforms are named "${name}"`);
    to.add(lower(name));
    // Renaming onto another transformed skill's old name is refused too (simpler to read).
    checkFreeName(character, name, retired, t.skill);
    for (const menu of lower(name) === lower(t.skill) ? [] : character.selections) {
      if (menu.chosen === null && menu.options.some((o) => lower(o.name) === lower(name))) {
        throw new CharacterRuleError(
          `"${name}" is on the pending level ${menu.level} menu; re-offer that menu or pick another name`,
        );
      }
    }
    const rank = rarityIndex(rules, t.rarity);
    if (partner !== null) {
      // DESIGN §6: the merged skill is `rarityStepsAboveHigher` above the higher.
      const want =
        Math.max(rarityIndex(rules, skill.rarity), rarityIndex(rules, partner.rarity)) +
        rules.skills.merge.rarityStepsAboveHigher;
      if (rank === want && rules.skills.rarities[want]?.reserved) {
        throw new CharacterRuleError(`[${name}] would be a reserved rarity (${t.rarity})`);
      }
      if (rank !== want) {
        const at = rules.skills.rarities[want];
        if (at?.reserved) {
          throw new CharacterRuleError(`[${name}] would be a reserved rarity (${at.id})`);
        }
        throw new CharacterRuleError(
          `[${name}] must be ${at ? at.id : 'one rarity above the higher of the two'} (one above the higher merged skill)`,
        );
      }
    } else if (rank < rarityIndex(rules, skill.rarity)) {
      throw new CharacterRuleError(`[${t.skill}] cannot drop to a lower rarity`);
    }
    if (rank > ceiling) {
      throw new CharacterRuleError(
        `[${name}] is above the ${toGrade.id}-grade ceiling (${toGrade.rarityCeiling})`,
      );
    }
  }
  if (option.classWeights !== null) reshapeClassWeights(rules, character, option.classWeights);
}

/** Merges at the current grade so far, plus these, stay within the per-grade limit. */
function checkMergeAllowance(rules: RulesConfig, character: Character, adding: number): void {
  const done = Object.prototype.hasOwnProperty.call(character.merges, character.grade)
    ? (character.merges[character.grade] ?? 0)
    : 0;
  if (done + adding > rules.skills.merge.maxPerCharacterPerGrade) {
    throw new CharacterRuleError(
      `${character.name} can merge ${rules.skills.merge.maxPerCharacterPerGrade} time(s) per grade (${done} done at ${character.grade}-grade)`,
    );
  }
}

/** The skill a merge transform consumes, checked against the merge rules (DESIGN §6). */
function checkMergePartner(
  rules: RulesConfig,
  character: Character,
  t: SkillTransform,
  joint: JointUses,
): CharacterSkill {
  const other = character.skills.find((s) => s.name === t.merge);
  if (!other) throw new CharacterRuleError(`${character.name} has no skill "${t.merge}"`);
  if (other.name === t.skill) throw new CharacterRuleError('Merge two different skills');
  const first = character.skills.find((s) => s.name === t.skill) as CharacterSkill;
  const { merge } = rules.skills;
  for (const s of [first, other]) {
    if (rarityIndex(rules, s.rarity) < rarityIndex(rules, merge.minRarity)) {
      throw new CharacterRuleError(`[${s.name}] must be at least ${merge.minRarity} to merge`);
    }
  }
  const uses = joint(t.skill, other.name);
  if (uses < merge.requiredJointUses) {
    throw new CharacterRuleError(
      `[${t.skill}] and [${other.name}] were logged together ${uses} times (need ${merge.requiredJointUses})`,
    );
  }
  // Practice-log pair counts are keyed by name, so a merged skill takes a new one.
  const name = lower(t.name);
  if (name === lower(t.skill) || name === lower(other.name)) {
    throw new CharacterRuleError(`The merged skill needs a new name, not [${t.name.trim()}]`);
  }
  return other;
}

/**
 * The GM releases an available evolution with 1–`menuSize.max` options and,
 * at the profession unlock grade for a character without one, the professions
 * offered (may be empty: the GM can grant one later). Re-releasing replaces a
 * pending release.
 */
export function releaseEvolution(
  rules: RulesConfig,
  character: Character,
  options: readonly EvolutionOption[],
  professions: readonly string[],
  retired: ReadonlySet<string> = new Set(),
  releaseId = 'release',
  legacy = false,
  /** Per-skill rarities after the evolution (MR.1); null on older releases. */
  rerate: readonly SkillRerate[] | null = null,
  /** Joint uses for merge transforms (M5.2); none counted by default. */
  joint: JointUses = () => 0,
  /** The GM approved the re-rating (MT.1); unnamed skills keep their rarity. */
  rerateApproved = false,
  /** MT.7 GM override: release with a skill selection pending. */
  override = false,
): Character {
  if (!legacy && !override) checkNoPendingSelection(rules, character, 'released');
  const target = evolutionTarget(rules, character);
  if (!target) {
    const top = trackCap(rules, character.grade);
    throw new CharacterRuleError(
      `${character.name} cannot evolve yet (${rules.tracks.evolutionGate} level ${gateLevel(rules, character)} of ${top})`,
    );
  }
  const most = rules.skills.menuSize.max;
  if (options.length < 1 || options.length > most) {
    throw new CharacterRuleError(`An evolution has 1–${most} options (got ${options.length})`);
  }
  const ids = new Set(options.map((o) => o.id));
  if (ids.size !== options.length) throw new CharacterRuleError('Two options share an id');
  for (const option of options) {
    if (rerateApproved) checkRaceSkillsKept(character, option);
    checkOption(rules, character, target, option, retired, joint);
    checkStatBonus(rules, option);
    if (rerateApproved) checkRaceSkillsNamed(character, option);
  }
  if (rerate !== null) checkRerate(rules, character, target, rerate, rerateApproved);
  // From the unlock grade on, a character without a profession can be offered
  // some (MQ.6): at the unlock evolution, or at a later one after "none for now".
  const unlock =
    character.profession === null &&
    gradeIndexOf(rules, target.id) >= gradeIndexOf(rules, rules.tracks.professionUnlockGrade);
  if (!unlock && professions.length > 0) {
    throw new CharacterRuleError(
      `Professions are offered from the ${rules.tracks.professionUnlockGrade}-grade evolution on, to a character without one`,
    );
  }
  const trimmed = professions.map((p) => p.trim());
  if (trimmed.some((p) => p === '')) throw new CharacterRuleError('A profession needs a name');
  if (new Set(trimmed.map(lower)).size !== trimmed.length) {
    throw new CharacterRuleError('A profession is offered twice');
  }
  return {
    ...character,
    evolution: {
      toGrade: target.id,
      releaseId,
      options: options.map((o) => ({
        ...o,
        className: o.className.trim(),
        statBonus: o.statBonus ?? {},
      })),
      professions: trimmed,
      ...(rerate === null ? {} : { rerate: rerate.map((r) => ({ ...r })) }),
      ...(rerateApproved ? { rerateApproved: true as const } : {}),
      ...(override ? { override: true as const } : {}),
    },
  };
}

export interface EvolutionResult {
  readonly character: Character;
  /** Skill renames [old, new] the practice log must follow. */
  readonly renames: readonly (readonly [string, string])[];
  readonly levelUps: readonly LevelUp[];
}

/**
 * The player (or GM) chooses a released option: new grade, class name, skill
 * transforms (marks reset; nickname, Unique tag and mark history kept), spread
 * reshape, the chosen profession at the current class level, then banked XP
 * applied at the new grade.
 */
export function chooseEvolution(
  rules: RulesConfig,
  character: Character,
  optionId: string,
  profession: string | null,
  retired: ReadonlySet<string> = new Set(),
  releaseId: string | null = null,
  legacy = false,
  joint: JointUses = () => 0,
  choices: StepChoices | null = null,
): EvolutionResult {
  const pending = character.evolution;
  if (!pending) throw new CharacterRuleError(`No evolution is released for ${character.name}`);
  if (!legacy && pending.override !== true) checkNoPendingSelection(rules, character, 'chosen');
  if (releaseId !== null && releaseId !== pending.releaseId) {
    throw new CharacterRuleError('The evolution was released again; choose from the new options');
  }
  const picked = pickSteps(character, pending, choices);
  const single = pending.options.find((o) => o.id === optionId);
  if (!single) throw new CharacterRuleError(`No evolution option "${optionId}"`);
  // ME.2: the three chosen options' transforms and one-time bonuses apply together.
  const option: EvolutionOption = picked === null ? single : combineSteps(single, picked);
  const target = evolutionTarget(rules, character);
  if (!target || target.id !== pending.toGrade) {
    throw new CharacterRuleError(
      `${character.name} can no longer evolve to ${pending.toGrade}-grade`,
    );
  }
  checkOption(rules, character, target, option, retired, joint);
  // "None for now" (null) is always allowed; the offers stay on the character
  // and can be taken later from the Professions tab (MQ.6, DESIGN §2).
  if (pending.professions.length > 0) {
    if (profession !== null && !pending.professions.includes(profession)) {
      throw new CharacterRuleError(`"${profession}" is not an offered profession`);
    }
  } else if (profession !== null) {
    throw new CharacterRuleError('No profession is offered with this evolution');
  }
  // Taken from the Professions tab while this release waited: the list is
  // locked, so the release's offers no longer apply (MQ.6 review).
  const hasProfession = character.profession !== null;
  if (hasProfession && profession !== null) {
    throw new CharacterRuleError(
      `${character.name} already has the profession [${character.profession}]; evolve with none`,
    );
  }

  const byName = new Map(option.transforms.map((t) => [t.skill, t]));
  // A skill gained after the release (a grant, a merge) keeps its rarity
  // under an approved re-rating (MT.1) and takes MR.1's default drop under an
  // older release; releases stored before MR.1 re-rate nothing (MR.1 review).
  const rerated =
    pending.rerate === undefined
      ? new Map<string, string>()
      : pending.rerateApproved === true
        ? new Map(pending.rerate.map((r) => [r.skill, r.rarity]))
        : new Map(
            defaultRerate(
              rules,
              character,
              Object.fromEntries(pending.rerate.map((r) => [r.skill, r.rarity])),
            ).map((r) => [r.skill, r.rarity]),
          );
  const marking = markRules(rules);
  // Skills a merge transform consumes (M5.2): the originals are gone.
  const consumed = new Set(
    option.transforms.flatMap((t) => (t.merge === undefined ? [] : [t.merge])),
  );
  const transformSkill = (s: CharacterSkill, t: SkillTransform): CharacterSkill => {
    // A merge is a new skill, as `skill.merge` makes it: no nickname, Unique
    // tag, marks or mark sessions carry over (DESIGN §6, D168).
    if (t.merge !== undefined) return newSkill(t.name.trim(), t.rarity, s.kind);
    // A rarity gain spends the banked marks as that many upgrades would, and
    // the rest carry on (MQ.4, D114); a transform that keeps the rarity keeps
    // them (DESIGN §6: they bank until the evolution).
    const marks = marksAfterRarityChange(marking, s.rarity, t.rarity, s.marks);
    // A renamed skill is a new skill to the System: the old text would
    // describe the wrong thing, so it clears until the GM writes new text (M3.5).
    const name = t.name.trim();
    // Its hand-written mark goes too, so library text can reach it (MQ.12).
    // A transform takes its new rarity's library text (MQ.A), not a re-rated one.
    const { textRarity, ...plain } = s;
    void textRarity;
    const kept: CharacterSkill = { ...plain, name, rarity: t.rarity, marks };
    if (name === s.name) return kept;
    const { textEdited, ...fresh } = kept;
    void textEdited;
    return { ...fresh, description: null, flavor: null };
  };
  const skills: CharacterSkill[] = character.skills.flatMap((s) => {
    if (consumed.has(s.name)) return [];
    const t = byName.get(s.name);
    if (!t) return [rerateSkill(s, rerated.get(s.name))];
    return [transformSkill(s, t)];
  });
  let next: Character = {
    ...character,
    ...(consumed.size === 0
      ? {}
      : {
          merges: {
            ...character.merges,
            [character.grade]:
              (Object.prototype.hasOwnProperty.call(character.merges, character.grade)
                ? (character.merges[character.grade] ?? 0)
                : 0) + consumed.size,
          },
        }),
    grade: target.id,
    className: option.className,
    skills,
    evolution: null,
    professionOffers: hasProfession
      ? character.professionOffers
      : mergeOffers(character.professionOffers, pending.professions),
  };
  if (option.classWeights !== null) next = reshapeClassWeights(rules, next, option.classWeights);
  if (!legacy) next = applyStatBonus(next, option.statBonus ?? {});
  if (profession !== null) next = grantProfession(rules, next, profession);
  if (picked !== null) next = applySteps(rules, next, pending, picked);
  const levelUps: LevelUp[] = [];
  // Spends XP banked at the old top (banking rules only); with `xp.overflow`
  // on, capped tracks hold 0 XP, so these are no-ops (MQ.11).
  const cls = gainXp(rules, next, 'class', 0);
  next = cls.character;
  levelUps.push(...cls.levelUps);
  if (next.profession !== null) {
    const prof = gainXp(rules, next, 'profession', 0);
    next = prof.character;
    levelUps.push(...prof.levelUps);
  }
  // Evolution refills every pool (D99); level-ups alone never do.
  if (!legacy) next = { ...next, pools: fullPools(rules, next.stats) };
  const renames = option.transforms
    .filter((t) => t.name.trim() !== t.skill)
    .map((t) => [t.skill, t.name.trim()] as const);
  return { character: next, renames, levelUps };
}

/**
 * A kept skill takes its re-rated label (MR.1): marks, text and effects stay,
 * so its text keeps following the entry of the rarity it had (`textRarity`).
 */
function rerateSkill(skill: CharacterSkill, rarity: string | undefined): CharacterSkill {
  if (rarity === undefined || rarity === skill.rarity) return skill;
  const textRarity = skill.textRarity ?? skill.rarity;
  const { textRarity: _old, ...rest } = skill;
  void _old;
  return rarity === textRarity ? { ...rest, rarity } : { ...rest, rarity, textRarity };
}

/**
 * MR.A: a release stores each skill's new rarity, worked out from the rarity
 * it had then. When an event changes a listed skill's rarity while the
 * evolution is pending (an upgrade by marks, say), that entry no longer
 * describes the skill, so it leaves the list and the skill takes the default
 * one-step drop from its new rarity at choose. Returns `after` itself when
 * nothing changes.
 */
export function dropStaleRerates(before: Character | undefined, after: Character): Character {
  const rerate = after.evolution?.rerate;
  if (!before || !after.evolution || rerate === undefined) return after;
  const was = new Map(before.skills.map((s) => [s.name, s.rarity]));
  const now = new Map(after.skills.map((s) => [s.name, s.rarity]));
  const kept = rerate.filter((r) => !was.has(r.skill) || was.get(r.skill) === now.get(r.skill));
  return kept.length === rerate.length
    ? after
    : { ...after, evolution: { ...after.evolution, rerate: kept } };
}

/** Earlier offers first, then new names not already offered (ignoring case). */
function mergeOffers(was: readonly string[], offered: readonly string[]): readonly string[] {
  const seen = new Set(was.map(lower));
  const added = offered.filter((p) => !seen.has(lower(p)));
  return added.length === 0 ? was : [...was, ...added];
}

/** An evolution waits for every earned selection to be chosen (DESIGN §2, D103). */
function checkNoPendingSelection(
  rules: RulesConfig,
  character: Character,
  verb: 'released' | 'chosen',
): void {
  const due = dueSelections(rules, character);
  if (due.length === 0) return;
  const levels = due.map((s) => s.level).join(', ');
  throw new CharacterRuleError(
    `${character.name} has a skill selection to choose first (class level ${levels}); an evolution cannot be ${verb} until then`,
  );
}

/** Bonus stats must be real stats with whole, non-negative values (D98). */
function checkStatBonus(rules: RulesConfig, option: EvolutionOption): void {
  const ids = new Set(rules.stats.list.map((s) => s.id));
  for (const [stat, value] of Object.entries(option.statBonus ?? {})) {
    if (!ids.has(stat)) throw new CharacterRuleError(`Unknown stat "${stat}" in the stat bonus`);
    if (!Number.isInteger(value) || value < 0) {
      throw new CharacterRuleError(`The ${stat} bonus must be a whole number of 0 or more`);
    }
  }
}

function applyStatBonus(character: Character, bonus: Readonly<Record<string, number>>): Character {
  const entries = Object.entries(bonus).filter(([, v]) => v > 0);
  if (entries.length === 0) return character;
  const stats = { ...character.stats };
  for (const [stat, value] of entries) stats[stat] = (stats[stat] ?? 0) + value;
  return { ...character, stats };
}

function fullPools(
  rules: RulesConfig,
  stats: Readonly<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pool of rules.pools) out[pool.id] = poolMax(rules, stats, pool.id);
  return out;
}

/** ME.2 (DESIGN §2): one option in a step of a three-step evolution. */
export interface EvolutionStepOption {
  readonly id: string;
  readonly name: string;
  readonly distribution: {
    readonly stats: Readonly<Record<string, number>>;
    readonly free: number;
  };
  readonly statBonus: Readonly<Record<string, number>>;
}

/**
 * ME.2 "Equal totals": the reasons a step cannot be released. Every option's
 * per-level total (stats plus free points) must equal the step's budget at the
 * new grade, and one-time bonus totals must be equal within the step. Empty
 * when the step is fine; the GM's Override releases anyway (the caller decides).
 */
export function stepBudgetProblems(
  step: string,
  budget: number,
  options: readonly EvolutionStepOption[],
): string[] {
  const sum = (r: Readonly<Record<string, number>>) => Object.values(r).reduce((a, b) => a + b, 0);
  const problems: string[] = [];
  for (const o of options) {
    const total = sum(o.distribution.stats) + o.distribution.free;
    if (total !== budget) {
      problems.push(`${step} option "${o.name}" gives ${total} points per level, not ${budget}`);
    }
  }
  const bonuses = options.map((o) => sum(o.statBonus));
  if (new Set(bonuses).size > 1) {
    problems.push(
      `${step} options have unequal one-time bonuses (${bonuses.join(', ')}); make them equal or tick Override`,
    );
  }
  return problems;
}

/** ME.2: the option chosen in each step (profession null = "none for now"). */
export interface StepChoices {
  readonly class: string;
  readonly profession: string | null;
  readonly race: string;
}

interface PickedSteps {
  readonly class: ReleasedStepOption;
  readonly profession: ReleasedStepOption | null;
  readonly race: ReleasedStepOption;
}

/**
 * ME.2: finds the chosen option of each step, or null for a single-choice
 * release. A three-step release needs all three choices and a single-choice
 * one takes none; a character with a profession must evolve it.
 */
function pickSteps(
  character: Character,
  pending: PendingEvolution,
  choices: StepChoices | null,
): PickedSteps | null {
  const steps = pending.steps;
  if (steps === undefined) {
    if (choices !== null) {
      throw new CharacterRuleError('This evolution is a single choice; choose one option');
    }
    return null;
  }
  if (choices === null) {
    throw new CharacterRuleError('Choose a class, a profession (or none for now) and a race');
  }
  const find = (list: readonly ReleasedStepOption[], id: string, step: string) => {
    const found = list.find((o) => o.id === id);
    if (!found) throw new CharacterRuleError(`No ${step} option "${id}"`);
    return found;
  };
  let profession: ReleasedStepOption | null = null;
  // ME.6 (a): a profession gained after a release that offered professions
  // makes those offers void; the profession then stays as it is.
  const keepsProfession =
    character.profession !== null &&
    (pending.professionOffered === true || steps.profession.length === 0);
  if (choices.profession === null) {
    if (character.profession !== null && !keepsProfession) {
      throw new CharacterRuleError(
        `${character.name} has the profession [${character.profession}]: choose how it evolves`,
      );
    }
  } else {
    if (character.profession !== null && pending.professionOffered === true) {
      throw new CharacterRuleError(
        `${character.name} now has the profession [${character.profession}]: the professions offered with this evolution no longer apply, so it stays as it is`,
      );
    }
    profession = find(steps.profession, choices.profession, 'profession');
  }
  return {
    class: find(steps.class, choices.class, 'class'),
    profession,
    race: find(steps.race, choices.race, 'race'),
  };
}

function sumBonuses(list: readonly Readonly<Record<string, number>>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const bonus of list) {
    for (const [stat, value] of Object.entries(bonus)) out[stat] = (out[stat] ?? 0) + value;
  }
  return out;
}

/**
 * ME.2 (DESIGN §2): the chosen steps take effect: each track's distribution at
 * the new grade, the race's new name, the profession taken or evolved (a new
 * one starts at the class level), and, with "none for now", the profession
 * options stay as offers for later.
 */
function applySteps(
  rules: RulesConfig,
  character: Character,
  pending: PendingEvolution,
  picked: PickedSteps,
): Character {
  const dist = (o: ReleasedStepOption): TrackDistribution => ({
    stats: { ...o.distribution.stats },
    free: o.distribution.free,
  });
  const distributions: Partial<Record<StatTrack, TrackDistribution>> = {
    class: dist(picked.class),
    race: dist(picked.race),
  };
  if (picked.profession !== null) distributions.profession = dist(picked.profession);
  else if (character.profession !== null && character.distributions?.profession) {
    // ME.6 (a): the held profession stays unchanged, its distribution too.
    distributions.profession = character.distributions.profession;
  }
  let next: Character = { ...character, race: picked.race.name.trim(), distributions };
  if (picked.profession === null) {
    if (character.profession !== null) return next;
    const options = pending.steps?.profession ?? [];
    next = {
      ...next,
      professionOffers: mergeOffers(
        next.professionOffers,
        options.map((o) => o.name.trim()),
      ),
    };
    // ME.6 (d): each skipped option keeps its distribution and bonus with the offer.
    for (const o of options) {
      next = withOfferCard(next, o.name.trim(), {
        distribution: dist(o),
        statBonus: { ...o.statBonus },
      });
    }
    return next;
  }
  const name = picked.profession.name.trim();
  next =
    next.profession === null ? grantProfession(rules, next, name) : { ...next, profession: name };
  return next;
}

/** ME.2: one class option with the chosen profession's and race's transforms and bonuses added. */
function combineSteps(base: EvolutionOption, picked: PickedSteps): EvolutionOption {
  return {
    ...base,
    transforms: [
      ...picked.class.transforms,
      ...(picked.profession?.transforms ?? []),
      ...picked.race.transforms,
    ],
    statBonus: sumBonuses([
      picked.class.statBonus,
      picked.profession?.statBonus ?? {},
      picked.race.statBonus,
    ]),
  };
}

/**
 * ME.2 review: a three-step release is checked as every combination the
 * player could confirm (class × profession or none × race), with the same
 * checks a single option gets (transform count, skills, merges, ceilings,
 * bonuses, race skills), so a release never accepts a choice it would refuse.
 * Profession options need a profession to evolve or the unlock grade.
 */
export function checkReleasedSteps(
  rules: RulesConfig,
  character: Character,
  steps: NonNullable<PendingEvolution['steps']>,
  retired: ReadonlySet<string> = new Set(),
  joint: JointUses = () => 0,
  rerateApproved = false,
): void {
  const target = evolutionTarget(rules, character);
  if (!target) return; // releaseEvolution refuses it with the reason
  if (
    character.profession === null &&
    steps.profession.length > 0 &&
    gradeIndexOf(rules, target.id) < gradeIndexOf(rules, rules.tracks.professionUnlockGrade)
  ) {
    throw new CharacterRuleError(
      `Professions are offered from the ${rules.tracks.professionUnlockGrade}-grade evolution on, to a character without one`,
    );
  }
  const professions: (ReleasedStepOption | null)[] =
    character.profession === null ? [null, ...steps.profession] : [...steps.profession];
  for (const cls of steps.class) {
    for (const profession of professions) {
      for (const race of steps.race) {
        const option = combineSteps(
          {
            id: cls.id,
            className: cls.name,
            description: cls.description,
            transforms: [],
            classWeights: null,
            statBonus: {},
          },
          { class: cls, profession, race },
        );
        try {
          if (rerateApproved) checkRaceSkillsKept(character, option);
          checkOption(rules, character, target, option, retired, joint);
          checkStatBonus(rules, option);
          if (rerateApproved) checkRaceSkillsNamed(character, option);
        } catch (error) {
          if (!(error instanceof CharacterRuleError)) throw error;
          throw new CharacterRuleError(
            `${cls.name} + ${profession?.name ?? 'no profession'} + ${race.name}: ${error.message}`,
          );
        }
      }
    }
  }
}
