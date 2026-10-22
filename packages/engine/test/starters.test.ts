import { describe, expect, it } from 'vitest';
import { DEFAULT_LIBRARY, STARTER_CLASSES, execute, type Campaign, type Command } from '../src';
import { rawRules, run, testContext } from './helpers/events';

const ctx = testContext('id');
function ok(c: Campaign, command: Command): Campaign {
  const r = execute(c, command, ctx);
  if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
  return r.campaign;
}

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

  it('seed a campaign whose characters level only the stats their class names', () => {
    let c = ok(run([{ type: 'campaign.create', name: 'Six', rules: rawRules() }], ctx), {
      type: 'library.seedDefaults',
    });
    const s = c.state!;
    expect(s.classLibraryOrder.map((id) => s.classLibrary[id]?.name)).toEqual(
      STARTER_CLASSES.map((k) => k.name),
    );
    for (const [i, id] of s.classLibraryOrder.entries()) {
      const def = s.classLibrary[id]!;
      c = ok(c, {
        type: 'character.create',
        id: `c${i}`,
        name: def.name,
        className: def.name,
        race: 'Human',
        classSkills: def.skills,
        classWeights: def.weights,
      });
      c = ok(c, {
        type: 'xp.award',
        track: 'class',
        amount: 400,
        participants: [{ characterId: `c${i}` }],
      });
      const ch = c.state!.characters[`c${i}`]!;
      const want = DESIGN_10[def.name]!;
      expect(ch.classLevel, def.name).toBe(4);
      const gained = Object.fromEntries(
        Object.entries(ch.stats).map(([k, v]) => [k, v - 10] as const),
      );
      // G-grade spread: 4 per class level, 16 in all, only into the class's stats.
      expect(
        Object.values(gained).reduce((a, b) => a + b, 0),
        def.name,
      ).toBe(16);
      for (const [stat, g] of Object.entries(gained)) {
        expect(g > 0, `${def.name} ${stat}`).toBe((want.weights[stat] ?? 0) > 0);
      }
      expect(ch.skills.map((k) => `${k.name}:${k.rarity}`)).toEqual([
        ...want.skills,
        'Identify:common',
      ]);
      // Identify's text is not part of the default set (QUALITY backlog).
      for (const k of ch.skills.slice(0, 3)) expect(k.description, k.name).toBeTruthy();
    }
  });
});
