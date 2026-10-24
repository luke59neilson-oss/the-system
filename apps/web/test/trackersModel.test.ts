import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
  type CampaignState,
  type Command,
  type CommandContext,
  type Faction,
} from '@the-system/engine';
import {
  emptyFactionDraft,
  factionCommand,
  factionDraftOf,
  hungerRows,
  hungryIds,
  parseSteps,
  stepsCommand,
} from '../src/gm/trackersModel';

function stateOf(rules: unknown = DEFAULT_RULES, extra: Command[] = []): CampaignState {
  let n = 0;
  const ctx: CommandContext = {
    actor: { role: 'gm' },
    sessionId: null,
    now: () => '2026-10-24T13:00:00.000Z',
    newId: () => `t${++n}`,
  };
  const kit = [
    { name: 'Basic Archery', rarity: 'inferior' },
    { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
    { name: 'Archer’s Eye', rarity: 'common' },
  ];
  const commands: Command[] = [
    { type: 'campaign.create', name: 'T', rules: JSON.parse(JSON.stringify(rules)) as unknown },
    { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
    { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
    { type: 'hunger.configure', enabled: true },
    ...extra,
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

describe('hunger tracker model (M7.4)', () => {
  it('lists every character with their step, and who has outgrown it', () => {
    const state = stateOf(DEFAULT_RULES, [{ type: 'hunger.set', characterIds: ['kim'], level: 3 }]);
    expect(hungerRows(state)).toEqual([
      { id: 'jake', name: 'Jake', level: 0, step: 'Fed', faded: false },
      { id: 'kim', name: 'Kim', level: 3, step: 'Famished', faded: false },
    ]);
    expect(hungryIds(state)).toEqual(['jake', 'kim']);
    const faded = stateOf({
      ...DEFAULT_RULES,
      hunger: { enabledByDefault: true, fadesAtGrade: 'G' },
    });
    expect(hungerRows(faded).every((r) => r.faded)).toBe(true);
    expect(hungryIds(faded)).toEqual([]);
  });

  it('parses steps one per line or by comma, trimming and dropping blanks', () => {
    expect(parseSteps(' Full \n\nPeckish,  Very   hungry ')).toEqual([
      'Full',
      'Peckish',
      'Very hungry',
    ]);
  });

  it('builds a configure command only for a real, valid change', () => {
    const state = stateOf();
    expect(stepsCommand(state, state.hunger.steps.join('\n'))).toBeNull();
    expect(stepsCommand(state, 'Full\nEmpty')).toEqual({
      type: 'hunger.configure',
      steps: ['Full', 'Empty'],
    });
    expect(stepsCommand(state, 'Only')).toBe('Give at least two hunger steps');
    expect(stepsCommand(state, 'A\na')).toBe('Hunger step "a" is listed twice');
    expect(stepsCommand(state, `A\n${'x'.repeat(41)}`)).toBe('Keep each step to 40 characters');
    expect(stepsCommand(state, Array.from({ length: 13 }, (_, i) => `S${i}`).join('\n'))).toBe(
      'Give at most 12 steps',
    );
  });
});

describe('faction form model (M7.4)', () => {
  const faction: Faction = {
    id: 'f1',
    name: 'Canyon Watch',
    regionId: null,
    members: 12,
    standing: 'Wary',
    notes: '',
    createdAt: '2026-10-24T13:00:00.000Z',
  };

  it('defines a new faction; a blank name builds nothing', () => {
    expect(factionCommand(null, emptyFactionDraft())).toBeNull();
    expect(
      factionCommand(null, { ...emptyFactionDraft(), name: ' Canyon  Watch ', members: '12' }),
    ).toEqual({
      type: 'faction.define',
      name: 'Canyon Watch',
      regionId: null,
      members: 12,
      standing: '',
      notes: '',
    });
  });

  it('edits only what changed, and refuses a bad head count', () => {
    const draft = factionDraftOf(faction);
    expect(factionCommand(faction, draft)).toBeNull();
    expect(factionCommand(faction, { ...draft, standing: 'Allied', members: '' })).toEqual({
      type: 'faction.edit',
      factionId: 'f1',
      name: undefined,
      regionId: undefined,
      members: null,
      standing: 'Allied',
      notes: undefined,
    });
    expect(factionCommand(faction, { ...draft, members: '1.5' })).toBe(
      'Members must be a whole number (or blank)',
    );
    expect(factionCommand(faction, { ...draft, name: ' ' })).toBe('Give the faction a name');
  });
});
