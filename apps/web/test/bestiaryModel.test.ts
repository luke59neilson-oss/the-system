import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
  type CampaignState,
  type Command,
  type CommandContext,
  type Entity,
} from '@the-system/engine';
import {
  emptyEntityDraft,
  entityDefineCommand,
  entityDraftOf,
  entityEditCommand,
  labelLeaks,
} from '../src/gm/bestiaryModel';

function stateOf(): CampaignState {
  let n = 0;
  const ctx: CommandContext = {
    actor: { role: 'gm' },
    sessionId: null,
    now: () => '2026-10-24T02:00:00.000Z',
    newId: () => `e${++n}`,
  };
  const kit = [
    { name: 'Basic Archery', rarity: 'inferior' },
    { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
    { name: 'Archer’s Eye', rarity: 'common' },
  ];
  const commands: Command[] = [
    { type: 'campaign.create', name: 'Beasts', rules: DEFAULT_RULES },
    { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
    { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
  ];
  let c = emptyCampaign();
  for (const command of commands) {
    const r = execute(c, command, ctx);
    if (!r.ok) throw new Error(r.error);
    c = r.campaign;
  }
  if (!c.state) throw new Error('no state');
  return c.state;
}

const hunter = {
  ...emptyEntityDraft(),
  name: ' Pale  hunter ',
  label: 'Pale stalker',
  grade: 'F',
  level: '12',
  stats: { strength: '30', agility: ' ' },
  tiers: { common: '[Pale Hunter]', rare: ' [Immune cell] ' },
  notes: 'Hunts in pairs.',
};

describe('bestiary model (M7.2)', () => {
  it('builds the define command from the draft', () => {
    const state = stateOf();
    expect(entityDefineCommand(state, hunter)).toEqual({
      type: 'entity.define',
      name: 'Pale hunter',
      label: 'Pale stalker',
      tiers: [
        { minRarity: 'common', text: '[Pale Hunter]' },
        { minRarity: 'rare', text: '[Immune cell]' },
      ],
      grade: 'F',
      level: 12,
      stats: { strength: 30 },
      notes: 'Hunts in pairs.',
    });
    expect(entityDefineCommand(state, { ...hunter, label: '' })).toMatchObject({
      label: 'Pale hunter',
    });
    expect(entityDefineCommand(state, { ...hunter, name: '' })).toBe('Give it a name');
    expect(entityDefineCommand(state, { ...hunter, level: '' })).toMatch(/both a grade/i);
    expect(entityDefineCommand(state, { ...hunter, stats: { strength: 'x' } })).toMatch(
      /Strength must be a whole number/,
    );
    expect(entityDefineCommand(state, { ...hunter, tiers: {} })).toMatch(/at least one/);
  });

  it('edits only what changed', () => {
    const state = stateOf();
    const entity: Entity = {
      id: 'h',
      name: 'Pale hunter',
      label: 'Pale stalker',
      tiers: [{ minRarity: 'common', text: '[Pale Hunter]' }],
      grade: 'F',
      level: 12,
      stats: { strength: 30 },
      notes: 'Hunts in pairs.',
      knownBy: [],
      createdAt: '2026-10-24T02:00:00.000Z',
    };
    const draft = entityDraftOf(entity);
    expect(entityEditCommand(state, entity, draft)).toBeNull();
    expect(entityEditCommand(state, entity, { ...draft, level: '14', notes: 'x' })).toEqual({
      type: 'entity.edit',
      entityId: 'h',
      grade: 'F',
      level: 14,
      notes: 'x',
    });
    expect(entityEditCommand(state, entity, { ...draft, stats: {} })).toEqual({
      type: 'entity.edit',
      entityId: 'h',
      stats: null,
    });
  });

  it('warns when an out-of-range target’s label gives it away (D181)', () => {
    const state = stateOf();
    // Level-0 G-grade characters cannot Identify an F-grade beast.
    expect(labelLeaks(state, { ...hunter, label: '' }, [])).toEqual(['Jake', 'Kim']);
    expect(labelLeaks(state, { ...hunter, label: 'Pale hunter (F) lvl 12' }, ['kim'])).toEqual([
      'Kim',
    ]);
    expect(labelLeaks(state, { ...hunter, label: 'F-grade beast' }, [])).toHaveLength(2);
    expect(labelLeaks(state, hunter, [])).toEqual([]);
    expect(labelLeaks(state, { ...hunter, label: 'Pale stalker(s)' }, [])).toEqual([]);
    // In range (a lower grade) or no rank: nothing to warn about.
    expect(labelLeaks(state, { ...hunter, label: '', grade: 'G', level: '0' }, [])).toEqual([]);
    expect(labelLeaks(state, { ...hunter, label: '', grade: '', level: '' }, [])).toEqual([]);
  });
});
