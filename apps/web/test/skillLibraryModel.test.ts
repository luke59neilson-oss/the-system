import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type SkillDef } from '@the-system/engine';
import {
  draftOf,
  draftProblem,
  emptyDraft,
  librarySkills,
  parseTags,
  saveCommand,
} from '../src/gm/skillLibraryModel';

const def = (id: string, name: string, rarity: string, tags: string[] = []): SkillDef => ({
  id,
  name,
  rarity,
  tags,
  description: 'Text.',
  flavor: '',
  effects: 'GM note',
});
const state = {
  rules: DEFAULT_RULES,
  skillLibrary: {
    a: def('a', 'Basic Archery', 'inferior', ['Bow', 'Ranged']),
    b: def('b', 'Identify', 'common', ['Race']),
  },
  skillLibraryOrder: ['b', 'a', 'ghost'],
};

describe('GM skill library form (M4.1)', () => {
  it('parses comma-separated tags', () => {
    expect(parseTags(' Bow, ranged ,, bow, Ranged ,Stealth')).toEqual(['Bow', 'ranged', 'Stealth']);
    expect(parseTags('   ')).toEqual([]);
  });

  it('lists in order and filters by name, rarity name or tag', () => {
    expect(librarySkills(state, '').map((d) => d.id)).toEqual(['b', 'a']);
    expect(librarySkills(state, ' ARCH').map((d) => d.id)).toEqual(['a']);
    expect(librarySkills(state, 'inferior').map((d) => d.id)).toEqual(['a']);
    expect(librarySkills(state, 'race').map((d) => d.id)).toEqual(['b']);
    expect(librarySkills(state, 'zzz')).toEqual([]);
  });

  it('a new draft defines with trimmed text', () => {
    const draft = { ...emptyDraft(DEFAULT_RULES.skills.rarities), name: ' Zap ', tags: 'a, b' };
    expect(draft.rarity).toBe('inferior');
    expect(saveCommand(draft, null)).toEqual({
      type: 'skillDef.define',
      name: 'Zap',
      rarity: 'inferior',
      tags: ['a', 'b'],
      description: '',
      flavor: '',
      effects: '',
    });
  });

  it('an edit sends only changed fields, or nothing', () => {
    const stored = state.skillLibrary.a;
    expect(saveCommand(draftOf(stored), stored)).toBeNull();
    expect(saveCommand({ ...draftOf(stored), tags: 'Bow,Ranged ' }, stored)).toBeNull();
    expect(saveCommand({ ...draftOf(stored), flavor: ' Aim. ', tags: 'Bow' }, stored)).toEqual({
      type: 'skillDef.edit',
      skillDefId: 'a',
      flavor: 'Aim.',
      tags: ['Bow'],
    });
  });
});

describe('spell fields in the skill form (MU.4)', () => {
  const blank = () => ({ ...emptyDraft(DEFAULT_RULES.skills.rarities), name: 'Arcane Bolt' });

  it('a new spell sends its cost, casting text and the spell tag', () => {
    const draft = {
      ...blank(),
      tags: 'Arcane, spell',
      spell: true,
      costPool: 'mp',
      costAmount: ' 15 ',
      cooldown: ' 10 seconds',
      range: '30 m',
      castingNotes: 'Speak the word.',
    };
    expect(saveCommand(draft, null)).toMatchObject({
      type: 'skillDef.define',
      tags: ['Arcane', 'spell'],
      cost: { pool: 'mp', amount: 15 },
      cooldown: '10 seconds',
      range: '30 m',
      castingNotes: 'Speak the word.',
    });
    // No cost: the define carries none.
    expect(saveCommand(blank(), null)).not.toHaveProperty('cost');
  });

  it('refuses a cost that is not a whole number or has no pool', () => {
    for (const costAmount of ['0', '1.5', '-3', 'ten', '']) {
      const d = { ...blank(), costPool: 'mp', costAmount };
      expect(draftProblem(d)).toMatch(/whole number/);
      expect(saveCommand(d, null)).toBeNull();
    }
    expect(draftProblem({ ...blank(), costAmount: '5' })).toMatch(/pool/);
  });

  it('round-trips a stored spell and sends only what changed', () => {
    const stored: SkillDef = {
      ...def('s', 'Arcane Bolt', 'common', ['Spell', 'Arcane']),
      cost: { pool: 'mp', amount: 15 },
      range: '30 m',
    };
    const d = draftOf(stored);
    expect(d).toMatchObject({ spell: true, tags: 'Arcane', costPool: 'mp', costAmount: '15' });
    expect(saveCommand({ ...d, costAmount: '20' }, stored)).toEqual({
      type: 'skillDef.edit',
      skillDefId: 's',
      cost: { pool: 'mp', amount: 20 },
    });
    expect(saveCommand({ ...d, costPool: '', costAmount: '', range: '' }, stored)).toEqual({
      type: 'skillDef.edit',
      skillDefId: 's',
      cost: null,
      range: '',
    });
    expect(saveCommand({ ...d, spell: false }, stored)).toEqual({
      type: 'skillDef.edit',
      skillDefId: 's',
      tags: ['Arcane'],
    });
  });
});
