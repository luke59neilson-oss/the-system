import { describe, expect, it } from 'vitest';
import { defaultRules } from '../src/rules/load';
import { marksToUpgrade, setSkillRarity } from '../src/skills/model';
import type { Character, CharacterSkill } from '../src';

// QF.60: tests for mutants that survived with no test (docs/ROADMAP.md QF.60).
const rules = defaultRules();
const skill = (rarity: string): CharacterSkill =>
  ({ name: 'Archer’s Eye', rarity, marks: 0 }) as unknown as CharacterSkill;

describe('marksToUpgrade at the top of the ladder', () => {
  it('has no next step from Mythical (Divine is reserved) or from the last rarity', () => {
    expect(marksToUpgrade(rules, skill('legendary'))).toBe(15);
    const tuned = {
      ...rules,
      skills: {
        ...rules.skills,
        markUpgrades: { ...rules.skills.markUpgrades, mythical: 20, divine: 25 },
      },
    };
    expect(marksToUpgrade(tuned, skill('mythical'))).toBeNull();
    expect(marksToUpgrade(tuned, skill('divine'))).toBeNull();
  });
});

describe('unknown rarity', () => {
  it('is refused by name, never treated as a rarity', () => {
    const character = { skills: [skill('common')] } as unknown as Character;
    expect(() => setSkillRarity(rules, character, 'Archer’s Eye', 'shiny')).toThrow(
      'Unknown rarity "shiny"',
    );
    expect(() => marksToUpgrade(rules, skill('shiny'))).toThrow('Unknown rarity "shiny"');
  });
});
