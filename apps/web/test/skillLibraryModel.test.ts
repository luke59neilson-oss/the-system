import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type SkillDef } from '@the-system/engine';
import {
  draftOf,
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
