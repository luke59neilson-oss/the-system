import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIBRARY,
  DEFAULT_RULES as INPUT_RULES,
  parseRulesConfig,
  type ClassDef,
} from '@the-system/engine';
import {
  classRarities,
  draftOf,
  draftProblem,
  emptyDraft,
  missingDefaults,
  saveCommand,
  searchEntries,
  unsavedChanges,
  weightSummary,
} from '../src/gm/originLibraryModel';

const parsed = parseRulesConfig(INPUT_RULES);
if (!parsed.ok) throw new Error('default rules must parse');
const DEFAULT_RULES = parsed.config;
const warrior: ClassDef = {
  id: 'w',
  name: 'Warrior',
  description: 'Holds the line.',
  skills: [
    { name: 'Cut', rarity: 'inferior' },
    { name: 'Parry', rarity: 'common' },
    { name: 'Shout', rarity: 'common' },
  ],
  weights: { strength: 3, toughness: 2 },
};
const empty = {
  classLibrary: {},
  classLibraryOrder: [],
  raceLibrary: {},
  raceLibraryOrder: [],
  professionLibrary: {},
  professionLibraryOrder: [],
  skillLibrary: {},
};
const state = {
  ...empty,
  classLibrary: { w: warrior },
  classLibraryOrder: ['w', 'ghost'],
  professionLibrary: {
    p: {
      id: 'p',
      name: 'Cook',
      description: 'Feeds people.',
      skills: [{ name: 'Stew', rarity: 'rare' }],
    },
  },
  professionLibraryOrder: ['p'],
};

describe('GM class, race and profession libraries (M4.2)', () => {
  it('offers class skill rarities up to the first grade ceiling only', () => {
    expect(classRarities(DEFAULT_RULES).map((r) => r.id)).toEqual([
      'inferior',
      'common',
      'uncommon',
      'rare',
    ]);
  });

  it('starts a class draft with the starting skill count and weight 1 everywhere', () => {
    const d = emptyDraft('class', DEFAULT_RULES);
    expect(d.skills).toHaveLength(DEFAULT_RULES.skills.startingClassSkillCount);
    expect(Object.values(d.weights)).toEqual(Array(9).fill('1'));
    expect(emptyDraft('race', DEFAULT_RULES)).toEqual({
      name: '',
      description: '',
      skills: [],
      weights: {},
    });
  });

  it('searches names, descriptions and skill names, skipping missing ids', () => {
    expect(searchEntries(state, 'class', '').map((d) => d.id)).toEqual(['w']);
    expect(searchEntries(state, 'class', 'PARRY')).toHaveLength(1);
    expect(searchEntries(state, 'class', 'line')).toHaveLength(1);
    expect(searchEntries(state, 'class', 'zzz')).toHaveLength(0);
    expect(searchEntries(state, 'profession', 'stew')).toHaveLength(1);
  });

  it('reports draft problems', () => {
    const d = draftOf('class', warrior, DEFAULT_RULES);
    expect(draftProblem('class', d)).toBeNull();
    expect(draftProblem('class', { ...d, name: ' ' })).toMatch(/name/);
    expect(draftProblem('class', { ...d, skills: [{ name: '', rarity: 'common' }] })).toMatch(
      /starting skill/,
    );
    expect(draftProblem('class', { ...d, weights: { ...d.weights, strength: '1.5' } })).toMatch(
      /whole numbers/,
    );
    expect(draftProblem('class', { ...d, weights: { ...d.weights, strength: '1001' } })).toMatch(
      /whole numbers/,
    );
    const zero = Object.fromEntries(Object.keys(d.weights).map((k) => [k, '0']));
    expect(draftProblem('class', { ...d, weights: zero })).toMatch(/above 0/);
    expect(
      draftProblem('profession', { ...d, skills: [{ name: '', rarity: 'common' }] }),
    ).toBeNull();
  });

  it('defines with full weights and edits only what changed', () => {
    const d = draftOf('class', warrior, DEFAULT_RULES);
    const define = saveCommand('class', { ...d, name: ' Knight ' }, null, DEFAULT_RULES);
    expect(define).toMatchObject({ type: 'classDef.define', name: 'Knight' });
    expect(Object.keys((define as unknown as { weights: object }).weights)).toHaveLength(9);
    expect(saveCommand('class', d, warrior, DEFAULT_RULES)).toBeNull();
    expect(unsavedChanges('class', d, warrior, DEFAULT_RULES)).toBe(false);
    const edited = { ...d, weights: { ...d.weights, agility: '2' } };
    expect(unsavedChanges('class', edited, warrior, DEFAULT_RULES)).toBe(true);
    const cmd = saveCommand('class', edited, warrior, DEFAULT_RULES);
    expect(cmd).toEqual({
      type: 'classDef.edit',
      classDefId: 'w',
      weights: {
        strength: 3,
        agility: 2,
        endurance: 0,
        vitality: 0,
        toughness: 2,
        wisdom: 0,
        intelligence: 0,
        perception: 0,
        willpower: 0,
      },
    });
    expect(saveCommand('class', { ...d, name: '' }, warrior, DEFAULT_RULES)).toBeNull();
  });

  it('drops blank profession skill rows and sends race edits by raceDefId', () => {
    const p = state.professionLibrary.p;
    const d = draftOf('profession', p, DEFAULT_RULES);
    expect(
      saveCommand(
        'profession',
        { ...d, skills: [...d.skills, { name: ' ', rarity: 'common' }] },
        p,
        DEFAULT_RULES,
      ),
    ).toBeNull();
    const race = { id: 'h', name: 'Human', description: '' };
    expect(
      saveCommand(
        'race',
        { ...draftOf('race', race, DEFAULT_RULES), description: 'Ours.' },
        race,
        DEFAULT_RULES,
      ),
    ).toEqual({ type: 'raceDef.edit', raceDefId: 'h', description: 'Ours.' });
  });

  it('counts missing defaults by name, ignoring case', () => {
    const all =
      DEFAULT_LIBRARY.classes.length +
      DEFAULT_LIBRARY.races.length +
      DEFAULT_LIBRARY.professions.length +
      DEFAULT_LIBRARY.skills.length;
    expect(missingDefaults(empty)).toBe(all);
    expect(
      missingDefaults({
        ...empty,
        raceLibrary: { h: { id: 'h', name: 'human ', description: '' } },
      }),
    ).toBe(all - 1);
  });

  it('summarises weights biggest first', () => {
    expect(weightSummary(DEFAULT_RULES, warrior.weights)).toBe('Strength 3 · Toughness 2');
  });
});
