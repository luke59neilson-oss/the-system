import { describe, expect, it } from 'vitest';
import {
  awardMark,
  canUpgrade,
  defaultRules,
  markRules,
  marksAfterRarityChange,
  mergeSkills,
  upgradeSkill,
  execute,
  marksToUpgrade,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

const created: Command = { type: 'campaign.create', name: 'Whale', rules: rawRules() };
const make = (id: string, name: string): Command => ({
  type: 'character.create',
  id,
  name,
  className: 'Archer',
  classSkills: kit,
});
const ctx = testContext('k');
const base = (): Campaign => run([created, make('jake', 'Jake'), make('kim', 'Kim')], ctx);
const player = (characterId: string): CommandContext => ({
  ...ctx,
  actor: { role: 'player', characterId },
});
const [archery, stealth, eye] = kit.map((k) => k.name) as [string, string, string];

function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const result = execute(c, command, context);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}
function reject(c: Campaign, command: Command, context: CommandContext = ctx): string {
  const result = execute(c, command, context);
  expect(result.ok, JSON.stringify(command)).toBe(false);
  return result.ok ? '' : result.error;
}
const skill = (c: Campaign, name: string, id = 'jake') =>
  c.state?.characters[id]?.skills.find((s) => s.name === name);
const mark = (name: string, session: string, characterId = 'jake'): Command => ({
  type: 'skill.awardMark',
  characterId,
  skill: name,
  session,
});
let sessionNo = 0;
/** Awards marks in fresh sessions, then upgrades, until the skill reaches `times` upgrades. */
function upgrade(c: Campaign, name: string, times: number, characterId = 'jake'): Campaign {
  let next = c;
  for (let t = 0; t < times; t++) {
    const s = skill(next, name, characterId);
    const needed = next.state && s ? (marksToUpgrade(next.state.rules, s) ?? 0) : 0;
    for (let m = s?.marks ?? 0; m < needed; m++)
      next = ok(next, mark(name, `s${++sessionNo}`, characterId));
    next = ok(next, { type: 'skill.upgrade', characterId, skill: name });
  }
  return next;
}

describe('rarity ladder and new skills', () => {
  it('starting skills carry no nickname, no Unique tag and no marks', () => {
    expect(skill(base(), archery)).toEqual({
      name: archery,
      rarity: 'inferior',
      kind: 'class',
      nickname: null,
      unique: false,
      marks: 0,
      markSessions: [],
      description: null,
      flavor: null,
    });
  });
});

describe('skill text (M3.5)', () => {
  const describe_ = (
    skillName: string,
    description: string | null,
    flavor: string | null = null,
  ): Command => ({
    type: 'skill.describe',
    characterId: 'jake',
    skill: skillName,
    description,
    flavor,
  });

  it('creation carries optional System text, trimmed; blank means none', () => {
    const c = run(
      [
        created,
        {
          type: 'character.create',
          id: 'jake',
          name: 'Jake',
          className: 'Archer',
          classSkills: [
            {
              name: archery,
              rarity: 'inferior',
              description: '  Shoots true. ',
              flavor: 'Old hands.',
            },
            { name: stealth, rarity: 'inferior', description: '   ' },
            { name: eye, rarity: 'common' },
          ],
        },
      ],
      ctx,
    );
    expect(skill(c, archery)).toMatchObject({ description: 'Shoots true.', flavor: 'Old hands.' });
    expect(skill(c, stealth)).toMatchObject({ description: null, flavor: null });
    expect(skill(c, eye)).toMatchObject({ description: null, flavor: null });
  });

  it('the GM writes and clears a description and flavour', () => {
    let c = ok(base(), describe_(eye, ' Spots what moves. ', 'Nothing hides.'));
    expect(skill(c, eye)).toMatchObject({
      description: 'Spots what moves.',
      flavor: 'Nothing hides.',
    });
    expect(skill(c, eye, 'kim')).toMatchObject({ description: null, flavor: null });
    c = ok(c, describe_(eye, '', 'Nothing hides.'));
    expect(skill(c, eye)).toMatchObject({ description: null, flavor: 'Nothing hides.' });
  });

  it('refuses unchanged text, unknown skills, over-long text and players', () => {
    const c = ok(base(), describe_(eye, 'Spots.'));
    expect(reject(c, describe_(eye, ' Spots. '))).toMatch('already has that text');
    expect(reject(c, describe_('Fireball', 'Boom'))).toMatch('no skill "Fireball"');
    expect(reject(c, describe_(eye, 'x'.repeat(2001)))).toBeTruthy();
    expect(reject(c, describe_(eye, 'ok', 'y'.repeat(1001)))).toBeTruthy();
    expect(reject(c, describe_(eye, 'Mine now'), player('jake'))).toMatch('only the GM');
  });
});

describe('nicknames', () => {
  it('a player nicknames their own skill; the official name stays', () => {
    let c = ok(
      base(),
      { type: 'skill.nickname', characterId: 'jake', skill: eye, nickname: ' Jake Juice ' },
      player('jake'),
    );
    expect(skill(c, eye)).toMatchObject({ name: eye, nickname: 'Jake Juice' });
    c = ok(c, { type: 'skill.nickname', characterId: 'jake', skill: eye, nickname: '' });
    expect(skill(c, eye)?.nickname).toBeNull();
  });

  it.each([
    [{ skill: 'Fireball', nickname: 'x' }, 'no skill "Fireball"'],
    [{ skill: archery, nickname: 'x'.repeat(61) }, 'at most 60'],
    [{ skill: archery, nickname: null }, 'unchanged'],
  ])('rejects %j', (change, reason) => {
    expect(
      reject(base(), { type: 'skill.nickname', characterId: 'jake', ...change } as Command),
    ).toContain(reason);
  });

  it("a player cannot nickname another character's skill", () => {
    expect(
      reject(
        base(),
        { type: 'skill.nickname', characterId: 'kim', skill: eye, nickname: 'x' },
        player('jake'),
      ),
    ).toContain('own character');
  });
});

describe('Unique tag', () => {
  it('the GM tags and untags; players cannot', () => {
    let c = ok(base(), { type: 'skill.setUnique', characterId: 'jake', skill: eye, unique: true });
    expect(skill(c, eye)?.unique).toBe(true);
    expect(
      reject(c, { type: 'skill.setUnique', characterId: 'jake', skill: eye, unique: true }),
    ).toContain('already Unique');
    c = ok(c, { type: 'skill.setUnique', characterId: 'jake', skill: eye, unique: false });
    expect(
      reject(c, { type: 'skill.setUnique', characterId: 'jake', skill: eye, unique: false }),
    ).toContain('already not Unique');
    expect(
      reject(
        c,
        { type: 'skill.setUnique', characterId: 'jake', skill: eye, unique: true },
        player('jake'),
      ),
    ).toContain('only the GM');
  });
});

describe('mastery marks', () => {
  it('one mark per skill per session; other skills and sessions are separate', () => {
    let c = ok(base(), mark(archery, 'a'));
    expect(reject(c, mark(archery, 'a'))).toContain('already earned its mark this session');
    c = ok(c, mark(stealth, 'a'));
    c = ok(c, mark(archery, 'b'));
    expect(skill(c, archery)).toMatchObject({ marks: 2, markSessions: ['a', 'b'] });
    expect(skill(c, stealth)?.marks).toBe(1);
  });

  it('needs a session, a known skill, and the GM', () => {
    const noSession = { ...ctx, sessionId: null };
    expect(
      reject(base(), { type: 'skill.awardMark', characterId: 'jake', skill: archery }, noSession),
    ).toContain('needs a play session');
    // The current session is the default.
    const c = ok(base(), { type: 'skill.awardMark', characterId: 'jake', skill: archery });
    expect(skill(c, archery)?.markSessions).toEqual(['s1']);
    expect(reject(base(), mark('Fireball', 'a'))).toContain('no skill');
    expect(reject(base(), mark(archery, 'a'), player('jake'))).toContain('only the GM');
  });

  it('thresholds come from the rules: 3 marks Inferior → Common, then 4 to Uncommon; marks reset', () => {
    let c = base();
    for (const s of ['a', 'b']) c = ok(c, mark(archery, s));
    expect(reject(c, { type: 'skill.upgrade', characterId: 'jake', skill: archery })).toContain(
      'needs 3 marks (has 2)',
    );
    c = ok(c, mark(archery, 'c'));
    expect(
      c.state &&
        canUpgrade(
          c.state.rules,
          c.state.characters['jake'] ?? (null as never),
          skill(c, archery) ?? (null as never),
        ),
    ).toBe(true);
    c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: archery });
    expect(skill(c, archery)).toMatchObject({ rarity: 'common', marks: 0 });
    // The mark history stays: the session rule still holds after an upgrade.
    expect(reject(c, mark(archery, 'c'))).toContain('already earned');
    for (const s of ['d', 'e', 'f']) c = ok(c, mark(archery, s));
    expect(reject(c, { type: 'skill.upgrade', characterId: 'jake', skill: archery })).toContain(
      'needs 4 marks (has 3)',
    );
    c = ok(c, mark(archery, 'g'));
    c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: archery });
    expect(skill(c, archery)?.rarity).toBe('uncommon');
  });

  it('at the grade ceiling marks bank and the upgrade waits for the next evolution', () => {
    // G-grade ceiling is Rare: Inferior → Common → Uncommon → Rare.
    let c = upgrade(base(), archery, 3);
    expect(skill(c, archery)?.rarity).toBe('rare');
    for (let i = 0; i < 10; i++) c = ok(c, mark(archery, `bank${i}`));
    expect(skill(c, archery)?.marks).toBe(10); // banked past the 8 needed for Epic
    expect(reject(c, { type: 'skill.upgrade', characterId: 'jake', skill: archery })).toContain(
      'ceiling; its marks bank until the next evolution',
    );
  });

  it('the top grantable rarity (Mythical; Divine is reserved) can neither earn marks nor upgrade', () => {
    const rules = base().state?.rules ?? (null as never);
    const top = { ...(skill(base(), archery) ?? (null as never)), rarity: 'mythical', marks: 20 };
    expect(marksToUpgrade(rules, top)).toBeNull();
    expect(marksToUpgrade(rules, { ...top, rarity: 'legendary' })).toBe(15);
    // An A-grade character (Mythical ceiling) holding a Mythical skill.
    const jake = base().state?.characters['jake'] ?? (null as never);
    const mythic = { ...jake, grade: 'A', skills: [top] };
    expect(() => awardMark(rules, mythic, archery, 'x')).toThrow('has no mark upgrade');
    expect(() => upgradeSkill(rules, mythic, archery)).toThrow('cannot be upgraded past Mythical');
  });
});

describe('merges', () => {
  const together = (n: number): Command[] =>
    Array.from({ length: n }, (_, i) => ({
      type: 'practice.log',
      characterId: 'jake',
      action: `Ambush ${i}`,
      skills: [archery, stealth],
    }));
  const merge: Command = {
    type: 'skill.merge',
    characterId: 'jake',
    skills: [archery, stealth],
    name: 'Shadow Shot',
  };
  const ready = () => run(together(3), ctx, upgrade(upgrade(base(), archery, 2), stealth, 2));

  it('two Uncommon skills logged together 3 times merge one rarity above the higher', () => {
    const c = ok(ready(), merge);
    const names = c.state?.characters['jake']?.skills.map((s) => s.name);
    expect(names).toEqual(['Shadow Shot', eye, 'Identify']);
    expect(skill(c, 'Shadow Shot')).toEqual({
      name: 'Shadow Shot',
      rarity: 'rare',
      kind: 'class',
      nickname: null,
      unique: false,
      marks: 0,
      markSessions: [],
      description: null,
      flavor: null,
    });
    expect(c.state?.characters['jake']?.merges).toEqual({ G: 1 });
  });

  it('rejects: fewer than 3 joint uses', () => {
    const c = run(together(2), ctx, upgrade(upgrade(base(), archery, 2), stealth, 2));
    expect(reject(c, merge)).toContain('logged together 2 times (need 3)');
  });

  it('rejects: a skill below Uncommon', () => {
    const c = run(together(3), ctx, upgrade(upgrade(base(), archery, 2), stealth, 1));
    expect(reject(c, merge)).toContain(`[${stealth}] must be at least Uncommon`);
  });

  it('rejects: a second merge in the same grade', () => {
    let c = ok(ready(), merge);
    c = upgrade(c, eye, 1); // Common → Uncommon
    c = upgrade(c, 'Identify', 1);
    c = run(
      [1, 2, 3].map((i) => ({
        type: 'practice.log',
        characterId: 'jake',
        action: `Scout ${i}`,
        skills: [eye, 'Identify'],
      })),
      ctx,
      c,
    );
    expect(
      reject(c, { type: 'skill.merge', characterId: 'jake', skills: [eye, 'Identify'], name: 'X' }),
    ).toContain('Already merged at G-grade');
  });

  it('rejects: above the grade ceiling, the same skill twice, unknown skills, a taken or blank name, players', () => {
    const rare = run(together(3), ctx, upgrade(upgrade(base(), archery, 3), stealth, 2));
    expect(reject(rare, merge)).toContain('above the G-grade ceiling');
    const c = ready();
    expect(reject(c, { ...merge, skills: [archery, archery] } as Command)).toContain(
      'two different skills',
    );
    expect(reject(c, { ...merge, skills: [archery, 'Fireball'] } as Command)).toContain(
      'no skill "Fireball"',
    );
    expect(reject(c, { ...merge, name: eye } as Command)).toContain('already has a skill');
    expect(reject(c, { ...merge, name: ' ' } as Command)).toContain('name');
    expect(reject(c, merge, player('jake'))).toContain('only the GM');
  });

  it('originals are consumed: their marks do not carry over and their names cannot be reused', () => {
    const c = ok(ready(), merge);
    expect(reject(c, mark(archery, 'zz'))).toContain('no skill');
    expect(skill(c, 'Shadow Shot')?.marks).toBe(0);
    // Reusing an original's name would inherit its practice-log pair counts.
    expect(reject(ready(), { ...merge, name: archery } as Command)).toContain(
      'already has a skill',
    );
    expect(reject(ready(), { ...merge, name: stealth.toUpperCase() } as Command)).toContain(
      'already has a skill',
    );
  });

  it('the merge limit is per grade: a new grade allows another merge', () => {
    const c = ready();
    const rules = c.state?.rules ?? (null as never);
    const jake = c.state?.characters['jake'] ?? (null as never);
    const once = mergeSkills(rules, jake, archery, stealth, 'Shadow Shot', 3);
    const merged = {
      ...once,
      skills: once.skills.map((s) =>
        s.name === eye || s.name === 'Identify' ? { ...s, rarity: 'uncommon' } : s,
      ),
    };
    expect(() => mergeSkills(rules, merged, eye, 'Identify', 'X', 3)).toThrow('Already merged');
    // At F-grade (as after an evolution, M1.10) the counter for F is fresh.
    const atF = { ...merged, grade: 'F' };
    expect(mergeSkills(rules, atF, eye, 'Identify', 'Far Sight', 3).merges).toEqual({ G: 1, F: 1 });
  });
});

describe('marks carry over (MQ.4, DESIGN §6, D101)', () => {
  const extraMarks = (c0: Campaign) => {
    let c = c0;
    for (const s of ['x1', 'x2', 'x3', 'x4', 'x5']) c = ok(c, mark(archery, s));
    return ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: archery });
  };

  it('marks beyond the cost carry into the next rarity', () => {
    // Inferior → Common costs 3; 5 marks leave 2 toward Uncommon (4).
    const c = extraMarks(base());
    expect(skill(c, archery)).toMatchObject({ rarity: 'common', marks: 2 });
  });

  it('carries twice through two upgrades in a row', () => {
    // 3 + 4 = 7 for two steps; 9 marks leave 2 toward Rare (6).
    let c = base();
    for (let i = 0; i < 9; i++) c = ok(c, mark(archery, `d${i}`));
    c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: archery });
    expect(skill(c, archery)).toMatchObject({ rarity: 'common', marks: 6 });
    c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: archery });
    expect(skill(c, archery)).toMatchObject({ rarity: 'uncommon', marks: 2 });
  });

  it('a rarity change outside an upgrade spends the steps it skips (D114)', () => {
    const m = markRules(defaultRules());
    expect(marksAfterRarityChange(m, 'inferior', 'inferior', 5)).toBe(5);
    expect(marksAfterRarityChange(m, 'inferior', 'uncommon', 10)).toBe(3);
    expect(marksAfterRarityChange(m, 'inferior', 'uncommon', 6)).toBe(0);
    expect(marksAfterRarityChange(m, 'rare', 'common', 5), 'a drop resets').toBe(0);
    expect(marksAfterRarityChange(m, 'rare', 'nope', 5), 'unknown rarity resets').toBe(0);
    expect(marksAfterRarityChange({ ...m, carryOver: false }, 'inferior', 'common', 9)).toBe(0);
    expect(marksAfterRarityChange({ ...m, carryOver: false }, 'rare', 'rare', 9)).toBe(9);
  });

  it('rules stored before MQ.4 (flag absent) still reset marks, so old logs replay unchanged', () => {
    const raw = rawRules() as { skills: Record<string, unknown> };
    const { marksCarryOver: _dropped, ...skills } = raw.skills;
    void _dropped;
    const old = run(
      [{ type: 'campaign.create', name: 'Old', rules: { ...raw, skills } }, make('jake', 'Jake')],
      testContext('old'),
    );
    expect(old.state?.rules.skills.marksCarryOver).toBe(false);
    expect(skill(extraMarks(old), archery)).toMatchObject({ rarity: 'common', marks: 0 });
  });
});
