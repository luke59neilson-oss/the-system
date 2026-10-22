/**
 * Built-in starter classes (ROADMAP MS.1; the full class library is M4.2).
 * Content, not rules: names, three starting skills within the G-grade rarity
 * ceiling, and stat weights (integers, keyed by the default stat ids).
 */
export interface StarterClass {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly skills: readonly {
    readonly name: string;
    readonly rarity: string;
    readonly description: string;
    readonly flavor: string;
  }[];
  readonly weights: Readonly<Record<string, number>>;
}

export const STARTER_CLASSES: readonly StarterClass[] = [
  {
    id: 'archer',
    name: 'Archer',
    description: 'Strikes from range; sharp eyes and quick feet.',
    skills: [
      {
        name: 'Basic Archery',
        rarity: 'inferior',
        description:
          'Grants a basic understanding of the bow. Slightly improves draw strength, aim and the speed of nocking an arrow.',
        flavor: 'Every hunter starts with a string and a stick.',
      },
      {
        name: 'Basic Stealth',
        rarity: 'inferior',
        description:
          'Move with less sound and draw less attention while unseen. Slightly harder to notice while standing still.',
        flavor: 'The prey that never hears you never runs.',
      },
      {
        name: 'Archer’s Eye',
        rarity: 'common',
        description:
          'Sharpens sight at range. Distant targets are easier to track, and the path of a shot is easier to judge.',
        flavor: 'See it first. Hit it first.',
      },
    ],
    weights: {
      strength: 2,
      agility: 3,
      endurance: 1,
      vitality: 1,
      toughness: 1,
      wisdom: 1,
      intelligence: 1,
      perception: 3,
      willpower: 1,
    },
  },
];
