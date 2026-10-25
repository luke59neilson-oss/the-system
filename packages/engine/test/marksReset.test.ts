import { describe, expect, it } from 'vitest';
import { execute, type Campaign, type Command, type CommandContext } from '../src';
import { defaultRules } from '../src/rules/load';
import { markRules, marksAfterRarityChange } from '../src/skills/model';
import { kit, rawRules, run, testContext } from './helpers/events';

/** MR.2 (DESIGN §6, L15): every upgrade starts at 0 marks; only a re-rating keeps them. */
const ctx = testContext('m');
const player: CommandContext = { ...ctx, actor: { role: 'player', characterId: 'jake' } };
const [archery, , eye] = kit.map((k) => k.name) as [string, string, string];
function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const result = execute(c, command, context);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}
const skill = (c: Campaign, name: string) =>
  c.state?.characters['jake']?.skills.find((s) => s.name === name);
let n = 0;
const mark = (c: Campaign, name: string, count: number) => {
  for (let i = 0; i < count; i++)
    c = ok(c, { type: 'skill.awardMark', characterId: 'jake', skill: name, session: `s${n++}` });
  return c;
};
const base = (): Campaign =>
  ok(
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
      ],
      ctx,
    ),
    { type: 'xp.award', track: 'class', amount: 400, participants: [{ characterId: 'jake' }] },
  );
const evolve = (c: Campaign, transforms: { skill: string; name: string; rarity: string }[]) =>
  ok(
    ok(c, {
      type: 'evolution.release',
      rerateApproved: true,
      characterId: 'jake',
      options: [{ className: 'Hunter', transforms }],
      rerate: { [eye]: 'inferior' },
    }),
    { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' },
    player,
  );

describe('every upgrade starts at 0 marks (MR.2)', () => {
  it('10 marks on an Inferior skill upgrade to a Common skill with 0', () => {
    let c = mark(base(), archery, 10);
    c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: archery });
    expect(skill(c, archery)).toMatchObject({ rarity: 'common', marks: 0 });
  });

  it('a raising transform leaves 0', () => {
    const c = evolve(mark(base(), archery, 2), [
      { skill: archery, name: 'Archery', rarity: 'common' },
    ]);
    expect(skill(c, 'Archery')).toMatchObject({ rarity: 'common', marks: 0 });
  });

  it('a same-rarity transform leaves 0', () => {
    const c = evolve(mark(base(), archery, 2), [
      { skill: archery, name: archery, rarity: 'inferior' },
    ]);
    expect(skill(c, archery)).toMatchObject({ rarity: 'inferior', marks: 0 });
  });

  it('a downgrade at evolution keeps every mark', () => {
    const c = evolve(mark(base(), eye, 3), []);
    expect(skill(c, eye)).toMatchObject({ rarity: 'inferior', marks: 3 });
  });
});

describe('the reset rule wins over carry-over (MR.2)', () => {
  it('turns carry-over off and resets every rarity change', () => {
    const rules = defaultRules();
    const both = {
      ...rules,
      skills: { ...rules.skills, marksCarryOver: true, marksResetOnUpgrade: true },
    };
    const m = markRules(both);
    expect(m.carryOver).toBe(false);
    expect(m.resetOnUpgrade).toBe(true);
    expect(marksAfterRarityChange(m, 'inferior', 'common', 10)).toBe(0);
    expect(marksAfterRarityChange(m, 'common', 'common', 4)).toBe(0);
    // A transform to a lower rarity is still a transform (D152); a re-rating keeps marks instead.
    expect(marksAfterRarityChange(m, 'rare', 'common', 7)).toBe(0);
  });
});
