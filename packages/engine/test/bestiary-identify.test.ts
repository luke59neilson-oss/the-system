// MV.3 (DESIGN §7 "Identify"): failing tests first; the engine work follows on wip/MV.3.
import { describe, expect, it } from 'vitest';
import { execute, projectForPlayer, type Campaign, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

const ctx = testContext('mv3');
const base = (): Campaign =>
  run(
    [
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
      { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
    ],
    ctx,
  );
function ok(c: Campaign, command: Command): Campaign {
  const r = execute(c, command, ctx);
  if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
  return r.campaign;
}
function reject(c: Campaign, command: Command): string {
  const r = execute(c, command, ctx);
  expect(r.ok, JSON.stringify(command)).toBe(false);
  return r.ok ? '' : r.error;
}

describe('Identify stays Common for good (MV.3)', () => {
  it('refuses marks and upgrades with a clear message', () => {
    const c = base();
    expect(
      reject(c, { type: 'skill.awardMark', characterId: 'jake', skill: 'Identify', session: 's1' }),
    ).toMatch(/Identify never changes/);
    expect(reject(c, { type: 'skill.upgrade', characterId: 'jake', skill: 'Identify' })).toMatch(
      /Identify never changes/,
    );
  });
});

describe('Identified by… and the player bestiary (MV.3)', () => {
  const define = (c: Campaign): Campaign =>
    ok(
      ok(c, { type: 'bestiary.categoryDefine', categoryId: 'beasts', name: 'Beasts' } as Command),
      {
        type: 'entity.define',
        entityId: 'stalker',
        name: 'Pale stalker (immune cell)',
        label: 'Pale stalker',
        tiers: [{ minRarity: 'common', text: '[Pale Stalker – lvl 0]' }],
        knownBy: [],
        grade: 'G',
        level: 0,
        categoryId: 'beasts',
      } as Command,
    );

  it('decides worked or out of range when marked, and keeps it after a level-up', () => {
    let c = define(base());
    c = ok(c, { type: 'entity.identify', entityId: 'stalker', characterIds: ['kim'] } as Command);
    if (!c.state) throw new Error('no state');
    const kim = projectForPlayer(c.state, 'kim') as unknown as {
      bestiary: { categories: { name: string; entries: { label: string; text: string | null }[] }[] };
    };
    const beasts = kim.bestiary.categories.find((g) => g.name === 'Beasts');
    expect(beasts?.entries[0]).toMatchObject({ label: 'Pale stalker', text: '[Pale Stalker – lvl 0]' });
    // Nothing unmarked, no GM name or notes reach the player.
    expect(JSON.stringify(projectForPlayer(c.state, 'jake'))).not.toContain('Pale stalker');
    expect(JSON.stringify(projectForPlayer(c.state, 'kim'))).not.toContain('immune cell');
  });
});
