import { describe, expect, it } from 'vitest';
import type { EvolutionOption, OwnSheet, PlayerRules } from '@the-system/engine';
import {
  bonusText,
  evolutionBlocked,
  evolutionWarnings,
  rerateLines,
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
  marks: { carryOver: false, upgrades: { common: 4 }, order: ['common', 'rare'] },
} as unknown as PlayerRules;
const carrying = { marks: { ...rules.marks, carryOver: true } };

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
    const w = evolutionWarnings(rules, me(), option({ classWeights: { agility: 2 } }));
    expect(w).toEqual([
      '[Basic Archery] becomes [Expert Archery]: its 3 mastery marks reset to 0.',
      'Your class stat spread changes for every class level from now on.',
      'The choice is final; the other options will be gone.',
    ]);
  });

  it('only warns of finality when nothing is lost', () => {
    expect(evolutionWarnings(rules, me({ skills: [skill('Basic Archery', 0)] }), option())).toEqual(
      ['The choice is final; the other options will be gone.'],
    );
    expect(evolutionWarnings(rules, me({ skills: [skill('Basic Archery', 1)] }), option())[0]).toBe(
      '[Basic Archery] becomes [Expert Archery]: its 1 mastery mark resets to 0.',
    );
  });
});

describe('evolution warnings with marks carrying over (MQ.4, D114)', () => {
  const at = (marks: number) => me({ skills: [skill('Basic Archery', marks)] });
  it('names the marks a rarity gain spends and the ones that carry on', () => {
    // Common → Rare costs 4 (one step).
    expect(evolutionWarnings(carrying, at(6), option())[0]).toBe(
      '[Basic Archery] becomes [Expert Archery]: the rarity gain spends 4 mastery marks; 2 carry on.',
    );
    expect(evolutionWarnings(carrying, at(5), option())[0]).toBe(
      '[Basic Archery] becomes [Expert Archery]: the rarity gain spends 4 mastery marks; 1 carries on.',
    );
  });
  it('says marks reset when the gain costs all of them', () => {
    expect(evolutionWarnings(carrying, at(3), option())[0]).toBe(
      '[Basic Archery] becomes [Expert Archery]: its 3 mastery marks reset to 0.',
    );
  });
  it('says nothing about marks when the transform keeps the rarity', () => {
    const keep = option({
      transforms: [{ skill: 'Basic Archery', name: 'Expert Archery', rarity: 'common' }],
    });
    expect(evolutionWarnings(carrying, at(3), keep)).toEqual([
      'The choice is final; the other options will be gone.',
    ]);
    expect(evolutionWarnings(rules, at(3), keep)).toEqual([
      'The choice is final; the other options will be gone.',
    ]);
  });
});

describe('evolution warnings when every upgrade starts at 0 marks (MR.2, L15)', () => {
  const resetting = { marks: { ...rules.marks, carryOver: false, resetOnUpgrade: true } };
  const at = (marks: number) => me({ skills: [skill('Basic Archery', marks)] });
  it('says a transform that raises the rarity resets every mark', () => {
    expect(evolutionWarnings(resetting, at(6), option())[0]).toBe(
      '[Basic Archery] becomes [Expert Archery]: a transformed skill starts at 0 marks, so its 6 mastery marks reset.',
    );
    expect(evolutionWarnings(resetting, at(1), option())[0]).toBe(
      '[Basic Archery] becomes [Expert Archery]: a transformed skill starts at 0 marks, so its 1 mastery mark resets.',
    );
  });
  it('says a transform at the same rarity resets them too', () => {
    const keep = option({
      transforms: [{ skill: 'Basic Archery', name: 'Expert Archery', rarity: 'common' }],
    });
    expect(evolutionWarnings(resetting, at(3), keep)[0]).toBe(
      '[Basic Archery] becomes [Expert Archery]: a transformed skill starts at 0 marks, so its 3 mastery marks reset.',
    );
  });
  it('says nothing about a skill with no marks', () => {
    expect(evolutionWarnings(resetting, at(0), option())).toEqual([
      'The choice is final; the other options will be gone.',
    ]);
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

describe('rerateLines (MR.1)', () => {
  const me = { skills: [skill('Basic Archery', 0), skill('Identify', 2)] };
  it('lists each re-rated skill in sheet order, old → new or "stays"', () => {
    expect(
      rerateLines(rules, me, {
        rerate: [
          { skill: 'Identify', rarity: 'common' },
          { skill: 'Basic Archery', rarity: 'rare' },
        ],
      }),
    ).toEqual(['[Basic Archery] Common → Rare', '[Identify] stays Common']);
  });
  it('is empty for a release stored before MR.1', () => {
    expect(rerateLines(rules, me, {})).toEqual([]);
  });
  it('shows the default one-step drop for a skill the list does not name (MR.A)', () => {
    const rare = { ...skill('Archer’s Eye', 0), rarity: 'rare' } as OwnSheet['skills'][number];
    const mine = { skills: [rare, skill('Identify', 2)] };
    expect(rerateLines(rules, mine, { rerate: [] })).toEqual([
      '[Archer’s Eye] Rare → Common',
      '[Identify] stays Common',
    ]);
    expect(
      rerateLines(rules, mine, { rerate: [{ skill: 'Archer’s Eye', rarity: 'rare' }] }),
    ).toEqual(['[Archer’s Eye] stays Rare', '[Identify] stays Common']);
  });
});
