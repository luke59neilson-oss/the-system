/**
 * Built-in starter classes (ROADMAP MS.1; the full class library is M4.2).
 * Content, not rules: names, three starting skills within the G-grade rarity
 * ceiling, and stat weights (integers, keyed by the default stat ids).
 */
export interface StarterClass {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly skills: readonly { readonly name: string; readonly rarity: string }[];
  readonly weights: Readonly<Record<string, number>>;
}

export const STARTER_CLASSES: readonly StarterClass[] = [
  {
    id: 'archer',
    name: 'Archer',
    description: 'Strikes from range; sharp eyes and quick feet.',
    skills: [
      { name: 'Basic Archery', rarity: 'inferior' },
      { name: 'Basic Stealth', rarity: 'inferior' },
      { name: 'Archer’s Eye', rarity: 'common' },
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
