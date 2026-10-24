import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  execute,
  hungerFaded,
  projectForPlayer,
  replay,
  type Campaign,
  type Command,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// M7.4: hunger (fades at E-grade), regions and survivor factions.

const setup = (rules: unknown = rawRules()): Command[] => [
  { type: 'campaign.create', name: 'C', rules },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'mira', name: 'Mira', className: 'Archer', classSkills: kit },
];

const hungerOn: Command = { type: 'hunger.configure', enabled: true };

function rejects(campaign: Campaign, command: Command): string {
  const result = execute(campaign, command, testContext('x'));
  if (result.ok) throw new Error(`${command.type} was accepted`);
  return result.error;
}

describe('hunger tracker (M7.4)', () => {
  it('starts as the rules say (off by default) with five named steps', () => {
    const state = run(setup()).state;
    expect(state?.hunger).toEqual({
      enabled: false,
      steps: ['Fed', 'Peckish', 'Hungry', 'Famished', 'Starving'],
      levels: {},
    });
    const on = run(setup({ ...DEFAULT_RULES, hunger: { enabledByDefault: true, fadesAtGrade: 'E' } }));
    expect(on.state?.hunger.enabled).toBe(true);
  });

  it('players see their own step only while the tracker is on', () => {
    const off = run(setup()).state;
    if (!off) throw new Error('no state');
    expect(projectForPlayer(off, 'jake').hunger).toBeNull();
    const c = run([
      ...setup(),
      hungerOn,
      { type: 'hunger.set', characterIds: ['jake'], level: 2 },
      { type: 'hunger.set', characterIds: ['mira'], level: 4 },
    ]);
    const state = c.state;
    if (!state) throw new Error('no state');
    expect(projectForPlayer(state, 'jake').hunger).toEqual({ level: 2, step: 'Hungry', steps: 5 });
    // Jake's view names nothing about Mira's hunger.
    expect(JSON.stringify(projectForPlayer(state, 'jake'))).not.toContain('Starving');
    const off2 = run([{ type: 'hunger.configure', enabled: false }], testContext('y'), c).state;
    if (!off2) throw new Error('no state');
    expect(projectForPlayer(off2, 'jake').hunger).toBeNull();
  });

  it('moves by a delta, clamped to the steps, and stores absolute levels', () => {
    const c = run([
      ...setup(),
      hungerOn,
      { type: 'hunger.set', characterIds: ['jake', 'mira'], delta: 1 },
      { type: 'hunger.set', characterIds: ['jake'], delta: 9 },
      { type: 'hunger.set', characterIds: ['mira'], delta: -5 },
    ]);
    expect(c.state?.hunger.levels).toEqual({ jake: 4, mira: 0 });
    const last = c.events[c.events.length - 1];
    expect(last?.type).toBe('hunger.levelsSet');
    expect(last?.payload).toEqual({ levels: { mira: 0 } });
    expect(replay(c.events).state).toEqual(c.state);
  });

  it('rejects a change while the tracker is off, unknown characters, and level plus delta', () => {
    const c = run(setup());
    expect(rejects(c, { type: 'hunger.set', characterIds: ['jake'], level: 1 })).toMatch(/off/);
    const on = run([hungerOn], testContext('y'), c);
    expect(rejects(on, { type: 'hunger.set', characterIds: ['nobody'], level: 1 })).toMatch(
      /nobody/,
    );
    expect(
      rejects(on, { type: 'hunger.set', characterIds: ['jake'], level: 1, delta: 1 }),
    ).toMatch(/not both/);
    expect(rejects(on, { type: 'hunger.set', characterIds: [], delta: 1 })).toMatch(/at least one/);
  });

  it('fades at the configured grade: no changes, and the player no longer sees it', () => {
    expect(hungerFaded(DEFAULT_RULES, { grade: 'F' })).toBe(false);
    expect(hungerFaded(DEFAULT_RULES, { grade: 'E' })).toBe(true);
    expect(hungerFaded(DEFAULT_RULES, { grade: 'A' })).toBe(true);
    const c = run([
      ...setup({ ...DEFAULT_RULES, hunger: { enabledByDefault: true, fadesAtGrade: 'G' } }),
    ]);
    const state = c.state;
    if (!state) throw new Error('no state');
    expect(projectForPlayer(state, 'jake').hunger).toBeNull();
    expect(rejects(c, { type: 'hunger.set', characterIds: ['jake'], level: 1 })).toMatch(
      /outgrown hunger \(G-grade\)/,
    );
  });

  it('renames steps; fewer steps clamp stored levels; bad step lists are refused', () => {
    const c = run([
      ...setup(),
      hungerOn,
      { type: 'hunger.set', characterIds: ['jake'], level: 4 },
      { type: 'hunger.configure', steps: [' Full ', 'Empty', 'Desperate'] },
    ]);
    expect(c.state?.hunger).toMatchObject({ steps: ['Full', 'Empty', 'Desperate'] });
    expect(c.state?.hunger.levels['jake']).toBe(2);
    expect(rejects(c, { type: 'hunger.configure', steps: ['Only'] })).toMatch(/at least two/);
    expect(rejects(c, { type: 'hunger.configure', steps: ['A', 'a'] })).toMatch(/twice/);
  });
});

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
    expect(rejects(c, { type: 'faction.edit', factionId: 'f1', regionId: 'nope' })).toMatch(
      /nope/,
    );
  });

  it('only the GM may change trackers', () => {
    const c = run([...setup(), hungerOn]);
    const result = execute(
      c,
      { type: 'hunger.set', characterIds: ['jake'], level: 0 },
      { ...testContext('p'), actor: { role: 'player', characterId: 'jake' } },
    );
    expect(result.ok).toBe(false);
  });
});
