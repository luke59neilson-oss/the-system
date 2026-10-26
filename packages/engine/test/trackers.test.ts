import { describe, expect, it } from 'vitest';
import { execute, projectForPlayer, type Campaign, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// M7.4: regions and survivor factions (the hunger tracker was retired by MT.3).

const setup = (rules: unknown = rawRules()): Command[] => [
  { type: 'campaign.create', name: 'C', rules },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'mira', name: 'Mira', className: 'Archer', classSkills: kit },
];

function rejects(campaign: Campaign, command: Command): string {
  const result = execute(campaign, command, testContext('x'));
  if (result.ok) throw new Error(`${command.type} was accepted`);
  return result.error;
}

describe('regions (M7.4)', () => {
  const regions: Command[] = [
    { type: 'region.define', regionId: 'crown', name: 'The Crown', notes: 'Spawn.' },
    { type: 'region.define', regionId: 'drum', name: 'The Drum', notes: 'The heart: finale.' },
  ];

  it('the current region becomes visited; players see only its name', () => {
    const c = run([...setup(), ...regions, { type: 'region.setCurrent', regionId: 'crown' }]);
    const state = c.state;
    if (!state) throw new Error('no state');
    expect(state.currentRegion).toBe('crown');
    expect(state.regions['crown']?.visited).toBe(true);
    expect(state.regions['drum']?.visited).toBe(false);
    const view = projectForPlayer(state, 'jake');
    expect(view.region).toBe('The Crown');
    const json = JSON.stringify(view);
    expect(json).not.toContain('The Drum');
    expect(json).not.toContain('Spawn.');
  });

  it('edits keep omitted fields; moving on keeps the old region visited; null clears', () => {
    const c = run([
      ...setup(),
      ...regions,
      { type: 'region.setCurrent', regionId: 'crown' },
      { type: 'region.edit', regionId: 'crown', name: 'The Crown (snout)' },
      { type: 'region.setCurrent', regionId: 'drum' },
      { type: 'region.setCurrent', regionId: null },
    ]);
    const state = c.state;
    if (!state) throw new Error('no state');
    expect(state.regions['crown']).toMatchObject({ name: 'The Crown (snout)', notes: 'Spawn.' });
    expect(state.regions['crown']?.visited).toBe(true);
    expect(state.regions['drum']?.visited).toBe(true);
    expect(state.currentRegion).toBeNull();
    expect(projectForPlayer(state, 'jake').region).toBeNull();
  });

  it('rejects unknown regions, duplicates, empty edits and a no-op move', () => {
    const c = run([...setup(), ...regions, { type: 'region.setCurrent', regionId: 'crown' }]);
    expect(rejects(c, { type: 'region.setCurrent', regionId: 'nowhere' })).toMatch(/nowhere/);
    expect(rejects(c, { type: 'region.setCurrent', regionId: 'crown' })).toMatch(/already/);
    expect(rejects(c, { type: 'region.define', regionId: 'crown', name: 'X' })).toMatch(/exists/);
    expect(rejects(c, { type: 'region.edit', regionId: 'crown' })).toMatch(/nothing/);
    expect(rejects(c, { type: 'region.define', name: '  ' })).toMatch(/blank/);
    expect(rejects(c, { type: 'region.define', name: ' the crown ' })).toMatch(/already called/);
    expect(rejects(c, { type: 'region.edit', regionId: 'drum', name: 'The Crown' })).toMatch(
      /already called/,
    );
  });
});

describe('survivor factions (M7.4)', () => {
  it('are GM-only bookkeeping: name, region, head count, standing, notes', () => {
    const c = run([
      ...setup(),
      { type: 'region.define', regionId: 'rake', name: 'Rake Canyons' },
      {
        type: 'faction.define',
        factionId: 'f1',
        name: 'Canyon Watch',
        regionId: 'rake',
        members: 12,
        standing: 'Wary',
        notes: 'Led by a former nurse.',
      },
      { type: 'faction.edit', factionId: 'f1', standing: 'Friendly', members: null },
    ]);
    const state = c.state;
    if (!state) throw new Error('no state');
    expect(state.factions['f1']).toMatchObject({
      name: 'Canyon Watch',
      regionId: 'rake',
      members: null,
      standing: 'Friendly',
      notes: 'Led by a former nurse.',
    });
    const json = JSON.stringify(projectForPlayer(state, 'jake'));
    expect(json).not.toContain('Canyon Watch');
    expect(json).not.toContain('nurse');
  });

  it('rejects an unknown region, a duplicate id and an empty edit', () => {
    const c = run([...setup(), { type: 'faction.define', factionId: 'f1', name: 'A' }]);
    expect(rejects(c, { type: 'faction.define', name: 'B', regionId: 'nope' })).toMatch(/nope/);
    expect(rejects(c, { type: 'faction.define', factionId: 'f1', name: 'B' })).toMatch(/exists/);
    expect(rejects(c, { type: 'faction.edit', factionId: 'f1' })).toMatch(/nothing/);
    expect(rejects(c, { type: 'faction.edit', factionId: 'f9', name: 'Z' })).toMatch(/f9/);
    expect(rejects(c, { type: 'faction.edit', factionId: 'f1', regionId: 'nope' })).toMatch(/nope/);
  });

  // MT.8 (Q69): a revealed faction shows players its name and standing only.
  describe('reveal toggle (MT.8)', () => {
    const defined: Command[] = [
      ...setup(),
      { type: 'region.define', regionId: 'rake', name: 'Rake Canyons' },
      {
        type: 'faction.define',
        factionId: 'f1',
        name: 'Canyon Watch',
        regionId: 'rake',
        members: 12,
        standing: 'Wary',
        notes: 'Led by a former nurse.',
      },
      { type: 'faction.define', factionId: 'f2', name: 'Pale Choir', standing: 'Hostile' },
    ];

    it('unrevealed factions never reach players; revealed ones show name and standing only', () => {
      const hidden = run(defined);
      for (const id of ['jake', 'mira']) {
        const view = projectForPlayer(hidden.state!, id);
        expect(view.factions).toEqual([]);
        const json = JSON.stringify(view);
        for (const secret of ['Canyon Watch', 'Wary', 'Pale Choir', 'Hostile']) {
          expect(json).not.toContain(secret);
        }
      }
      const shown = run(
        [{ type: 'faction.reveal', factionId: 'f1', revealed: true }],
        testContext('mt8-1'),
        hidden,
      );
      const view = projectForPlayer(shown.state!, 'mira');
      expect(view.factions).toEqual([{ name: 'Canyon Watch', standing: 'Wary' }]);
      const json = JSON.stringify(view);
      expect(json).not.toContain('nurse');
      expect(json).not.toContain('Pale Choir');
      expect(json).not.toContain('"members"');
      // The base region is not revealed by the faction (no current region is set).
      expect(json).not.toContain('Rake Canyons');
    });

    it('edits to a revealed faction reach players; hiding it again removes it', () => {
      const c = run([
        ...defined,
        { type: 'faction.reveal', factionId: 'f2', revealed: true },
        { type: 'faction.reveal', factionId: 'f1', revealed: true },
        { type: 'faction.edit', factionId: 'f1', standing: 'Allied', name: 'The Watch' },
      ]);
      // Definition order, not reveal order.
      expect(projectForPlayer(c.state!, 'jake').factions).toEqual([
        { name: 'The Watch', standing: 'Allied' },
        { name: 'Pale Choir', standing: 'Hostile' },
      ]);
      const hidden = run(
        [{ type: 'faction.reveal', factionId: 'f1', revealed: false }],
        testContext('mt8-2'),
        c,
      );
      expect(projectForPlayer(hidden.state!, 'jake').factions).toEqual([
        { name: 'Pale Choir', standing: 'Hostile' },
      ]);
      expect(JSON.stringify(projectForPlayer(hidden.state!, 'jake'))).not.toContain('The Watch');
    });

    it('is undoable, refuses an unknown faction and a no-op, and is GM-only', () => {
      const shown = run([...defined, { type: 'faction.reveal', factionId: 'f1', revealed: true }]);
      const undone = run(
        [{ type: 'event.undo', eventId: shown.events.at(-1)!.id }],
        testContext('mt8-3'),
        shown,
      );
      expect(projectForPlayer(undone.state!, 'jake').factions).toEqual([]);
      expect(rejects(shown, { type: 'faction.reveal', factionId: 'f9', revealed: true })).toMatch(
        /f9/,
      );
      expect(rejects(shown, { type: 'faction.reveal', factionId: 'f1', revealed: true })).toMatch(
        /already revealed/,
      );
      expect(rejects(shown, { type: 'faction.reveal', factionId: 'f2', revealed: false })).toMatch(
        /already hidden/,
      );
      const asPlayer = execute(
        shown,
        { type: 'faction.reveal', factionId: 'f2', revealed: true },
        { ...testContext('p'), actor: { role: 'player', characterId: 'jake' } },
      );
      expect(asPlayer.ok).toBe(false);
    });
  });

  it('only the GM may change trackers', () => {
    const c = run(setup());
    const result = execute(
      c,
      { type: 'region.define', name: 'The Crown' },
      { ...testContext('p'), actor: { role: 'player', characterId: 'jake' } },
    );
    expect(result.ok).toBe(false);
  });
});
