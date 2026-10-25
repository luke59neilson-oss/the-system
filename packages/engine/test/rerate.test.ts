import { describe, expect, it } from 'vitest';
import {
  defaultRerate,
  execute,
  projectForPlayer,
  replay,
  type Campaign,
  type Character,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

/**
 * MR.1 (DESIGN §6, L14): an evolution re-rates every skill it does not
 * transform: one rarity down by default (never below Inferior), set per skill
 * by the GM within the new grade's ceiling. Marks, text and effects stay.
 * MT.1 (L19) replaced the default drop with an approved list, so these tests
 * pin how a release stored under MR.1 still replays: `released` writes the
 * MR.1 list (default drop plus overrides) and drops MT.1's approval mark
 * from the log. MT.1's own rules are in `rerateApproval.test.ts`.
 */
const ctx = testContext('r');
const player = (characterId: string): CommandContext => ({
  ...ctx,
  actor: { role: 'player', characterId },
});
const [archery, , eye] = kit.map((k) => k.name) as [string, string, string];
const created: Command = { type: 'campaign.create', name: 'Whale', rules: rawRules() };
const make = (id: string, name: string): Command => ({
  type: 'character.create',
  id,
  name,
  className: 'Archer',
  classSkills: kit,
});

function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const result = execute(c, command, context);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}
function reject(c: Campaign, command: Command): string {
  const result = execute(c, command, ctx);
  expect(result.ok, JSON.stringify(command)).toBe(false);
  return result.ok ? '' : result.error;
}
const char = (c: Campaign, id = 'jake'): Character => {
  const found = c.state?.characters[id];
  if (!found) throw new Error(`no ${id}`);
  return found;
};
const skillOf = (c: Campaign, name: string) => char(c).skills.find((s) => s.name === name);
const rarities = (c: Campaign) => char(c).skills.map((s) => [s.name, s.rarity]);
let tag = 0;
const mark = (c: Campaign, name: string, n: number): Campaign => {
  for (let i = 0; i < n; i++) {
    c = ok(c, {
      type: 'skill.awardMark',
      characterId: 'jake',
      skill: name,
      session: `s${tag++}`,
    });
  }
  return c;
};
/** Jake and Kim; Jake at class level 4, the G-grade top. */
const atGTop = (): Campaign =>
  ok(run([created, make('jake', 'Jake'), make('kim', 'Kim')], ctx), {
    type: 'xp.award',
    track: 'class',
    amount: 400,
    participants: [{ characterId: 'jake' }],
  });
const release = (rerate?: Record<string, string>): Command => ({
  type: 'evolution.release',
  rerateApproved: true,
  characterId: 'jake',
  options: [{ className: 'Hunter' }],
  ...(rerate ? { rerate } : {}),
});
/**
 * The log as MR.1 stored it: releases carry no approval mark, and `list` (if
 * given) replaces the last release's re-rating.
 */
const asStoredMR1 = (
  c: Campaign,
  list?: readonly { skill: string; rarity: string }[],
): Campaign => {
  const last = c.events.map((e) => e.type).lastIndexOf('evolution.released');
  return replay(
    JSON.parse(
      JSON.stringify(
        c.events.map((e, i) => {
          if (e.type !== 'evolution.released') return e;
          const { rerateApproved: _gone, ...payload } = e.payload;
          void _gone;
          return { ...e, payload: i === last && list ? { ...payload, rerate: list } : payload };
        }),
      ),
    ) as unknown[],
  );
};
/** A release as MR.1 stored it: every skill's default drop plus the GM's overrides. */
const released = (c: Campaign, rerate: Record<string, string> = {}): Campaign =>
  asStoredMR1(ok(c, release(rerate)), defaultRerate(c.state!.rules, char(c), rerate));
const choose: Command = { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' };
const evolve = (c: Campaign, rerate?: Record<string, string>): Campaign =>
  ok(released(c, rerate), choose, player('jake'));

describe('evolutions re-rate skills (MR.1)', () => {
  it('drops every kept skill one rarity by default, never below Inferior', () => {
    const c = evolve(atGTop());
    expect(char(c).grade).toBe('F');
    expect(rarities(c)).toEqual([
      [archery, 'inferior'],
      ['Basic Stealth', 'inferior'],
      [eye, 'inferior'],
      ['Identify', 'inferior'],
    ]);
  });

  it('the release carries every skill’s new rarity', () => {
    const c = released(atGTop(), { [eye]: 'common' });
    expect(char(c).evolution?.rerate).toEqual([
      { skill: archery, rarity: 'inferior' },
      { skill: 'Basic Stealth', rarity: 'inferior' },
      { skill: eye, rarity: 'common' },
      { skill: 'Identify', rarity: 'inferior' },
    ]);
  });

  it('the GM raises within the new ceiling, keeps, or lowers', () => {
    let c = atGTop();
    c = mark(c, eye, 4);
    c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: eye });
    expect(skillOf(c, eye)?.rarity).toBe('uncommon');
    // Raise: Basic Archery Inferior → Rare (the F ceiling); keep Identify;
    // lower Archer's Eye two steps.
    c = evolve(c, { [archery]: 'rare', Identify: 'common', [eye]: 'inferior' });
    expect(rarities(c)).toEqual([
      [archery, 'rare'],
      ['Basic Stealth', 'inferior'],
      [eye, 'inferior'],
      ['Identify', 'common'],
    ]);
  });

  it('refuses a raise above the new grade’s ceiling, unknown skills and rarities', () => {
    const c = atGTop();
    expect(reject(c, release({ [archery]: 'epic' }))).toMatch(
      /cannot be raised above the F-grade ceiling \(rare\)/,
    );
    expect(reject(c, release({ Nope: 'common' }))).toMatch(/has no skill "Nope"/);
    expect(reject(c, release({ [archery]: 'bogus' }))).toMatch(/Unknown rarity/);
    expect(reject(c, release({ [archery]: 'divine' }))).toMatch(/reserved/);
    // A refused release leaves nothing pending.
    expect(char(c).evolution).toBeNull();
  });

  it('keeps every mark, so the next upgrade costs the lower rarity’s marks', () => {
    let c = mark(atGTop(), eye, 2);
    c = evolve(c);
    expect(skillOf(c, eye)).toMatchObject({ rarity: 'inferior', marks: 2 });
    // Inferior → Common costs 3: one more mark upgrades it, and it starts at 0.
    expect(reject(c, { type: 'skill.upgrade', characterId: 'jake', skill: eye })).toMatch(
      /needs 3 marks \(has 2\)/,
    );
    c = mark(c, eye, 1);
    c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: eye });
    expect(skillOf(c, eye)).toMatchObject({ rarity: 'common', marks: 0 });
  });

  it('a library-linked copy keeps its text and effects; an upgrade takes the new rarity’s', () => {
    let c = atGTop();
    const define = (rarity: string, word: string): Command => ({
      type: 'skillDef.define',
      id: `eye-${rarity}`,
      name: eye,
      rarity,
      description: `${word} sight.`,
      flavor: `${word} flavour.`,
      effects: `${word} effects.`,
    });
    c = ok(c, define('common', 'Common'));
    c = ok(c, define('inferior', 'Inferior'));
    expect(skillOf(c, eye)).toMatchObject({ description: 'Common sight.' });
    c = evolve(c);
    expect(skillOf(c, eye)).toMatchObject({
      rarity: 'inferior',
      description: 'Common sight.',
      flavor: 'Common flavour.',
    });
    expect(projectForPlayer(c.state!, 'jake').me?.skills.find((s) => s.name === eye)).toMatchObject(
      { rarity: 'inferior', effects: 'Common effects.' },
    );
    // Edits to the lower rarity's entry do not reach it; its own entry's do.
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'eye-inferior', description: 'Changed.' });
    expect(skillOf(c, eye)?.description).toBe('Common sight.');
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'eye-common', description: 'Sharper sight.' });
    expect(skillOf(c, eye)?.description).toBe('Sharper sight.');
    // Climbing back to Common follows the Common entry with no re-rating left.
    c = mark(c, eye, 3);
    c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: eye });
    expect(skillOf(c, eye)).toMatchObject({ rarity: 'common', description: 'Sharper sight.' });
    expect(skillOf(c, eye)?.textRarity).toBeUndefined();
  });

  it('a hand-written copy keeps its text and its hand-written mark', () => {
    let c = atGTop();
    c = ok(c, {
      type: 'skillDef.define',
      id: 'eye-inferior',
      name: eye,
      rarity: 'inferior',
      description: 'Library text.',
    });
    c = ok(c, {
      type: 'skill.describe',
      characterId: 'jake',
      skill: eye,
      description: 'Hand text.',
      flavor: '',
    });
    c = evolve(c);
    expect(skillOf(c, eye)).toMatchObject({
      rarity: 'inferior',
      description: 'Hand text.',
      textEdited: true,
    });
  });

  it('a transformed skill follows its transform, not the re-rating', () => {
    let c = atGTop();
    c = ok(c, {
      type: 'evolution.release',
      rerateApproved: true,
      characterId: 'jake',
      options: [
        { className: 'Hunter', transforms: [{ skill: eye, name: 'Hawk Eye', rarity: 'rare' }] },
      ],
    });
    c = ok(c, choose, player('jake'));
    expect(skillOf(c, 'Hawk Eye')?.rarity).toBe('rare');
    expect(skillOf(c, archery)?.rarity).toBe('inferior');
  });

  it('a skill gained after the release (a merge) takes the default drop', () => {
    let c = atGTop();
    for (const name of [archery, 'Basic Stealth']) {
      c = mark(c, name, 3);
      c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: name });
      c = mark(c, name, 4);
      c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: name });
    }
    for (let i = 0; i < 3; i++) {
      c = ok(
        c,
        {
          type: 'practice.log',
          characterId: 'jake',
          action: `Shot ${i}`,
          skills: [archery, 'Basic Stealth'],
        },
        { ...ctx, sessionId: `p${i}` },
      );
    }
    c = released(c, { [eye]: 'common' });
    c = ok(c, {
      type: 'skill.merge',
      characterId: 'jake',
      skills: [archery, 'Basic Stealth'],
      name: 'Shadow Shot',
    });
    expect(skillOf(c, 'Shadow Shot')?.rarity).toBe('rare');
    c = ok(c, choose, player('jake'));
    expect(skillOf(c, 'Shadow Shot')?.rarity).toBe('uncommon');
    expect(skillOf(c, eye)?.rarity).toBe('common');
  });

  it('a skill whose rarity changes after the release takes the default drop from its new rarity (MR.A)', () => {
    let c = mark(atGTop(), eye, 4);
    // The release lists Archer's Eye Common → Inferior (default) and keeps Identify.
    c = released(c, { Identify: 'common' });
    // The GM upgrades it while the evolution is pending: Common → Uncommon.
    c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: eye });
    expect(char(c).evolution?.rerate?.map((r) => r.skill)).not.toContain(eye);
    c = ok(c, choose, player('jake'));
    // One step down from Uncommon, not the stale Inferior; its text still
    // follows the Uncommon entry it was upgraded to (same power, lower label).
    expect(skillOf(c, eye)).toMatchObject({ rarity: 'common', marks: 0, textRarity: 'uncommon' });
    // The untouched override still applies.
    expect(skillOf(c, 'Identify')?.rarity).toBe('common');
    // And the log replays to the same state.
    expect(replay(c.events).state).toEqual(c.state);
  });

  it('the owner sees the re-rating; another player does not', () => {
    const c = released(atGTop());
    const own = projectForPlayer(c.state!, 'jake');
    expect(own.me?.evolution?.rerate).toContainEqual({ skill: eye, rarity: 'inferior' });
    const other = JSON.stringify(projectForPlayer(c.state!, 'kim'));
    expect(other).not.toContain('rerate');
  });

  it('a release stored before MR.1 (no re-rating) replays unchanged', () => {
    const c = evolve(atGTop());
    const stripped = c.events.map((e) => {
      if (e.type !== 'evolution.released') return e;
      const { rerate: _gone, ...payload } = e.payload;
      void _gone;
      return { ...e, payload };
    });
    const old = replay(JSON.parse(JSON.stringify(stripped)) as unknown[]);
    expect(rarities(old)).toEqual([
      [archery, 'inferior'],
      ['Basic Stealth', 'inferior'],
      [eye, 'common'],
      ['Identify', 'common'],
    ]);
  });
});
