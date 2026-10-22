import {
  CharacterRuleError,
  gradeIndexOf,
  grantProfession,
  newSkill,
  poolMax,
  raceLevel,
  trackCap,
  type Character,
  type CharacterSkill,
} from '../character';
import { gainXp, reshapeClassWeights, type LevelUp } from '../progression';
import type { GradeRules, RulesConfig } from '../rules';

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
}

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

/** An evolution the GM has released and the player has not chosen yet. */
export interface PendingEvolution {
  /** Grade the character evolves into. */
  readonly toGrade: string;
  /** Id of the release event; a choice names it (see SelectionRecord.offerId). */
  readonly releaseId: string;
  readonly options: readonly EvolutionOption[];
  /** Professions offered at the unlock grade (empty otherwise, or when none is offered). */
  readonly professions: readonly string[];
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
 * the skill, it is above the rarity ceiling of the selection being chosen,
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
 * unpicked. A pending menu's own options are changed by offering it again.
 */
export function withdrawPassedOver(character: Character, name: string): Character {
  const key = lower(name);
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
    record.options.find((o) => o.name === name) ??
    passedOverOptions(rules, character, level, retired).find((o) => o.name === name);
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

/** Throws unless the option can apply to the character evolving into `toGrade`. */
function checkOption(
  rules: RulesConfig,
  character: Character,
  toGrade: GradeRules,
  option: EvolutionOption,
  retired: ReadonlySet<string>,
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
  for (const t of option.transforms) {
    const skill = character.skills.find((s) => s.name === t.skill);
    if (!skill) throw new CharacterRuleError(`${character.name} has no skill "${t.skill}"`);
    if (from.has(t.skill)) throw new CharacterRuleError(`[${t.skill}] is transformed twice`);
    from.add(t.skill);
    const name = t.name.trim();
    if (name === '') throw new CharacterRuleError(`[${t.skill}] needs a new name`);
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
    if (rank < rarityIndex(rules, skill.rarity)) {
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
): Character {
  if (!legacy) checkNoPendingSelection(rules, character, 'released');
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
    checkOption(rules, character, target, option, retired);
    checkStatBonus(rules, option);
  }
  const unlock = target.id === rules.tracks.professionUnlockGrade && character.profession === null;
  if (!unlock && professions.length > 0) {
    throw new CharacterRuleError(
      `Professions are offered at the ${rules.tracks.professionUnlockGrade}-grade evolution of a character without one`,
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
): EvolutionResult {
  const pending = character.evolution;
  if (!pending) throw new CharacterRuleError(`No evolution is released for ${character.name}`);
  if (!legacy) checkNoPendingSelection(rules, character, 'chosen');
  if (releaseId !== null && releaseId !== pending.releaseId) {
    throw new CharacterRuleError('The evolution was released again; choose from the new options');
  }
  const option = pending.options.find((o) => o.id === optionId);
  if (!option) throw new CharacterRuleError(`No evolution option "${optionId}"`);
  const target = evolutionTarget(rules, character);
  if (!target || target.id !== pending.toGrade) {
    throw new CharacterRuleError(
      `${character.name} can no longer evolve to ${pending.toGrade}-grade`,
    );
  }
  checkOption(rules, character, target, option, retired);
  if (pending.professions.length > 0) {
    if (profession === null) throw new CharacterRuleError('Choose one of the offered professions');
    if (!pending.professions.includes(profession)) {
      throw new CharacterRuleError(`"${profession}" is not an offered profession`);
    }
  } else if (profession !== null) {
    throw new CharacterRuleError('No profession is offered with this evolution');
  }

  const byName = new Map(option.transforms.map((t) => [t.skill, t]));
  const skills: CharacterSkill[] = character.skills.map((s) => {
    const t = byName.get(s.name);
    if (!t) return s;
    // A rarity gain spends the banked marks (as an upgrade would); a transform
    // that keeps the rarity keeps them (DESIGN §6: they bank until the evolution).
    const marks = t.rarity === s.rarity ? s.marks : 0;
    // A renamed skill is a new skill to the System: the old text would
    // describe the wrong thing, so it clears until the GM writes new text (M3.5).
    const name = t.name.trim();
    const text = name === s.name ? {} : { description: null, flavor: null };
    return { ...s, name, rarity: t.rarity, marks, ...text };
  });
  let next: Character = {
    ...character,
    grade: target.id,
    className: option.className,
    skills,
    evolution: null,
  };
  if (option.classWeights !== null) next = reshapeClassWeights(rules, next, option.classWeights);
  if (!legacy) next = applyStatBonus(next, option.statBonus ?? {});
  if (profession !== null) next = grantProfession(rules, next, profession);
  const levelUps: LevelUp[] = [];
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
