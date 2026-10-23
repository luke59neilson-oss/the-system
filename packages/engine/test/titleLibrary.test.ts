import { describe, expect, it } from 'vitest';
import {
  characterEffectiveStats,
  execute,
  notificationsBetween,
  projectForPlayer,
  replay,
  type Campaign,
  type Command,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// M6.4 title library (DESIGN §4 "Bonuses", §7 "Titles"): titles carry System
// text and percentage (optionally flat) bonuses; held titles count in
// effective stats, percentages add and apply once; the holder sees the text.

const ctx = testContext('ti');
const base = (): Campaign =>
  run(
    [
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      {
        type: 'character.create',
        id: 'jake',
        name: 'Jake',
        className: 'Archer',
        classSkills: kit,
      },
      {
        type: 'character.create',
        id: 'kim',
        name: 'Kim',
        className: 'Archer',
        classSkills: kit,
      },
    ],
    ctx,
  );

function ok(c: Campaign, command: Command): Campaign {
  const result = execute(c, command, ctx);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}
function reject(c: Campaign, command: Command): string {
  const result = execute(c, command, ctx);
  expect(result.ok).toBe(false);
  return result.ok ? '' : result.error;
}

const spread: Command = {
  type: 'titleDef.define',
  id: 'spread',
  name: 'Rapid Spread',
  text: 'You have propagated through the Host faster than any before you.',
  bonuses: [
    { stat: 'agility', percent: 0.1 },
    { stat: 'vitality', percent: 0.05, flat: 2 },
  ],
};
const runner: Command = {
  type: 'titleDef.define',
  id: 'runner',
  name: 'Forerunner',
  text: 'First to set foot.',
  bonuses: [{ stat: 'agility', percent: 0.1 }],
};
const stats = (c: Campaign, id: string) => {
  if (!c.state) throw new Error('no state');
  return characterEffectiveStats(c.state, id);
};

describe('title library (M6.4)', () => {
  it('a held library title adds its bonuses; percentages add, then apply once', () => {
    let c = ok(ok(base(), spread), runner);
    expect(stats(c, 'jake')['agility']).toBe(10);
    c = ok(c, { type: 'title.award', characterId: 'jake', title: 'rapid spread' });
    expect(stats(c, 'jake')['agility']).toBe(11);
    // (10 + 2) × 1.05 = 12.6 → 13
    expect(stats(c, 'jake')['vitality']).toBe(13);
    c = ok(c, { type: 'title.award', characterId: 'jake', title: 'Forerunner' });
    // 10 × (1 + 0.1 + 0.1) = 12
    expect(stats(c, 'jake')['agility']).toBe(12);
    expect(stats(c, 'kim')['agility']).toBe(10);
  });

  it('a full pool stays full when a title raises its maximum; an edit reaches every holder', () => {
    let c = ok(base(), {
      type: 'titleDef.define',
      id: 'tough',
      name: 'Tough',
      bonuses: [{ stat: 'vitality', percent: 0.5 }],
    });
    c = ok(c, { type: 'title.award', characterId: 'jake', title: 'Tough' });
    expect(c.state?.characters['jake']?.pools['hp']).toBe(150);
    c = ok(c, {
      type: 'titleDef.edit',
      titleDefId: 'tough',
      bonuses: [{ stat: 'vitality', percent: 1 }],
    });
    expect(c.state?.characters['jake']?.pools['hp']).toBe(200);
    expect(replay(c.events).state).toEqual(c.state);
  });

  it('refuses a duplicate name, an unknown stat, a stat listed twice, or an empty edit', () => {
    const c = ok(base(), spread);
    expect(reject(c, { ...runner, name: ' RAPID spread ' })).toContain(
      'already has [Rapid Spread]',
    );
    expect(reject(c, { ...runner, bonuses: [{ stat: 'luck', percent: 0.1 }] })).toContain(
      'Unknown stat',
    );
    expect(
      reject(c, {
        ...runner,
        bonuses: [
          { stat: 'agility', percent: 0.1 },
          { stat: 'agility', flat: 1 },
        ],
      }),
    ).toContain('listed twice');
    expect(
      reject(c, { type: 'titleDef.edit', titleDefId: 'spread', name: 'Rapid Spread' }),
    ).toContain('nothing to change');
    expect(reject(c, { type: 'titleDef.edit', titleDefId: 'nope', text: 'x' })).toContain(
      'unknown library title',
    );
  });

  it('the holder sees their titles’ text and bonuses; nobody gets the library', () => {
    let c = ok(ok(base(), spread), runner);
    c = ok(c, { type: 'title.award', characterId: 'jake', title: 'Rapid Spread' });
    if (!c.state) throw new Error('no state');
    const jake = projectForPlayer(c.state, 'jake');
    expect(jake.me?.titleDetails).toEqual([
      {
        name: 'Rapid Spread',
        text: 'You have propagated through the Host faster than any before you.',
        bonuses: spread.type === 'titleDef.define' ? spread.bonuses : [],
      },
    ]);
    const kim = JSON.stringify(projectForPlayer(c.state, 'kim'));
    expect(kim).not.toContain('Forerunner');
    expect(kim).not.toContain('propagated');
    expect(JSON.stringify(jake)).not.toContain('Forerunner');
  });

  it('an award tells only the holder, with the System text', () => {
    const before = ok(base(), spread);
    const after = ok(before, { type: 'title.award', characterId: 'kim', title: 'rapid SPREAD' });
    expect(notificationsBetween(before.state, after.state, after.events.at(-1))).toEqual([
      {
        kind: 'title',
        characterId: 'kim',
        title: 'Rapid Spread',
        text: 'You have propagated through the Host faster than any before you.',
      },
    ]);
  });

  it('players cannot define or edit titles', () => {
    const r = execute(base(), runner, { ...ctx, actor: { role: 'player', characterId: 'jake' } });
    expect(r.ok).toBe(false);
  });
});
