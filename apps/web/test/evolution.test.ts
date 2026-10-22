import { describe, expect, it } from 'vitest';
import type { EvolutionOption, OwnSheet, PlayerRules } from '@the-system/engine';
import {
  bonusText,
  evolutionBlocked,
  evolutionWarnings,
  transformText,
  weightsText,
} from '../src/player/evolution';

const rules = {
  stats: {
    list: [
      { id: 'strength', name: 'Strength' },
      { id: 'agility', name: 'Agility' },
      { id: 'perception', name: 'Perception' },
    ],
    displayDivisor: 10,
    displayDecimals: 1,
  },
  rarities: [
    { id: 'common', name: 'Common' },
    { id: 'rare', name: 'Rare' },
  ],
} as unknown as PlayerRules;

const skill = (name: string, marks: number) =>
  ({ name, rarity: 'common', marks }) as unknown as OwnSheet['skills'][number];

const option = (over: Partial<EvolutionOption> = {}): EvolutionOption => ({
  id: 'o1',
  className: 'Storm Ranger',
  description: '',
  transforms: [{ skill: 'Basic Archery', name: 'Expert Archery', rarity: 'rare' }],
  classWeights: null,
  statBonus: {},
  ...over,
});

const me = (over: Partial<Pick<OwnSheet, 'skills'>> = {}) => ({
  skills: [skill('Basic Archery', 3)],
  ...over,
});

describe('evolution screen helpers (M3.13)', () => {
  it('describes a transform with the current rarity', () => {
    const t = option().transforms[0];
    expect(t && transformText(rules, me(), t)).toBe(
      '[Basic Archery (Common)] → [Expert Archery (Rare)]',
    );
    expect(
      transformText(rules, me({ skills: [] }), { skill: 'Gone', name: 'X', rarity: 'rare' }),
    ).toBe('[Gone] → [X (Rare)]');
  });

  it('lists reshaped weights biggest first, ties in stat order', () => {
    expect(weightsText(rules, null)).toBeNull();
    expect(weightsText(rules, { strength: 1, agility: 3, perception: 1 })).toBe(
      'Agility 3 · Strength 1 · Perception 1',
    );
    expect(weightsText(rules, { strength: 0 })).toBeNull();
  });

  it('warns about lost marks, a reshape, and finality', () => {
    const w = evolutionWarnings(me(), option({ classWeights: { agility: 2 } }));
    expect(w).toEqual([
      '[Basic Archery] becomes [Expert Archery]: its 3 mastery marks reset to 0.',
      'Your class stat spread changes for every class level from now on.',
      'The choice is final; the other options will be gone.',
    ]);
  });

  it('only warns of finality when nothing is lost', () => {
    expect(evolutionWarnings(me({ skills: [skill('Basic Archery', 0)] }), option())).toEqual([
      'The choice is final; the other options will be gone.',
    ]);
    expect(evolutionWarnings(me({ skills: [skill('Basic Archery', 1)] }), option())[0]).toBe(
      '[Basic Archery] becomes [Expert Archery]: its 1 mastery mark resets to 0.',
    );
  });
});

describe('evolution waits for selections (MQ.1, D103)', () => {
  it('blocks while any earned selection is unchosen, offered or not', () => {
    expect(evolutionBlocked({ selectionsDue: 0 })).toBeNull();
    expect(evolutionBlocked({ selectionsDue: 1 })).toBe(
      'Choose your waiting skill selection first: you cannot evolve until it is picked.',
    );
    expect(evolutionBlocked({ selectionsDue: 2 })).toBe(
      'Choose your 2 waiting skill selections first: you cannot evolve until they are picked.',
    );
  });
});

describe('evolution stat bonus (MQ.1)', () => {
  it('lists a mixed bonus in stat order and folds an equal bonus to every stat', () => {
    expect(bonusText(rules, { perception: 2, strength: 3 })).toBe('+3 Strength · +2 Perception');
    expect(bonusText(rules, { strength: 2, agility: 2, perception: 2 })).toBe('+2 to every stat');
    expect(bonusText(rules, { strength: 0 })).toBeNull();
    expect(bonusText(rules, {})).toBeNull();
    expect(bonusText(rules, undefined)).toBeNull();
  });
});
