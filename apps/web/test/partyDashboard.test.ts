import { describe, expect, it } from 'vitest';
import { createCharacter, defaultRules, type Character } from '@the-system/engine';
import { draftOf, flagView, sheetPlan, type SheetDraft } from '../src/gm/partyDashboardModel';

const rules = defaultRules();
const jake: Character = {
  ...createCharacter(rules, {
    id: 'jake',
    name: 'Jake',
    className: 'Archer',
    classSkills: [
      { name: 'Basic Archery', rarity: 'inferior' },
      { name: 'Basic Stealth', rarity: 'inferior' },
      { name: 'Archer’s Eye', rarity: 'common' },
    ],
  }),
};
const edit = (patch: Partial<SheetDraft>): SheetDraft => ({ ...draftOf(jake), ...patch });

describe('sheetPlan (M4.5)', () => {
  it('sends nothing when nothing changed', () => {
    expect(sheetPlan(rules, jake, draftOf(jake), draftOf(jake))).toEqual({
      ok: true,
      commands: [],
    });
  });

  it('sends one command per kind of change, stats before pools', () => {
    const base = draftOf(jake);
    const draft = edit({
      name: ' Jake Thayne ',
      stats: { ...base.stats, vitality: '12', strength: '11' },
      pools: { ...base.pools, hp: '115' },
      nicknames: { ...base.nicknames, 'Basic Archery': 'Pew' },
      unique: { ...base.unique, 'Basic Archery': true },
    });
    const plan = sheetPlan(rules, jake, base, draft);
    expect(plan).toEqual({
      ok: true,
      commands: [
        { type: 'character.rename', characterId: 'jake', name: 'Jake Thayne' },
        { type: 'character.setStats', characterId: 'jake', stats: { strength: 11, vitality: 12 } },
        { type: 'character.setPools', characterId: 'jake', pools: { hp: 115 } },
        { type: 'skill.nickname', characterId: 'jake', skill: 'Basic Archery', nickname: 'Pew' },
        { type: 'skill.setUnique', characterId: 'jake', skill: 'Basic Archery', unique: true },
      ],
    });
  });

  it('does not write back a pool that moved live while the editor was open', () => {
    const base = draftOf(jake);
    const hit: Character = { ...jake, pools: { ...jake.pools, hp: 40 } };
    const draft = { ...base, stats: { ...base.stats, strength: '12' } };
    const plan = sheetPlan(rules, hit, base, draft);
    expect(plan.ok && plan.commands.map((c) => c.type)).toEqual(['character.setStats']);
  });

  it('clears a nickname with an empty field', () => {
    const named: Character = {
      ...jake,
      skills: jake.skills.map((s) => (s.name === 'Basic Archery' ? { ...s, nickname: 'Pew' } : s)),
    };
    const base = draftOf(named);
    const plan = sheetPlan(rules, named, base, {
      ...base,
      nicknames: { ...base.nicknames, 'Basic Archery': ' ' },
    });
    expect(plan).toEqual({
      ok: true,
      commands: [
        { type: 'skill.nickname', characterId: 'jake', skill: 'Basic Archery', nickname: null },
      ],
    });
  });

  it('refuses blank names, negative, fractional and non-numeric values', () => {
    const base = draftOf(jake);
    expect(sheetPlan(rules, jake, base, edit({ name: '  ' }))).toEqual({
      ok: false,
      error: 'The name cannot be empty',
    });
    for (const bad of ['-1', '1.5', 'ten', '']) {
      const plan = sheetPlan(rules, jake, base, edit({ stats: { ...base.stats, strength: bad } }));
      expect(plan).toEqual({ ok: false, error: 'Strength must be a whole number of 0 or more' });
    }
    const big = sheetPlan(
      rules,
      jake,
      base,
      edit({ pools: { ...base.pools, hp: '1'.repeat(20) } }),
    );
    expect(big.ok).toBe(false);
  });
});

describe('flagView (M4.5)', () => {
  it('says who each flag waits on', () => {
    expect(flagView({ kind: 'selection', level: 5, capstone: false, offered: false })).toEqual({
      key: 'selection-5',
      text: 'Selection (lvl 5): build the menu',
      owner: 'gm',
    });
    expect(flagView({ kind: 'selection', level: 10, capstone: true, offered: true }).text).toBe(
      'Capstone selection (lvl 10): player choosing',
    );
    expect(flagView({ kind: 'evolution', toGrade: 'F', status: 'ready' }).owner).toBe('gm');
    expect(flagView({ kind: 'evolution', toGrade: 'E', status: 'blocked' }).text).toBe(
      'Evolution to E-grade: waits on a selection',
    );
    expect(flagView({ kind: 'evolution', toGrade: 'F', status: 'released' }).owner).toBe('player');
    expect(flagView({ kind: 'upgrade', skill: 'Basic Archery', marks: 3 }).text).toBe(
      '[Basic Archery] can upgrade (3 marks)',
    );
    expect(flagView({ kind: 'merge', skills: ['A', 'B'], count: 3 }).text).toBe(
      'Merge ready: [A] + [B] (logged 3×)',
    );
    expect(flagView({ kind: 'freePoints', points: 1 }).text).toBe('1 free point to assign');
    expect(flagView({ kind: 'freePoints', points: 2 }).text).toBe('2 free points to assign');
  });
});
