import {
  CharacterRuleError,
  newSkill,
  textOrNull,
  type Character,
  type CharacterSkill,
} from '../character';
import { currentGrade } from '../progression';
import type { RulesConfig } from '../rules';

/**
 * Skills (ROADMAP M1.9, DESIGN §6): nicknames, the Unique tag, mastery marks
 * with banking at the grade ceiling, mark upgrades and merges. Pure; rule
 * breaks throw CharacterRuleError, which the reducer turns into rejections.
 */

/** Longest nickname a player may give a skill. */
export const MAX_NICKNAME = 60;

function rarityIndex(rules: RulesConfig, rarity: string): number {
  const index = rules.skills.rarities.findIndex((r) => r.id === rarity);
  if (index === -1) throw new CharacterRuleError(`Unknown rarity "${rarity}"`);
  return index;
}

const rarityName = (rules: RulesConfig, rarity: string): string =>
  rules.skills.rarities.find((r) => r.id === rarity)?.name ?? rarity;

/** Index of the skill by official name; throws when the character lacks it. */
export function skillIndex(character: Character, name: string): number {
  const index = character.skills.findIndex((s) => s.name === name);
  if (index === -1) throw new CharacterRuleError(`${character.name} has no skill "${name}"`);
  return index;
}

function withSkill(character: Character, index: number, skill: CharacterSkill): Character {
  const skills = [...character.skills];
  skills[index] = skill;
  return { ...character, skills };
}

/** Sets or clears (null or blank) a player's nickname; the official name always stays. */
export function setNickname(
  character: Character,
  name: string,
  nickname: string | null,
): Character {
  const index = skillIndex(character, name);
  const trimmed = nickname === null ? null : nickname.trim();
  if (trimmed !== null && trimmed.length > MAX_NICKNAME) {
    throw new CharacterRuleError(`A nickname is at most ${MAX_NICKNAME} characters`);
  }
  const skill = character.skills[index] as CharacterSkill;
  const next = trimmed === '' ? null : trimmed;
  if (next === skill.nickname) throw new CharacterRuleError('The nickname is unchanged');
  return withSkill(character, index, { ...skill, nickname: next });
}

/**
 * Sets the System description and flavour of a skill (GM, M3.5). Blank text
 * clears a field; a change that leaves both as they were is refused.
 */
export function describeSkill(
  character: Character,
  name: string,
  description: string | null,
  flavor: string | null,
  /** Mark the copy as hand-written so library edits skip it (MQ.12). */
  markEdited = false,
): Character {
  const index = skillIndex(character, name);
  const skill = character.skills[index] as CharacterSkill;
  const next = { description: textOrNull(description), flavor: textOrNull(flavor) };
  if (next.description === skill.description && next.flavor === skill.flavor) {
    throw new CharacterRuleError(`[${name}] already has that text`);
  }
  return withSkill(character, index, {
    ...skill,
    ...next,
    ...(markEdited ? { textEdited: true as const } : {}),
  });
}

/** Sets or clears the Unique tag. */
export function setUnique(character: Character, name: string, unique: boolean): Character {
  const index = skillIndex(character, name);
  const skill = character.skills[index] as CharacterSkill;
  if (skill.unique === unique) {
    throw new CharacterRuleError(`[${name}] is already ${unique ? '' : 'not '}Unique`);
  }
  return withSkill(character, index, { ...skill, unique });
}

/** Marks needed to upgrade from the skill's rarity, or null when there is no next step. */
export function marksToUpgrade(rules: RulesConfig, skill: CharacterSkill): number | null {
  const needed = rules.skills.markUpgrades[skill.rarity];
  const next = rules.skills.rarities[rarityIndex(rules, skill.rarity) + 1];
  if (needed === undefined || !next || next.reserved) return null;
  return needed;
}

/** The mark rules a rarity change needs; also sent to players (no GM tuning in it). */
export interface MarkRules {
  /** Marks beyond a step's cost carry into the next rarity (MQ.4). */
  readonly carryOver: boolean;
  /** Every upgrade, transforms included, starts at 0 marks (MR.2); wins over carryOver. */
  readonly resetOnUpgrade: boolean;
  /** Marks to step up from each rarity id. */
  readonly upgrades: Readonly<Record<string, number>>;
  /** Rarity ids, lowest first. */
  readonly order: readonly string[];
}

export function markRules(rules: RulesConfig): MarkRules {
  return {
    carryOver: rules.skills.marksCarryOver && !rules.skills.marksResetOnUpgrade,
    resetOnUpgrade: rules.skills.marksResetOnUpgrade,
    upgrades: { ...rules.skills.markUpgrades },
    order: rules.skills.rarities.map((r) => r.id),
  };
}

/**
 * Marks a skill keeps when its rarity changes from `from` to `to` outside a
 * mark upgrade (an evolution transform, MQ.4, D114). The same rarity keeps
 * every mark. A rise spends each step's cost, as that many upgrades would,
 * and the rest carry on (clamped at 0). With carry-over off (rules stored
 * before MQ.4), or for a drop or an unknown rarity, marks reset to 0.
 */
export function marksAfterRarityChange(
  m: MarkRules,
  from: string,
  to: string,
  marks: number,
): number {
  // MR.2: a transformed skill is new to the character, whatever its rarity.
  if (m.resetOnUpgrade) return 0;
  if (from === to) return marks;
  if (!m.carryOver) return 0;
  const a = m.order.indexOf(from);
  const b = m.order.indexOf(to);
  if (a < 0 || b <= a) return 0;
  let cost = 0;
  for (let i = a; i < b; i++) {
    const id = m.order[i] as string;
    if (!Object.prototype.hasOwnProperty.call(m.upgrades, id)) return 0;
    cost += m.upgrades[id] as number;
  }
  return Math.max(0, marks - cost);
}

/** True when the skill is at its grade's rarity ceiling (marks bank until the next evolution). */
export function atCeiling(
  rules: RulesConfig,
  character: Character,
  skill: CharacterSkill,
): boolean {
  const ceiling = rarityIndex(rules, currentGrade(rules, character).rarityCeiling);
  return rarityIndex(rules, skill.rarity) >= ceiling;
}

/**
 * Awards a mastery mark in a session (DESIGN §6). At most
 * `maxMarksPerSkillPerSession` per skill per session. A skill with no further
 * upgrade cannot earn marks; one at its grade ceiling banks them.
 */
export function awardMark(
  rules: RulesConfig,
  character: Character,
  name: string,
  session: string,
): Character {
  const index = skillIndex(character, name);
  const skill = character.skills[index] as CharacterSkill;
  if (marksToUpgrade(rules, skill) === null) {
    throw new CharacterRuleError(
      `[${name}] is ${rarityName(rules, skill.rarity)}, which has no mark upgrade`,
    );
  }
  const already = skill.markSessions.filter((s) => s === session).length;
  if (already >= rules.skills.maxMarksPerSkillPerSession) {
    throw new CharacterRuleError(`[${name}] already earned its mark this session`);
  }
  return withSkill(character, index, {
    ...skill,
    marks: skill.marks + 1,
    markSessions: [...skill.markSessions, session],
  });
}

/** True when the skill has the marks for its next rarity and the grade allows it. */
export function canUpgrade(
  rules: RulesConfig,
  character: Character,
  skill: CharacterSkill,
): boolean {
  const needed = marksToUpgrade(rules, skill);
  return needed !== null && skill.marks >= needed && !atCeiling(rules, character, skill);
}

/**
 * Upgrades one rarity step (DESIGN §6). Marks beyond the cost carry into the
 * next rarity (MQ.4, `skills.marksCarryOver`), banked ones included; with the
 * flag off (rules stored before MQ.4) they reset to 0.
 */
export function upgradeSkill(rules: RulesConfig, character: Character, name: string): Character {
  const index = skillIndex(character, name);
  const skill = character.skills[index] as CharacterSkill;
  const needed = marksToUpgrade(rules, skill);
  if (needed === null) {
    throw new CharacterRuleError(
      `[${name}] cannot be upgraded past ${rarityName(rules, skill.rarity)}`,
    );
  }
  if (skill.marks < needed) {
    throw new CharacterRuleError(`[${name}] needs ${needed} marks (has ${skill.marks})`);
  }
  if (atCeiling(rules, character, skill)) {
    throw new CharacterRuleError(
      `[${name}] is at the ${character.grade}-grade ceiling; its marks bank until the next evolution`,
    );
  }
  const next = rules.skills.rarities[rarityIndex(rules, skill.rarity) + 1];
  const marks = markRules(rules).carryOver ? skill.marks - needed : 0;
  // The upgraded copy follows its new rarity's entry, not a re-rated one (MR.1).
  const { textRarity, ...rest } = skill;
  void textRarity;
  return withSkill(character, index, { ...rest, rarity: next?.id ?? skill.rarity, marks });
}

/**
 * Merges two skills into one (DESIGN §6): both at least `merge.minRarity`,
 * logged together `merge.requiredJointUses` times, one merge per character
 * per grade. The result is `rarityStepsAboveHigher` above the higher of the
 * two (never above the grade ceiling), takes the first skill's place and kind,
 * and starts with no marks; the originals are consumed.
 */
export function mergeSkills(
  rules: RulesConfig,
  character: Character,
  first: string,
  second: string,
  name: string,
  jointUses: number,
): Character {
  const merge = rules.skills.merge;
  if (first === second) throw new CharacterRuleError('Merge two different skills');
  const ia = skillIndex(character, first);
  const ib = skillIndex(character, second);
  const a = character.skills[ia] as CharacterSkill;
  const b = character.skills[ib] as CharacterSkill;
  const min = rarityIndex(rules, merge.minRarity);
  for (const s of [a, b]) {
    if (rarityIndex(rules, s.rarity) < min) {
      throw new CharacterRuleError(
        `[${s.name}] must be at least ${rarityName(rules, merge.minRarity)} to merge`,
      );
    }
  }
  if (jointUses < merge.requiredJointUses) {
    throw new CharacterRuleError(
      `[${first}] and [${second}] were logged together ${jointUses} times (need ${merge.requiredJointUses})`,
    );
  }
  const done = Object.prototype.hasOwnProperty.call(character.merges, character.grade)
    ? (character.merges[character.grade] ?? 0)
    : 0;
  if (done >= merge.maxPerCharacterPerGrade) {
    throw new CharacterRuleError(`Already merged at ${character.grade}-grade`);
  }
  const target =
    Math.max(rarityIndex(rules, a.rarity), rarityIndex(rules, b.rarity)) +
    merge.rarityStepsAboveHigher;
  const result = rules.skills.rarities[target];
  const ceiling = rarityIndex(rules, currentGrade(rules, character).rarityCeiling);
  if (!result || result.reserved || target > ceiling) {
    throw new CharacterRuleError(
      `The merged skill would be above the ${character.grade}-grade ceiling`,
    );
  }
  const trimmed = name.trim();
  if (trimmed === '') throw new CharacterRuleError('The merged skill needs a name');
  // Names of the originals are refused too: practice-log pair counts are keyed
  // by name, so a reused name would inherit the old skill's joint uses.
  if (character.skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new CharacterRuleError(`${character.name} already has a skill "${trimmed}"`);
  }
  const merged = newSkill(trimmed, result.id, a.kind);
  const skills = character.skills.flatMap((s, i) => (i === ia ? [merged] : i === ib ? [] : [s]));
  return { ...character, skills, merges: { ...character.merges, [character.grade]: done + 1 } };
}

/**
 * MT.2 (DESIGN §6, Q62): the GM sends a merge as an offer. It is checked as if
 * applied now, then waits on the player; a new offer replaces an older one.
 */
export function offerMerge(
  rules: RulesConfig,
  character: Character,
  first: string,
  second: string,
  name: string,
  jointUses: number,
  offerId: string,
  text: { description?: string | null | undefined; flavor?: string | null | undefined } = {},
): Character {
  mergeSkills(rules, character, first, second, name, jointUses);
  const rarityOf = (n: string) => character.skills.find((s) => s.name === n)?.rarity ?? '';
  return {
    ...character,
    mergeOffer: {
      offerId,
      skills: [first, second],
      rarities: [rarityOf(first), rarityOf(second)],
      name: name.trim(),
      ...(text.description?.trim() ? { description: text.description.trim() } : {}),
      ...(text.flavor?.trim() ? { flavor: text.flavor.trim() } : {}),
    },
  };
}

/**
 * The player answers the pending merge offer: accepting applies it (checked
 * again, so a skill that changed since makes it stale), declining keeps both
 * originals. Either way the offer is gone.
 */
export function answerMerge(
  rules: RulesConfig,
  character: Character,
  offerId: string,
  accept: boolean,
  jointUses: number,
): Character {
  const offer = character.mergeOffer ?? null;
  if (offer === null || offer.offerId !== offerId) {
    throw new CharacterRuleError('That merge offer is no longer open');
  }
  const cleared: Character = {
    ...character,
    mergeOffer: null,
    lastMergeAnswer: { offerId, skills: offer.skills, name: offer.name, accept },
  };
  if (!accept) return cleared;
  const [first, second] = offer.skills;
  const rarityOf = (n: string) => character.skills.find((s) => s.name === n)?.rarity;
  if (rarityOf(first) !== offer.rarities[0] || rarityOf(second) !== offer.rarities[1]) {
    throw new CharacterRuleError(
      'That merge offer is out of date: one of its skills has changed. Ask the GM to send it again',
    );
  }
  const merged = mergeSkills(rules, cleared, first, second, offer.name, jointUses);
  if (offer.description === undefined && offer.flavor === undefined) return merged;
  return describeSkill(merged, offer.name, offer.description ?? null, offer.flavor ?? null);
}
