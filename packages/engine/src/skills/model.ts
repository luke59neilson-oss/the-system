import { CharacterRuleError, newSkill, type Character, type CharacterSkill } from '../character';
import { currentGrade } from '../progression';
import type { RulesConfig } from '../rules';

/**
 * Skills (ROADMAP M1.9, DESIGN §6): nicknames, the Unique tag, mastery marks
 * with banking at the grade ceiling, mark upgrades and merges. Pure; rule
 * breaks throw CharacterRuleError, which the reducer turns into rejections.
 */

const MAX_NICKNAME = 60;

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

/** Upgrades one rarity step; marks reset to 0 (DESIGN §6). */
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
  return withSkill(character, index, { ...skill, rarity: next?.id ?? skill.rarity, marks: 0 });
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
  const others = character.skills.filter((_, i) => i !== ia && i !== ib);
  if (others.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new CharacterRuleError(`${character.name} already has a skill "${trimmed}"`);
  }
  const merged = newSkill(trimmed, result.id, a.kind);
  const skills = character.skills.flatMap((s, i) => (i === ia ? [merged] : i === ib ? [] : [s]));
  return { ...character, skills, merges: { ...character.merges, [character.grade]: done + 1 } };
}
