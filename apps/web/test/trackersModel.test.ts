import { describe, expect, it } from 'vitest';
import type { Faction } from '@the-system/engine';
import { emptyFactionDraft, factionCommand, factionDraftOf } from '../src/gm/trackersModel';

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
