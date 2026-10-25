import { describe, expect, it } from 'vitest';
import {
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
 * MT.1 (DESIGN §6, L19): the evolution builder lists each kept skill at the
 * rarity it has going in; the GM sets each one and approves the list, and the
 * release is refused without that approval. Identify (a race skill) never
 * drops. Nothing drops on its own; a lowered skill keeps its marks.
 */
const ctx = testContext('a');
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
    c = ok(c, { type: 'skill.awardMark', characterId: 'jake', skill: name, session: `s${tag++}` });
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
const release = (rerate?: Record<string, string>, approved: boolean | null = true): Command => ({
  type: 'evolution.release',
  characterId: 'jake',
  options: [{ className: 'Hunter' }],
  ...(rerate ? { rerate } : {}),
  ...(approved === null ? {} : { rerateApproved: approved }),
});
const choose: Command = { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' };

describe('evolution re-rating is approved, not automatic (MT.1)', () => {
  it('refuses a release without the GM’s approval of the re-rating', () => {
    const c = atGTop();
    expect(reject(c, release({}, null))).toMatch(/Approve the skill re-rating first/);
    expect(reject(c, release({ [eye]: 'rare' }, false))).toMatch(/Approve the skill re-rating/);
    expect(char(c).evolution).toBeNull();
  });

  it('lists every skill at the rarity it has going in, and keeps them by default', () => {
    let c = ok(atGTop(), release());
    expect(char(c).evolution?.rerate).toEqual([
      { skill: archery, rarity: 'inferior' },
      { skill: 'Basic Stealth', rarity: 'inferior' },
      { skill: eye, rarity: 'common' },
      { skill: 'Identify', rarity: 'common' },
    ]);
    expect(char(c).evolution?.rerateApproved).toBe(true);
    c = ok(c, choose, player('jake'));
    expect(char(c).grade).toBe('F');
    expect(rarities(c)).toEqual([
      [archery, 'inferior'],
      ['Basic Stealth', 'inferior'],
      [eye, 'common'],
      ['Identify', 'common'],
    ]);
  });

  it('never lowers Identify (a race skill); raising it is fine', () => {
    const c = atGTop();
    expect(reject(c, release({ Identify: 'inferior' }))).toMatch(
      /\[Identify\] is a race skill and never drops a rarity/,
    );
    const raised = ok(ok(c, release({ Identify: 'uncommon' })), choose, player('jake'));
    expect(skillOf(raised, 'Identify')?.rarity).toBe('uncommon');
  });

  it('raises within the new ceiling, keeps, or lowers with every mark kept', () => {
    let c = mark(atGTop(), eye, 2);
    expect(reject(c, release({ [archery]: 'epic' }))).toMatch(/F-grade ceiling \(rare\)/);
    c = ok(c, release({ [archery]: 'rare', [eye]: 'inferior' }));
    c = ok(c, choose, player('jake'));
    expect(skillOf(c, archery)?.rarity).toBe('rare');
    expect(skillOf(c, 'Basic Stealth')?.rarity).toBe('inferior');
    // Lowered: same text, all marks kept; Inferior → Common costs 3, so one more upgrades it.
    expect(skillOf(c, eye)).toMatchObject({ rarity: 'inferior', marks: 2 });
    c = mark(c, eye, 1);
    c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: eye });
    expect(skillOf(c, eye)).toMatchObject({ rarity: 'common', marks: 0 });
  });

  it('a skill whose rarity changes after the release keeps its new rarity', () => {
    let c = mark(atGTop(), eye, 4);
    c = ok(c, release({ [eye]: 'inferior' }));
    c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: eye });
    // The stale entry leaves the list; nothing drops on its own.
    expect(char(c).evolution?.rerate?.map((r) => r.skill)).not.toContain(eye);
    c = ok(c, choose, player('jake'));
    expect(skillOf(c, eye)?.rarity).toBe('uncommon');
    expect(replay(JSON.parse(JSON.stringify(c.events)) as unknown[]).state).toEqual(c.state);
  });

  it('the owner sees the approved list (unnamed skills stay); another player does not', () => {
    const c = ok(atGTop(), release({ [eye]: 'inferior' }));
    const own = projectForPlayer(c.state!, 'jake').me?.evolution;
    expect(own?.rerateApproved).toBe(true);
    expect(own?.rerate).toContainEqual({ skill: eye, rarity: 'inferior' });
    expect(JSON.stringify(projectForPlayer(c.state!, 'kim'))).not.toContain('rerate');
  });

  it('a release stored before MT.1 still takes the default drop on replay', () => {
    const c = ok(ok(atGTop(), release()), choose, player('jake'));
    const stored = c.events.map((e) => {
      if (e.type !== 'evolution.released') return e;
      const { rerateApproved: _gone, ...payload } = e.payload;
      void _gone;
      // MR.1 stored only what its default made of each skill; drop the list
      // here so every skill takes the default.
      return { ...e, payload: { ...payload, rerate: [] } };
    });
    const old = replay(JSON.parse(JSON.stringify(stored)) as unknown[]);
    expect(rarities(old)).toEqual([
      [archery, 'inferior'],
      ['Basic Stealth', 'inferior'],
      [eye, 'inferior'],
      ['Identify', 'inferior'],
    ]);
  });

  it('no option may merge Identify away or transform it lower (review M1)', () => {
    const c = atGTop();
    const withTransform = (transforms: unknown[]): Command =>
      ({
        type: 'evolution.release',
        characterId: 'jake',
        rerateApproved: true,
        options: [{ className: 'Hunter', transforms }],
      }) as Command;
    expect(
      reject(c, withTransform([{ skill: 'Identify', name: 'Dim Sight', rarity: 'inferior' }])),
    ).toMatch(/\[Identify\] cannot drop to a lower rarity/);
    expect(
      reject(
        c,
        withTransform([{ skill: eye, merge: 'Identify', name: 'Seeing Eye', rarity: 'rare' }]),
      ),
    ).toMatch(/race skill and cannot be merged away/);
    expect(
      reject(c, withTransform([{ skill: 'Identify', name: 'Dim Sight', rarity: 'common' }])),
    ).toMatch(/\[Identify\] is a race skill and keeps its name/);
    const kept = ok(
      c,
      withTransform([{ skill: 'Identify', name: 'Identify', rarity: 'uncommon' }]),
    );
    expect(kept.state?.characters.jake?.evolution).not.toBeNull();
  });

  it('a full MR.1-style stored list (Identify lowered, no approval) replays unchanged (review M2)', () => {
    const c = ok(ok(atGTop(), release()), choose, player('jake'));
    const stored = c.events.map((e) => {
      if (e.type !== 'evolution.released') return e;
      const { rerateApproved: _gone, ...payload } = e.payload;
      void _gone;
      return {
        ...e,
        payload: {
          ...payload,
          rerate: [
            { skill: archery, rarity: 'inferior' },
            { skill: 'Basic Stealth', rarity: 'inferior' },
            { skill: eye, rarity: 'common' },
            { skill: 'Identify', rarity: 'inferior' },
          ],
        },
      };
    });
    const json = JSON.parse(JSON.stringify(stored)) as unknown[];
    const old = replay(json);
    expect(rarities(old)).toEqual([
      [archery, 'inferior'],
      ['Basic Stealth', 'inferior'],
      [eye, 'common'],
      ['Identify', 'inferior'],
    ]);
    expect(replay(json).state).toEqual(old.state);
  });
});
