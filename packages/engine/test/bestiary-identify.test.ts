// MV.3 (DESIGN §7 "Identify"): Identify stays Common; Identified by… and the player bestiary.
import { describe, expect, it } from 'vitest';
import {
  execute,
  notificationsBetween,
  projectForPlayer,
  replay,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
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
const player = (characterId: string): CommandContext => ({
  ...ctx,
  actor: { role: 'player', characterId },
});
function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const r = execute(c, command, context);
  if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
  return r.campaign;
}
function reject(c: Campaign, command: Command, context: CommandContext = ctx): string {
  const r = execute(c, command, context);
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
    const ready = ok(c, {
      type: 'xp.award',
      track: 'class',
      amount: 400,
      participants: [{ characterId: 'jake' }],
    });
    const release = (extra: object): Command =>
      ({
        type: 'evolution.release',
        rerateApproved: true,
        characterId: 'jake',
        options: [{ className: 'Hunter' }],
        ...extra,
      }) as Command;
    expect(reject(ready, release({ rerate: { Identify: 'uncommon' } }))).toMatch(
      /Identify never changes/,
    );
    // Naming it at its own rarity (the kept list) is fine.
    ok(ready, release({ rerate: { Identify: 'common' } }));
  });
});

describe('Identified by… and the player bestiary (MV.3)', () => {
  const define = (c: Campaign): Campaign =>
    ok(ok(c, { type: 'bestiary.categoryDefine', categoryId: 'beasts', name: 'Beasts' }), {
      type: 'entity.define',
      entityId: 'stalker',
      name: 'Pale stalker (immune cell)',
      label: 'Pale stalker',
      tiers: [{ minRarity: 'common', text: '[Pale Stalker – lvl 0]' }],
      knownBy: [],
      grade: 'G',
      level: 0,
      categoryId: 'beasts',
    });

  it('decides worked or out of range when marked, and keeps it after a level-up', () => {
    let c = define(base());
    c = ok(c, { type: 'entity.identify', entityId: 'stalker', characterIds: ['kim'] });
    if (!c.state) throw new Error('no state');
    const kim = projectForPlayer(c.state, 'kim') as unknown as {
      bestiary: {
        categories: { name: string; entries: { label: string; text: string | null }[] }[];
      };
    };
    const beasts = kim.bestiary.categories.find((g) => g.name === 'Beasts');
    expect(beasts?.entries[0]).toMatchObject({
      label: 'Pale stalker',
      text: '[Pale Stalker – lvl 0]',
    });
    // Nothing unmarked, no GM name or notes reach the player.
    expect(JSON.stringify(projectForPlayer(c.state, 'jake'))).not.toContain('Pale stalker');
    expect(JSON.stringify(projectForPlayer(c.state, 'kim'))).not.toContain('immune cell');
  });

  type Bestiary = {
    categories: {
      id: string | null;
      name: string;
      entries: { id: string; label: string; inRange: boolean; text: string | null }[];
    }[];
    notices: { id: string; text: string | null }[];
  };
  const bestiary = (c: Campaign, id: string): Bestiary => {
    if (!c.state) throw new Error('no state');
    return projectForPlayer(c.state, id).bestiary as unknown as Bestiary;
  };
  const xp = (c: Campaign, characterId: string, amount: number): Campaign =>
    ok(c, { type: 'xp.award', track: 'class', amount, participants: [{ characterId }] });
  const brute = (c: Campaign): Campaign =>
    ok(c, {
      type: 'entity.define',
      entityId: 'brute',
      name: 'Bone brute (GM)',
      label: 'Bone brute',
      tiers: [{ minRarity: 'common', text: '[Bone Brute – lvl 3]' }],
      grade: 'G',
      level: 3,
    });

  it('an out-of-range result is kept after a level-up until the GM marks it again', () => {
    let c = brute(base());
    c = ok(c, { type: 'entity.identify', entityId: 'brute', characterIds: ['kim'] });
    const entry = () => bestiary(c, 'kim').categories[0]?.entries[0];
    expect(bestiary(c, 'kim').categories[0]).toMatchObject({ id: null, name: 'Uncategorized' });
    expect(entry()).toMatchObject({ label: 'Bone brute', inRange: false, text: null });
    c = xp(c, 'kim', 300);
    expect(c.state?.characters.kim?.classLevel).toBeGreaterThanOrEqual(2);
    expect(entry()).toMatchObject({ inRange: false, text: null });
    // Marking again re-decides (now in range) and notifies again.
    c = ok(c, { type: 'entity.closeNotice', entityId: 'brute', characterId: 'kim' }, player('kim'));
    expect(bestiary(c, 'kim').notices).toEqual([]);
    const before = c.state;
    c = ok(c, { type: 'entity.identify', entityId: 'brute', characterIds: ['kim'] });
    expect(entry()).toMatchObject({ inRange: true, text: '[Bone Brute – lvl 3]' });
    expect(bestiary(c, 'kim').notices).toMatchObject([
      { id: 'brute', text: '[Bone Brute – lvl 3]' },
    ]);
    expect(
      notificationsBetween(before, c.state, c.events.at(-1)).map((n) => [n.kind, n.characterId]),
    ).toEqual([['identify', 'kim']]);
    // A worked result is kept too: a later GM level edit does not re-decide.
    c = ok(c, { type: 'entity.edit', entityId: 'brute', level: 200 });
    expect(entry()?.inRange).toBe(true);
    expect(replay(JSON.parse(JSON.stringify(c.events)) as unknown[]).state).toEqual(c.state);
  });

  it('the notification stays open until the owner closes it', () => {
    let c = define(base());
    c = ok(c, { type: 'entity.identify', entityId: 'stalker', characterIds: ['kim', 'jake'] });
    expect(bestiary(c, 'kim').notices.map((n) => n.id)).toEqual(['stalker']);
    expect(
      reject(
        c,
        { type: 'entity.closeNotice', entityId: 'stalker', characterId: 'kim' },
        player('jake'),
      ),
    ).toMatch(/own character/);
    c = ok(
      c,
      { type: 'entity.closeNotice', entityId: 'stalker', characterId: 'kim' },
      player('kim'),
    );
    expect(bestiary(c, 'kim').notices).toEqual([]);
    expect(bestiary(c, 'jake').notices.map((n) => n.id)).toEqual(['stalker']);
    // A second close changes nothing.
    const twice = ok(
      c,
      { type: 'entity.closeNotice', entityId: 'stalker', characterId: 'kim' },
      player('kim'),
    );
    expect(twice.state?.entities).toEqual(c.state?.entities);
    // It stays in the bestiary after closing.
    expect(bestiary(c, 'kim').categories[0]?.entries.map((e) => e.id)).toEqual(['stalker']);
    expect(reject(c, { type: 'entity.identify', entityId: 'stalker', characterIds: [] })).toMatch(
      /at least one/,
    );
  });

  it('categories: GM order, Uncategorized last, unused names never sent, removal uncategorizes', () => {
    let c = define(base());
    c = ok(c, { type: 'bestiary.categoryDefine', categoryId: 'secret', name: 'Hidden SPOILER' });
    c = brute(c);
    c = ok(c, { type: 'entity.identify', entityId: 'brute', characterIds: ['kim'] });
    c = ok(c, { type: 'entity.identify', entityId: 'stalker', characterIds: ['kim'] });
    expect(bestiary(c, 'kim').categories.map((g) => g.name)).toEqual(['Beasts', 'Uncategorized']);
    expect(JSON.stringify(projectForPlayer(c.state!, 'kim'))).not.toContain('SPOILER');
    expect(reject(c, { type: 'bestiary.categoryDefine', name: ' beasts ' })).toMatch(/already has/);
    expect(reject(c, { type: 'entity.edit', entityId: 'brute', categoryId: 'nope' })).toMatch(
      /unknown bestiary category/,
    );
    c = ok(c, { type: 'bestiary.categoryRename', categoryId: 'beasts', name: 'Creatures' });
    expect(bestiary(c, 'kim').categories[0]?.name).toBe('Creatures');
    c = ok(c, { type: 'entity.edit', entityId: 'brute', categoryId: 'secret' });
    expect(bestiary(c, 'kim').categories.map((g) => g.name)).toEqual([
      'Creatures',
      'Hidden SPOILER',
    ]);
    c = ok(c, { type: 'bestiary.categoryRemove', categoryId: 'beasts' });
    expect(c.state?.entities.stalker?.categoryId).toBeNull();
    expect(bestiary(c, 'kim').categories.map((g) => g.name)).toEqual([
      'Hidden SPOILER',
      'Uncategorized',
    ]);
    expect(replay(JSON.parse(JSON.stringify(c.events)) as unknown[]).state).toEqual(c.state);
  });
});
