import type { ClassDef, ProfessionDef, RaceDef } from '../library';
import type { SkillDef } from '../skills';
import { STARTER_CLASSES } from './starters';

/**
 * The default library set (ROADMAP M4.2): starting classes and the Human race
 * (no professions, MQ.6), plus skill-library text for every starting class skill. Content,
 * not rules: `library.seedDefaults` copies it into a campaign's libraries as
 * one event, so editing this file never changes an existing campaign.
 */
export interface DefaultLibrary {
  readonly skills: readonly Omit<SkillDef, 'id'>[];
  readonly classes: readonly Omit<ClassDef, 'id'>[];
  readonly races: readonly Omit<RaceDef, 'id'>[];
  readonly professions: readonly Omit<ProfessionDef, 'id'>[];
}

const w = (
  strength: number,
  agility: number,
  endurance: number,
  vitality: number,
  toughness: number,
  wisdom: number,
  intelligence: number,
  perception: number,
  willpower: number,
) => ({
  strength,
  agility,
  endurance,
  vitality,
  toughness,
  wisdom,
  intelligence,
  perception,
  willpower,
});

const skill = (
  name: string,
  rarity: string,
  tags: readonly string[],
  description: string,
  flavor: string,
): Omit<SkillDef, 'id'> => ({ name, rarity, tags, description, flavor, effects: '' });

const archer = STARTER_CLASSES[0];

const SKILLS: readonly Omit<SkillDef, 'id'>[] = [
  ...(archer?.skills ?? []).map((s) =>
    skill(s.name, s.rarity, ['Archer'], s.description, s.flavor),
  ),
  skill(
    'Basic One-Handed Weapons',
    'inferior',
    ['Warrior', 'Melee'],
    'Grants a basic understanding of swords, axes and maces held in one hand. Slightly improves balance, edge alignment and recovery after a swing.',
    'Point the sharp end at the problem.',
  ),
  skill(
    'Basic Shield Defense',
    'inferior',
    ['Warrior', 'Defense'],
    'Read incoming blows and meet them with a shield. Slightly reduces the force that gets through.',
    'A wall that walks.',
  ),
  skill(
    'Battle Cry',
    'common',
    ['Warrior', 'Stamina'],
    'Let out a roar that steadies allies who hear it and rattles weaker foes. Costs Stamina.',
    'Loud is a tactic.',
  ),
  skill(
    'Basic Mana Manipulation',
    'inferior',
    ['Mage', 'Healer', 'Mana'],
    'Feel the mana inside you and move it where you want it. The foundation of every spell.',
    'First you learn it is there. Then you learn it listens.',
  ),
  skill(
    'Mana Bolt',
    'common',
    ['Mage', 'Mana', 'Ranged'],
    'Shape mana into a bolt and throw it. Costs Mana; harder hits cost more.',
    'Raw, blunt, and very much yours.',
  ),
  skill(
    'Basic Meditation',
    'inferior',
    ['Mage', 'Mana'],
    'Sit still and breathe to recover Mana faster while out of danger.',
    'The quiet is a well.',
  ),
  skill(
    'Minor Heal',
    'common',
    ['Healer', 'Mana'],
    'Push mana into a wound to close it. Costs Mana; works best on fresh injuries.',
    'Hold still. This will only sting a little.',
  ),
  skill(
    'Soothing Presence',
    'inferior',
    ['Healer', 'Support'],
    'Those near you calm a little faster: panic fades and breathing slows.',
    'Somebody has to keep their head.',
  ),
  skill(
    'Basic Daggers',
    'inferior',
    ['Rogue', 'Melee'],
    'Grants a basic understanding of short blades. Slightly improves grip, quick strikes and throws.',
    'Small blade, short story.',
  ),
  skill(
    'Find Weakness',
    'common',
    ['Rogue', 'Perception'],
    'Study a target for a moment to spot a gap in its guard or armour.',
    'Everything has a soft spot. Everything.',
  ),
  skill(
    'Basic Unarmed Combat',
    'inferior',
    ['Brawler', 'Melee'],
    'Grants a basic understanding of fists, knees and elbows. Slightly improves footwork and how hard a punch lands.',
    'Never unarmed.',
  ),
  skill(
    'Iron Skin',
    'common',
    ['Brawler', 'Defense', 'Stamina'],
    'Tense your body to shrug off a blow. Costs Stamina while held.',
    'Bruises are just opinions.',
  ),
  skill(
    'Second Wind',
    'inferior',
    ['Brawler', 'Stamina'],
    'Once a fight, catch your breath and recover some Stamina.',
    'Not yet.',
  ),
];

const CLASSES: readonly Omit<ClassDef, 'id'>[] = [
  ...(archer
    ? [
        {
          name: archer.name,
          description: archer.description,
          skills: archer.skills.map((s) => ({ name: s.name, rarity: s.rarity })),
          weights: archer.weights,
        },
      ]
    : []),
  {
    name: 'Warrior',
    description: 'Front line with blade and shield; hits hard and holds the line.',
    skills: [
      { name: 'Basic One-Handed Weapons', rarity: 'inferior' },
      { name: 'Basic Shield Defense', rarity: 'inferior' },
      { name: 'Battle Cry', rarity: 'common' },
    ],
    weights: w(3, 1, 2, 2, 3, 1, 1, 1, 1),
  },
  {
    name: 'Mage',
    description: 'Shapes raw mana into attacks; fragile but dangerous at range.',
    skills: [
      { name: 'Basic Mana Manipulation', rarity: 'inferior' },
      { name: 'Mana Bolt', rarity: 'common' },
      { name: 'Basic Meditation', rarity: 'inferior' },
    ],
    weights: w(1, 1, 1, 1, 1, 3, 3, 1, 2),
  },
  {
    name: 'Healer',
    description: 'Keeps the party standing; mends wounds and steadies nerves.',
    skills: [
      { name: 'Minor Heal', rarity: 'common' },
      { name: 'Basic Mana Manipulation', rarity: 'inferior' },
      { name: 'Soothing Presence', rarity: 'inferior' },
    ],
    weights: w(1, 1, 1, 2, 1, 3, 2, 1, 2),
  },
  {
    name: 'Rogue',
    description: 'Quick, quiet and precise; strikes where it hurts most.',
    skills: [
      { name: 'Basic Daggers', rarity: 'inferior' },
      { name: 'Basic Stealth', rarity: 'inferior' },
      { name: 'Find Weakness', rarity: 'common' },
    ],
    weights: w(2, 3, 1, 1, 1, 1, 1, 2, 1),
  },
  {
    name: 'Brawler',
    description: 'Fights with fists and grit; tough to put down.',
    skills: [
      { name: 'Basic Unarmed Combat', rarity: 'inferior' },
      { name: 'Iron Skin', rarity: 'common' },
      { name: 'Second Wind', rarity: 'inferior' },
    ],
    weights: w(3, 2, 2, 2, 2, 1, 1, 1, 1),
  },
];

const RACES: readonly Omit<RaceDef, 'id'>[] = [
  {
    name: 'Human',
    description:
      'Earth’s own, newly integrated. Humans lean no way in particular, which is exactly why the System expects so much of them.',
  },
];

/**
 * No default professions (MQ.6, D105): the GM offers each character
 * professions tailored to what they have done, at the E-grade evolution.
 * The profession library holds only the GM's own entries.
 */
const PROFESSIONS: readonly Omit<ProfessionDef, 'id'>[] = [];

export const DEFAULT_LIBRARY: DefaultLibrary = {
  skills: SKILLS,
  classes: CLASSES,
  races: RACES,
  professions: PROFESSIONS,
};
