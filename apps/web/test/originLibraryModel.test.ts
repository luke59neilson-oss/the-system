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
  draftPoints,
  draftProblem,
  emptyDraft,
  missingDefaults,
  pointsCheck,
  pointsSummary,
  weightsSetAside,
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
      points: Object.fromEntries(DEFAULT_RULES.stats.list.map((st) => [st.id, ''])),
      free: '',
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
    const target = { ...empty, rules: DEFAULT_RULES };
    expect(missingDefaults(target)).toBe(all);
    expect(missingDefaults({ ...target, raceLibrary: { h: { name: 'human ' } } })).toBe(all - 1);
  });

  it('counts a default skill as present only at its own rarity (MQ.12)', () => {
    const first = DEFAULT_LIBRARY.skills[0];
    if (!first) throw new Error('no default skills');
    const target = { ...empty, rules: DEFAULT_RULES };
    const all = missingDefaults(target);
    const at = (rarity: string) =>
      missingDefaults({ ...target, skillLibrary: { s: { name: first.name, rarity } } });
    expect(at(first.rarity)).toBe(all - 1);
    expect(at(first.rarity === 'mythical' ? 'common' : 'mythical')).toBe(all);
  });

  it('summarises weights biggest first', () => {
    expect(weightSummary(DEFAULT_RULES, warrior.weights)).toBe('Strength 3 · Toughness 2');
  });
});

describe('ML.2 points per level in the library form', () => {
  const blank = (kind: 'class' | 'race' | 'profession') => emptyDraft(kind, DEFAULT_RULES);
  it('reminds of the G budget and warns until the points total it', () => {
    const d = blank('class');
    d.points = { ...d.points, strength: '1', agility: '2' };
    let check = pointsCheck('class', d, DEFAULT_RULES);
    expect(check).toMatchObject({ grade: 'G', budget: 8, total: 3 });
    expect(check.warning).toMatch(/total 3; the G-grade budget for a class level is 8/);
    d.points = { ...d.points, intelligence: '3' };
    d.free = '2';
    check = pointsCheck('class', d, DEFAULT_RULES);
    expect(check).toMatchObject({ total: 8, warning: null });
    expect(pointsCheck('race', blank('race'), DEFAULT_RULES)).toMatchObject({
      budget: 5,
      total: 0,
    });
    expect(pointsCheck('race', blank('race'), DEFAULT_RULES).warning).toMatch(/all free points/);
    expect(pointsCheck('profession', blank('profession'), DEFAULT_RULES).budget).toBe(5);
  });
  it('refuses points that are not whole numbers', () => {
    const d = blank('race');
    d.name = 'Elf';
    d.free = '1.5';
    expect(draftPoints(d)).toBeNull();
    expect(draftProblem('race', d)).toMatch(/whole numbers from 0 to 999/);
    expect(saveCommand('race', d, null, DEFAULT_RULES)).toBeNull();
  });
  it('saves points with the entry, and only once any are set', () => {
    const d = blank('race');
    d.name = 'Elf';
    expect(saveCommand('race', d, null, DEFAULT_RULES)).not.toHaveProperty('points');
    d.points = { ...d.points, perception: '2', intelligence: '2' };
    d.free = '1';
    expect(saveCommand('race', d, null, DEFAULT_RULES)).toMatchObject({
      type: 'raceDef.define',
      points: { stats: { perception: 2, intelligence: 2 }, free: 1 },
    });
  });
  it('shows an old class’s weights as converted points and leaves them alone on other edits', () => {
    const d = draftOf('class', warrior, DEFAULT_RULES);
    // Strength 3 : Toughness 2 at the G class budget of 8.
    expect(d.points['strength']).not.toBe('');
    expect(Number(d.points['strength']) + Number(d.points['toughness'])).toBe(8);
    expect(saveCommand('class', { ...d, name: 'Fighter' }, warrior, DEFAULT_RULES)).toEqual({
      type: 'classDef.edit',
      classDefId: 'w',
      name: 'Fighter',
    });
    const edited = saveCommand(
      'class',
      { ...d, points: { ...d.points, strength: '6' }, free: '0' },
      warrior,
      DEFAULT_RULES,
    );
    expect(edited).toMatchObject({ type: 'classDef.edit', points: { stats: { strength: 6 } } });
  });
  it('blanking every point box clears an entry’s own points (review)', () => {
    const own = { ...warrior, points: { stats: { strength: 1, agility: 2 }, free: 5 } };
    const d = draftOf('class', own, DEFAULT_RULES);
    for (const id of Object.keys(d.points)) d.points[id] = '';
    d.free = '';
    expect(unsavedChanges('class', d, own, DEFAULT_RULES)).toBe(true);
    expect(saveCommand('class', d, own, DEFAULT_RULES)).toEqual({
      type: 'classDef.edit',
      classDefId: 'w',
      points: { stats: {}, free: 0 },
    });
  });
  it('says the weights are set aside only when points replace them (review)', () => {
    const d = draftOf('class', warrior, DEFAULT_RULES);
    expect(weightsSetAside(d, warrior, DEFAULT_RULES)).toBe(false);
    expect(
      weightsSetAside({ ...d, points: { ...d.points, agility: '1' } }, warrior, DEFAULT_RULES),
    ).toBe(true);
    const own = { ...warrior, points: { stats: { strength: 8 }, free: 0 } };
    expect(weightsSetAside(draftOf('class', own, DEFAULT_RULES), own, DEFAULT_RULES)).toBe(true);
    expect(weightsSetAside(emptyDraft('class', DEFAULT_RULES), null, DEFAULT_RULES)).toBe(false);
  });
  it('summarises an entry’s own points for its card (review)', () => {
    expect(
      pointsSummary(DEFAULT_RULES, {
        stats: { strength: 1, agility: 2, intelligence: 3 },
        free: 2,
      }),
    ).toBe('Per level: Intelligence +3 · Agility +2 · Strength +1 · +2 free');
    expect(pointsSummary(DEFAULT_RULES, undefined)).toBe('');
    expect(pointsSummary(DEFAULT_RULES, { stats: {}, free: 0 })).toBe('');
  });
  it('reads a class’s own points back unchanged', () => {
    const own = { ...warrior, points: { stats: { strength: 1, agility: 2 }, free: 5 } };
    const d = draftOf('class', own, DEFAULT_RULES);
    expect(draftPoints(d)).toEqual(own.points);
    expect(unsavedChanges('class', d, own, DEFAULT_RULES)).toBe(false);
  });
});
