import { describe, expect, it } from 'vitest';
import { DEFAULT_LIBRARY, STARTER_CLASSES } from '../src';

/** MQ.13: the default classes are DESIGN §10's table, exactly. */
const DESIGN_10: Record<string, { weights: Record<string, number>; skills: string[] }> = {
  'Warrior (Light)': {
    weights: { agility: 2, endurance: 1, strength: 1, vitality: 1 },
    skills: ['Basic Light Weapons:inferior', 'Basic Footwork:inferior', 'Swift Strike:common'],
  },
  'Warrior (Medium)': {
    weights: { agility: 1, endurance: 1, vitality: 1, strength: 1, toughness: 1 },
    skills: ['Basic Weapons:inferior', 'Basic Guard:inferior', 'Measured Blow:common'],
  },
  'Warrior (Heavy)': {
    weights: { strength: 2, toughness: 1, vitality: 1, endurance: 1 },
    skills: ['Basic Heavy Weapons:inferior', 'Basic Shield:inferior', 'Brace:common'],
  },
  Archer: {
    weights: { perception: 2, agility: 1, endurance: 1, strength: 1 },
    skills: ['Basic Archery:inferior', 'Basic One-Handed Weapon:inferior', 'Archer’s Eye:common'],
  },
  Caster: {
    weights: { intelligence: 2, wisdom: 1, willpower: 1, perception: 1 },
    skills: ['Basic Catalyst Proficiency:inferior', 'Mana Bolt:inferior', 'Mana Sense:common'],
  },
  Healer: {
    weights: { willpower: 2, wisdom: 2, intelligence: 1 },
    skills: ['Basic Magic-Tool Proficiency:inferior', 'Heal:inferior', 'Regenerate:common'],
  },
};

describe('starting classes (MQ.13, DESIGN §10)', () => {
  it('are the books’ six with their weights and starting skills', () => {
    expect(STARTER_CLASSES.map((c) => c.name).sort()).toEqual(Object.keys(DESIGN_10).sort());
    for (const c of STARTER_CLASSES) {
      const want = DESIGN_10[c.name];
      if (!want) throw new Error(c.name);
      const nonZero = Object.fromEntries(Object.entries(c.weights).filter(([, w]) => w > 0));
      expect(nonZero, c.name).toEqual(want.weights);
      expect(Object.keys(c.weights)).toHaveLength(9);
      expect(c.skills.map((s) => `${s.name}:${s.rarity}`)).toEqual(want.skills);
    }
  });

  it('give every skill original text, and the default library carries it', () => {
    const names = new Set<string>();
    for (const c of STARTER_CLASSES) {
      expect(c.description.length).toBeGreaterThan(10);
      for (const s of c.skills) {
        expect(s.description.length, s.name).toBeGreaterThan(20);
        expect(s.flavor.length, s.name).toBeGreaterThan(5);
        expect(names.has(s.name), `${s.name} repeats`).toBe(false);
        names.add(s.name);
        const entry = DEFAULT_LIBRARY.skills.find(
          (d) => d.name === s.name && d.rarity === s.rarity,
        );
        expect(entry?.description).toBe(s.description);
      }
    }
    expect(DEFAULT_LIBRARY.classes.map((c) => c.name)).toEqual(STARTER_CLASSES.map((c) => c.name));
    expect(DEFAULT_LIBRARY.skills).toHaveLength(18);
  });
});
