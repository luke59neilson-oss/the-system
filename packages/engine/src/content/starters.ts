/**
 * Built-in starting classes: the books' six (DESIGN §10, L5, MQ.13). Content,
 * not rules: names, three starting skills within the G-grade rarity ceiling
 * (two Inferior proficiencies and one Common signature skill), stat weights
 * from the books' per-level lines (integers keyed by the default stat ids;
 * unlisted stats weigh 0), and original System text for every skill.
 */
export interface StarterClass {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly skills: readonly {
    readonly name: string;
    readonly rarity: string;
    readonly tags: readonly string[];
    readonly description: string;
    readonly flavor: string;
  }[];
  readonly weights: Readonly<Record<string, number>>;
}

const STATS = [
  'strength',
  'agility',
  'endurance',
  'vitality',
  'toughness',
  'wisdom',
  'intelligence',
  'perception',
  'willpower',
] as const;

/** Every default stat, 0 unless the books' line names it. */
const weights = (named: Partial<Record<(typeof STATS)[number], number>>) =>
  Object.fromEntries(STATS.map((id) => [id, named[id] ?? 0]));

export const STARTER_CLASSES: readonly StarterClass[] = [
  {
    id: 'archer',
    name: 'Archer',
    description: 'Ranged, fast and flexible: strikes from a distance and keeps moving.',
    skills: [
      {
        name: 'Basic Archery',
        rarity: 'inferior',
        tags: ['Archer', 'Ranged'],
        description:
          'Grants a basic understanding of the bow. Slightly improves draw strength, aim and the speed of nocking an arrow.',
        flavor: 'Every hunter starts with a string and a stick.',
      },
      {
        name: 'Basic One-Handed Weapon',
        rarity: 'inferior',
        tags: ['Archer', 'Melee'],
        description:
          'Grants a basic understanding of a knife, hatchet or short blade held in one hand. Slightly improves grip, reach and recovery when something gets too close for the bow.',
        flavor: 'For when the distance runs out.',
      },
      {
        name: 'Archer’s Eye',
        rarity: 'common',
        tags: ['Archer', 'Perception'],
        description:
          'Sharpens sight at range. Distant targets are easier to track, and the path of a shot is easier to judge.',
        flavor: 'See it first. Hit it first.',
      },
    ],
    weights: weights({ perception: 2, agility: 1, endurance: 1, strength: 1 }),
  },
  {
    id: 'warrior-light',
    name: 'Warrior (Light)',
    description: 'Speed, evasion and finesse: light blades, quick feet, hard to pin down.',
    skills: [
      {
        name: 'Basic Light Weapons',
        rarity: 'inferior',
        tags: ['Warrior', 'Melee'],
        description:
          'Grants a basic understanding of rapiers, daggers, hatchets and thrown weapons. Slightly improves speed of the draw, accuracy of a throw and the flow from one cut into the next.',
        flavor: 'Light in the hand, heavy on the conscience.',
      },
      {
        name: 'Basic Footwork',
        rarity: 'inferior',
        tags: ['Warrior', 'Movement'],
        description:
          'Grants a basic understanding of stepping, dodging and evasion. Slightly improves balance and the timing of a sidestep.',
        flavor: 'The best block is not being there.',
      },
      {
        name: 'Swift Strike',
        rarity: 'common',
        tags: ['Warrior', 'Melee'],
        description:
          'A fast strike with almost no wind-up. Hard to read and harder to answer before it lands.',
        flavor: 'Over before the thought of it.',
      },
    ],
    weights: weights({ agility: 2, endurance: 1, strength: 1, vitality: 1 }),
  },
  {
    id: 'warrior-medium',
    name: 'Warrior (Medium)',
    description: 'Balanced: a wide range of weapons, comfortable in most fights.',
    skills: [
      {
        name: 'Basic Weapons',
        rarity: 'inferior',
        tags: ['Warrior', 'Melee'],
        description:
          'Grants a basic understanding of most light and heavy weapons. Slightly improves handling of whatever is close to hand.',
        flavor: 'A weapon is a weapon. Learn them all.',
      },
      {
        name: 'Basic Guard',
        rarity: 'inferior',
        tags: ['Warrior', 'Defense'],
        description:
          'Grants a basic understanding of parrying and blocking. Slightly improves the angle and timing of a guard.',
        flavor: 'Meet it, turn it, answer it.',
      },
      {
        name: 'Measured Blow',
        rarity: 'common',
        tags: ['Warrior', 'Melee'],
        description:
          'A balanced strike that waits for an opening and then takes it. Hits harder when the target has just overreached.',
        flavor: 'Patience, then precision.',
      },
    ],
    weights: weights({ agility: 1, endurance: 1, vitality: 1, strength: 1, toughness: 1 }),
  },
  {
    id: 'warrior-heavy',
    name: 'Warrior (Heavy)',
    description: 'Power and survivability: heavy weapons and shields, few ranged options.',
    skills: [
      {
        name: 'Basic Heavy Weapons',
        rarity: 'inferior',
        tags: ['Warrior', 'Melee'],
        description:
          'Grants a basic understanding of two-handed weapons and weapon-and-shield fighting. Slightly improves the force behind a swing and control after it.',
        flavor: 'Some problems need a bigger answer.',
      },
      {
        name: 'Basic Shield',
        rarity: 'inferior',
        tags: ['Warrior', 'Defense'],
        description:
          'Grants a basic understanding of the shield. Slightly reduces the force of blows taken on it and improves shoving with it.',
        flavor: 'A wall that walks.',
      },
      {
        name: 'Brace',
        rarity: 'common',
        tags: ['Warrior', 'Defense', 'Stamina'],
        description:
          'Plant your feet and set your body. Absorb a blow that should knock you down, or hold a line against a charge.',
        flavor: 'Not one step back.',
      },
    ],
    weights: weights({ strength: 2, toughness: 1, vitality: 1, endurance: 1 }),
  },
  {
    id: 'caster',
    name: 'Caster',
    description: 'Non-attuned magic: wide but limited, dangerous at range, fragile up close.',
    skills: [
      {
        name: 'Basic Catalyst Proficiency',
        rarity: 'inferior',
        tags: ['Caster', 'Mana'],
        description:
          'Grants a basic understanding of staves, idols, relics and wands. Slightly improves how smoothly mana flows through a catalyst.',
        flavor: 'The stick is not the magic. It helps.',
      },
      {
        name: 'Mana Bolt',
        rarity: 'inferior',
        tags: ['Caster', 'Mana', 'Ranged'],
        description:
          'Shape raw mana into a bolt and throw it. Costs mana; it hits harder as your magic grows.',
        flavor: 'Crude, loud and effective.',
      },
      {
        name: 'Mana Sense',
        rarity: 'common',
        tags: ['Caster', 'Mana', 'Perception'],
        description:
          'Feel mana nearby: the pull of spellwork, the hum of an enchanted object, the gathering of a spell about to be cast.',
        flavor: 'The world has a pulse. Now you can hear it.',
      },
    ],
    weights: weights({ intelligence: 2, wisdom: 1, willpower: 1, perception: 1 }),
  },
  {
    id: 'healer',
    name: 'Healer',
    description: 'Mends, cleanses and supports; keeps the party standing, weak alone.',
    skills: [
      {
        name: 'Basic Magic-Tool Proficiency',
        rarity: 'inferior',
        tags: ['Healer', 'Mana'],
        description:
          'Grants a basic understanding of wands, charms and other magic tools. Slightly improves the focus of healing mana through them.',
        flavor: 'Steady hands, steady flow.',
      },
      {
        name: 'Heal',
        rarity: 'inferior',
        tags: ['Healer', 'Mana', 'Support'],
        description:
          'Push mana into a wound to close it. Costs mana; restores health to one target in reach.',
        flavor: 'Hold still. This will only sting.',
      },
      {
        name: 'Regenerate',
        rarity: 'common',
        tags: ['Healer', 'Mana', 'Support'],
        description:
          'Seed a slow, lasting recovery in a target. Health returns a little at a time for as long as the mana holds.',
        flavor: 'Mending is a long road. Start them walking.',
      },
    ],
    weights: weights({ willpower: 2, wisdom: 2, intelligence: 1 }),
  },
];

/** A starter class's skills as `character.create` takes them (no library tags). */
export function starterClassSkills(c: StarterClass) {
  return c.skills.map((s) => ({
    name: s.name,
    rarity: s.rarity,
    description: s.description,
    flavor: s.flavor,
  }));
}
