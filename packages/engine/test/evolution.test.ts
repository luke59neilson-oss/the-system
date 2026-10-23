import { describe, expect, it } from 'vitest';
import {
  createCharacter,
  defaultRules,
  dueSelections,
  passedOverOptions,
  buildSessionLog,
  evolutionTarget,
  execute,
  nextSelectionLevel,
  notificationsBetween,
  projectForPlayer,
  raceLevel,
  replay,
  selectionSlots,
  skillPairCounts,
  type Campaign,
  type Character,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

/**
 * These evolution tests stage levels by banking XP at the cap, so they run on
 * banking rules (`xp.overflow` off: campaigns stored before MQ.11, which keep
 * that behaviour). Overflow has its own tests in progression.test.ts.
 */
const bankingRules = () => {
  const raw = rawRules() as { xp: Record<string, unknown> };
  raw.xp.overflow = false;
  return raw;
};
const rules = defaultRules();
const created: Command = { type: 'campaign.create', name: 'Whale', rules: bankingRules() };
const make = (id: string, name: string): Command => ({
  type: 'character.create',
  id,
  name,
  className: 'Archer',
  classSkills: kit,
});
const ctx = testContext('v');
const player = (characterId: string): CommandContext => ({
  ...ctx,
  actor: { role: 'player', characterId },
});
const [archery, stealth] = kit.map((k) => k.name) as [string, string, string];

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
const char = (c: Campaign, id = 'jake'): Character => {
  const found = c.state?.characters[id];
  if (!found) throw new Error(`no ${id}`);
  return found;
};
/** XP per level at F, E and D (DESIGN §5: ×3 per grade, MQ.10). */
const XP_F = 300;
const XP_E = 900;
const XP_D = 2700;
const award = (amount: number, track: 'class' | 'profession' = 'class', id = 'jake'): Command => ({
  type: 'xp.award',
  track,
  amount,
  participants: [{ characterId: id }],
});
const base = (): Campaign => run([created, make('jake', 'Jake'), make('kim', 'Kim')], ctx);

/** A menu of three options for a level; the first reaches the ceiling of `ceiling`. */
const menu = (level: number, ceiling: string, extra: Partial<Record<string, string>> = {}) => [
  { name: `Skill ${level}a`, rarity: ceiling, description: 'top' },
  { name: `Skill ${level}b`, rarity: 'common' },
  { name: `Skill ${level}c`, rarity: extra['c'] ?? 'inferior' },
];
const release = (skill: string, name: string, rarity: string, extra: object = {}): Command => ({
  type: 'evolution.release',
  characterId: 'jake',
  options: [{ className: 'Hunter', transforms: [{ skill, name, rarity }] }],
  ...extra,
});
/** Offers and chooses every earned selection (an evolution waits for them, D103). */
function pickAll(c: Campaign, id = 'jake'): Campaign {
  for (const slot of dueSelections(rules, char(c, id))) {
    const ceiling = rules.grades.find((g) => g.id === slot.grade)?.rarityCeiling ?? 'common';
    const options = [
      { name: `Pick ${slot.level}a`, rarity: ceiling },
      { name: `Pick ${slot.level}b`, rarity: 'common' },
      { name: `Pick ${slot.level}c`, rarity: 'inferior' },
    ];
    c = ok(c, { type: 'selection.offer', characterId: id, level: slot.level, options });
    c = ok(c, {
      type: 'selection.choose',
      characterId: id,
      level: slot.level,
      skill: `Pick ${slot.level}b`,
    });
  }
  return c;
}
/** Jake at class level 4 (G-grade top), not yet evolved. */
const atGTop = () => ok(base(), award(400));

describe('selection slots (DESIGN §3)', () => {
  it('29 selections from level 0 to 240, capstones at 10/45/90/140/190/240', () => {
    const slots = selectionSlots(rules);
    expect(slots).toHaveLength(29);
    expect(slots.filter((s) => s.capstone).map((s) => s.level)).toEqual([
      10, 45, 90, 140, 190, 240,
    ]);
    expect(slots.filter((s) => s.capstone).map((s) => s.grade)).toEqual([
      'F',
      'E',
      'D',
      'C',
      'B',
      'A',
    ]);
    // Agrees with the practice-log selection alert (M1.8).
    const walked: number[] = [];
    for (let l = nextSelectionLevel(rules, 0); l !== null; l = nextSelectionLevel(rules, l)) {
      walked.push(l);
    }
    expect(walked).toEqual(slots.map((s) => s.level));
  });
});

describe('0→240 campaign (ROADMAP M1.10 acceptance)', () => {
  it('29 selections, capstones at the grade tops, levels freeze at caps, banked XP applies after the GM-released evolution', () => {
    let c = base();
    const chosenLevels: number[] = [];
    const capstoneMenus: number[] = [];
    let evolutions = 0;
    for (let step = 0; step < 2000; step++) {
      // Choose what is due first, so the level-240 selection is never skipped.
      const j = char(c);
      for (const slot of dueSelections(rules, j)) {
        const ceiling = rules.grades.find((g) => g.id === slot.grade)?.rarityCeiling ?? '';
        c = ok(c, {
          type: 'selection.offer',
          characterId: 'jake',
          level: slot.level,
          options: menu(slot.level, ceiling),
        });
        if (slot.capstone) capstoneMenus.push(slot.level);
        c = ok(
          c,
          {
            type: 'selection.choose',
            characterId: 'jake',
            level: slot.level,
            skill: `Skill ${slot.level}b`,
          },
          player('jake'),
        );
        chosenLevels.push(slot.level);
      }
      const now = char(c);
      if (now.classLevel >= 240 && now.professionLevel >= 240) break;
      const target = evolutionTarget(rules, now);
      if (target) {
        // Held: more XP only banks, levels stay at the cap.
        const before = { cl: now.classLevel, pl: now.professionLevel, xp: now.xp.class };
        c = ok(c, award(10_000));
        expect(char(c).classLevel).toBe(before.cl);
        expect(char(c).professionLevel).toBe(before.pl);
        expect(char(c).xp.class).toBe(before.xp + 10_000);
        // Not without the GM's release.
        reject(
          c,
          { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' },
          player('jake'),
        );
        const unlock = target.id === rules.tracks.professionUnlockGrade;
        const skill = char(c).skills[0]?.name ?? '';
        c = ok(
          c,
          release(
            skill,
            `${skill}+`,
            target.rarityCeiling,
            unlock ? { professions: ['Smith', 'Cook'] } : {},
          ),
        );
        c = ok(
          c,
          {
            type: 'evolution.choose',
            characterId: 'jake',
            optionId: 'o1',
            profession: unlock ? 'Cook' : null,
          },
          player('jake'),
        );
        evolutions++;
        const after = char(c);
        expect(after.grade).toBe(target.id);
        expect(after.classLevel, 'banked XP applies at the new grade').toBeGreaterThan(before.cl);
        if (unlock) expect(after.profession).toBe('Cook');
        continue;
      }
      c = ok(c, award(3 * (rules.grades.find((g) => g.id === now.grade)?.xpPerLevel ?? 0)));
      if (now.profession !== null) {
        c = ok(
          c,
          award(3 * (rules.grades.find((g) => g.id === now.grade)?.xpPerLevel ?? 0), 'profession'),
        );
      }
    }
    const j = char(c);
    expect(j.grade).toBe('A');
    expect(j.classLevel).toBe(240);
    expect(raceLevel(rules, j)).toBe(240);
    expect(evolutions).toBe(6);
    expect(chosenLevels).toHaveLength(29);
    expect(j.selections.filter((s) => s.chosen !== null)).toHaveLength(29);
    expect(capstoneMenus).toEqual([10, 45, 90, 140, 190, 240]);
    expect(evolutionTarget(rules, j), 'no grade past the campaign cap').toBeNull();
    // 3 starting class skills + Identify + 29 picks (transforms rename, never add).
    expect(j.skills).toHaveLength(4 + 29);
  });
});

describe('selections', () => {
  const at5 = () =>
    ok(ok(atGTop(), release(archery, 'Hunter’s Archery', 'common')), {
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
    });
  const reached5 = () => ok(at5(), award(XP_F));

  it('offer then choose grants the skill; the player chooses for their own character', () => {
    let c = ok(reached5(), {
      type: 'selection.offer',
      characterId: 'jake',
      level: 5,
      options: [
        ...menu(5, 'rare'),
        { name: 'Skill 5d', rarity: 'uncommon', description: ' Hits twice. ' },
      ],
    });
    expect(char(c).selections).toEqual([expect.objectContaining({ level: 5, chosen: null })]);
    expect(
      reject(
        c,
        { type: 'selection.choose', characterId: 'jake', level: 5, skill: 'Skill 5a' },
        player('kim'),
      ),
    ).toMatch(/own character/);
    c = ok(
      c,
      { type: 'selection.choose', characterId: 'jake', level: 5, skill: 'Skill 5d' },
      player('jake'),
    );
    expect(char(c).skills.at(-1)).toMatchObject({
      name: 'Skill 5d',
      rarity: 'uncommon',
      kind: 'class',
      marks: 0,
      // M3.5: the chosen skill keeps the offered description.
      description: 'Hits twice.',
      flavor: null,
    });
    expect(char(c).selections[0]?.chosen).toBe('Skill 5d');
    expect(dueSelections(rules, char(c))).toEqual([]);
    expect(
      reject(c, { type: 'selection.choose', characterId: 'jake', level: 5, skill: 'Skill 5a' }),
    ).toMatch(/already chosen/);
    expect(
      reject(c, {
        type: 'selection.offer',
        characterId: 'jake',
        level: 5,
        options: menu(5, 'rare'),
      }),
    ).toMatch(/already chosen/);
  });

  it('a re-offer replaces an unchosen menu', () => {
    let c = ok(reached5(), {
      type: 'selection.offer',
      characterId: 'jake',
      level: 5,
      options: menu(5, 'rare'),
    });
    c = ok(c, {
      type: 'selection.offer',
      characterId: 'jake',
      level: 5,
      options: [
        { name: 'New a', rarity: 'rare' },
        { name: 'New b', rarity: 'rare' },
        { name: 'New c', rarity: 'rare' },
      ],
    });
    expect(char(c).selections[0]?.options.map((o) => o.name)).toEqual(['New a', 'New b', 'New c']);
    reject(c, { type: 'selection.choose', characterId: 'jake', level: 5, skill: 'Skill 5a' });
  });

  it('rejects bad menus', () => {
    const c = reached5();
    const offer = (
      level: number,
      options: Extract<Command, { type: 'selection.offer' }>['options'],
    ) => reject(c, { type: 'selection.offer', characterId: 'jake', level, options });
    expect(offer(6, menu(6, 'rare'))).toMatch(/grants no skill selection/);
    expect(offer(10, menu(10, 'rare'))).toMatch(/not reached class level 10/);
    expect(offer(5, menu(5, 'rare').slice(0, 2))).toMatch(/3–4 options/);
    expect(
      offer(5, [
        ...menu(5, 'rare'),
        { name: 'd', rarity: 'common' },
        { name: 'e', rarity: 'common' },
      ]),
    ).toMatch(/3–4 options/);
    expect(offer(5, menu(5, 'epic'))).toMatch(/above the F-grade ceiling/);
    expect(
      offer(5, [...menu(5, 'rare').slice(0, 2), { name: 'Skill 5A', rarity: 'common' }]),
    ).toMatch(/twice/);
    expect(offer(5, [...menu(5, 'rare').slice(0, 2), { name: stealth, rarity: 'common' }])).toMatch(
      /already has a skill/,
    );
    expect(
      offer(5, [...menu(5, 'rare').slice(0, 2), { name: 'Hunter’s Archery', rarity: 'common' }]),
    ).toMatch(/already has a skill/);
    expect(
      offer(5, [
        ...menu(5, 'rare').slice(0, 2),
        { name: 'Forge', rarity: 'common', kind: 'profession' },
      ]),
    ).toMatch(/no profession/);
    expect(offer(5, menu(5, 'nope'))).toMatch(/Unknown rarity/);
    expect(offer(5, menu(5, 'divine'))).toMatch(/reserved/);
    expect(
      reject(
        c,
        { type: 'selection.offer', characterId: 'jake', level: 5, options: menu(5, 'rare') },
        player('jake'),
      ),
    ).toMatch(/only the GM/);
    expect(
      reject(c, { type: 'selection.choose', characterId: 'jake', level: 5, skill: 'x' }),
    ).toMatch(/No selection is offered/);
  });

  it('a capstone menu must offer the grade ceiling', () => {
    const c = ok(reached5(), award(5 * XP_F));
    expect(char(c).classLevel).toBe(10);
    const plain = [
      { name: 'a', rarity: 'uncommon' },
      { name: 'b', rarity: 'common' },
      { name: 'c', rarity: 'common' },
    ];
    expect(
      reject(c, { type: 'selection.offer', characterId: 'jake', level: 10, options: plain }),
    ).toMatch(/capstone: offer at least one rare/);
    ok(c, { type: 'selection.offer', characterId: 'jake', level: 10, options: menu(10, 'rare') });
    // Not a capstone: no ceiling needed.
    ok(c, { type: 'selection.offer', characterId: 'jake', level: 5, options: plain });
  });

  it('refuses a name the practice log still counts for a merged-away skill', () => {
    let c = reached5();
    // Log [Hunter’s Archery] with [Basic Stealth] three times, upgrade both to Uncommon, merge.
    for (let i = 0; i < 3; i++) {
      c = ok(c, {
        type: 'practice.log',
        characterId: 'jake',
        action: `volley ${i}`,
        skills: ['Hunter’s Archery', stealth],
      });
    }
    let session = 0;
    for (const name of [stealth, stealth, 'Hunter’s Archery']) {
      const s = char(c).skills.find((k) => k.name === name);
      const need = s?.rarity === 'inferior' ? 3 : 4;
      for (let m = s?.marks ?? 0; m < need; m++) {
        c = ok(c, {
          type: 'skill.awardMark',
          characterId: 'jake',
          skill: name,
          session: `m${++session}`,
        });
      }
      c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: name });
    }
    c = ok(c, {
      type: 'skill.merge',
      characterId: 'jake',
      skills: ['Hunter’s Archery', stealth],
      name: 'Ghost Shot',
    });
    expect(
      reject(c, {
        type: 'selection.offer',
        characterId: 'jake',
        level: 5,
        options: [...menu(5, 'rare').slice(0, 2), { name: stealth, rarity: 'common' }],
      }),
    ).toMatch(/was a skill/);
  });
});

describe('evolution', () => {
  it('is not available below the grade top and cannot be released early', () => {
    const c = ok(base(), award(300));
    expect(evolutionTarget(rules, char(c))).toBeNull();
    expect(reject(c, release(archery, 'X', 'common'))).toMatch(
      /cannot evolve yet \(race level 3 of 4\)/,
    );
  });

  it('held at the cap until released; the player chooses; banked XP then applies', () => {
    let c = ok(atGTop(), award(3 * XP_F));
    expect(char(c).classLevel).toBe(4);
    expect(char(c).xp.class).toBe(3 * XP_F);
    expect(
      reject(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' }, player('jake')),
    ).toMatch(/No evolution is released/);
    expect(reject(c, release(archery, 'X', 'common'), player('jake'))).toMatch(/only the GM/);
    c = ok(c, {
      type: 'evolution.release',
      characterId: 'jake',
      options: [
        {
          id: 'hunter',
          className: 'Hunter',
          transforms: [{ skill: archery, name: 'Hunter’s Archery', rarity: 'uncommon' }],
        },
        {
          id: 'ranger',
          className: 'Ranger',
          transforms: [
            { skill: archery, name: 'Twin Shot', rarity: 'rare' },
            { skill: stealth, name: stealth, rarity: 'common' },
          ],
          classWeights: { agility: 2, perception: 1 },
        },
      ],
    });
    expect(char(c).evolution?.toGrade).toBe('F');
    expect(char(c).grade).toBe('G');
    expect(
      reject(
        c,
        { type: 'evolution.choose', characterId: 'jake', optionId: 'ranger' },
        player('kim'),
      ),
    ).toMatch(/own character/);
    expect(reject(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'nope' })).toMatch(
      /No evolution option/,
    );
    expect(
      reject(c, {
        type: 'evolution.choose',
        characterId: 'jake',
        optionId: 'ranger',
        profession: 'Smith',
      }),
    ).toMatch(/No profession is offered/);
    c = ok(
      c,
      { type: 'evolution.choose', characterId: 'jake', optionId: 'ranger' },
      player('jake'),
    );
    const j = char(c);
    expect(j.grade).toBe('F');
    expect(j.className).toBe('Ranger');
    expect(j.evolution).toBeNull();
    expect(j.classLevel).toBe(7); // three F levels banked
    expect(j.xp.class).toBe(0);
    expect(j.skills.map((s) => [s.name, s.rarity])).toEqual([
      ['Twin Shot', 'rare'],
      [stealth, 'common'],
      // Kept skills drop one rarity by default (MR.1).
      ['Archer’s Eye', 'inferior'],
      ['Identify', 'inferior'],
    ]);
    // Spread reshaped: new weights govern, totals restart from the evolution.
    expect(j.classWeights).toMatchObject({ agility: 2, perception: 1, strength: 0 });
    expect(Object.values(j.classSpreadTotals).reduce((a, b) => a + b, 0)).toBe(3 * 5);
    expect(j.freePointBatches.map((b) => b.raceLevel)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(j.freePointBatches.at(-1)?.points).toBe(3);
  });

  it('transforms keep the nickname and Unique tag, reset marks, and carry practice-log pairs', () => {
    let c = atGTop();
    c = ok(
      c,
      { type: 'skill.nickname', characterId: 'jake', skill: archery, nickname: 'Pew' },
      player('jake'),
    );
    c = ok(c, { type: 'skill.awardMark', characterId: 'jake', skill: archery, session: 'a' });
    for (let i = 0; i < 2; i++) {
      c = ok(c, {
        type: 'practice.log',
        characterId: 'jake',
        action: `shot ${i}`,
        skills: [archery, stealth],
      });
    }
    c = ok(c, release(archery, 'Hunter’s Archery', 'uncommon'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(char(c).skills[0]).toMatchObject({
      name: 'Hunter’s Archery',
      nickname: 'Pew',
      marks: 0,
      markSessions: ['a'],
    });
    expect(skillPairCounts(c.state?.practice ?? [], 'jake')).toEqual([
      { skills: [stealth, 'Hunter’s Archery'], count: 2 },
    ]);
    // A third joint use under the new name completes the pair.
    c = ok(c, {
      type: 'practice.log',
      characterId: 'jake',
      action: 'shot 3',
      skills: ['Hunter’s Archery', stealth],
    });
    expect(skillPairCounts(c.state?.practice ?? [], 'jake')[0]?.count).toBe(3);
  });

  it('a renaming transform clears the System text; a same-name one keeps it (M3.5)', () => {
    let c = atGTop();
    for (const skill of [archery, stealth]) {
      c = ok(c, {
        type: 'skill.describe',
        characterId: 'jake',
        skill,
        description: 'Old text.',
        flavor: 'Old flavour.',
      });
    }
    c = ok(c, {
      type: 'evolution.release',
      characterId: 'jake',
      options: [
        {
          className: 'Hunter',
          transforms: [
            { skill: archery, name: 'Hunter’s Archery', rarity: 'uncommon' },
            { skill: stealth, name: stealth, rarity: 'uncommon' },
          ],
        },
      ],
    });
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    const byName = (n: string) => char(c).skills.find((s) => s.name === n);
    expect(byName('Hunter’s Archery')).toMatchObject({ description: null, flavor: null });
    expect(byName(stealth)).toMatchObject({ description: 'Old text.', flavor: 'Old flavour.' });
  });

  it('rejects bad releases', () => {
    const c = atGTop();
    const bad = (
      options: Extract<Command, { type: 'evolution.release' }>['options'],
      professions?: string[],
    ) =>
      reject(c, {
        type: 'evolution.release',
        characterId: 'jake',
        options,
        ...(professions ? { professions } : {}),
      });
    const t = (skill: string, name: string, rarity: string) => ({ skill, name, rarity });
    expect(bad([])).toMatch(/1–4 options|too small|>=1/i);
    // Transforms are optional by default (D102); three are still too many.
    expect(
      bad([
        {
          className: 'H',
          transforms: [
            t(archery, 'A2', 'common'),
            t(stealth, 'S2', 'common'),
            t(kit[2]?.name ?? '', 'E2', 'common'),
          ],
        },
      ]),
    ).toMatch(/transforms 3 skills/);
    expect(
      bad([
        {
          className: 'H',
          transforms: [
            t(archery, 'A', 'common'),
            t(stealth, 'B', 'common'),
            t('Identify', 'C', 'common'),
          ],
        },
      ]),
    ).toMatch(/transforms 3 skills/);
    expect(bad([{ className: 'H', transforms: [t('Nope', 'A', 'common')] }])).toMatch(
      /no skill "Nope"/,
    );
    expect(bad([{ className: 'H', transforms: [t('Archer’s Eye', 'A', 'inferior')] }])).toMatch(
      /lower rarity/,
    );
    expect(bad([{ className: 'H', transforms: [t(archery, 'A', 'epic')] }])).toMatch(
      /above the F-grade ceiling/,
    );
    expect(bad([{ className: 'H', transforms: [t(archery, stealth, 'common')] }])).toMatch(
      /already has a skill/,
    );
    expect(
      bad([
        {
          className: 'H',
          transforms: [t(archery, 'Same', 'common'), t(stealth, 'same', 'common')],
        },
      ]),
    ).toMatch(/Two transforms/);
    expect(
      bad([{ className: 'H', transforms: [t(archery, 'A', 'common'), t(archery, 'B', 'common')] }]),
    ).toMatch(/transformed twice/);
    expect(
      bad([
        { id: 'x', className: 'H', transforms: [t(archery, 'A', 'common')] },
        { id: 'x', className: 'I', transforms: [t(archery, 'A', 'common')] },
      ]),
    ).toMatch(/share an id/);
    expect(
      bad([
        { className: 'H', transforms: [t(archery, 'A', 'common')], classWeights: { strength: 0 } },
      ]),
    ).toMatch(/at least one stat/);
    expect(bad([{ className: 'H', transforms: [t(archery, 'A', 'common')] }], ['Smith'])).toMatch(
      /Professions are offered from the E-grade evolution on/,
    );
  });

  it('a re-release replaces the pending options', () => {
    let c = ok(atGTop(), release(archery, 'First', 'common'));
    c = ok(c, release(archery, 'Second', 'common'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(char(c).skills[0]?.name).toBe('Second');
  });

  it('an open release holds the XP that opened it; undoing the release closes it', () => {
    let c = ok(atGTop(), release(archery, 'Volley', 'common'));
    // The skill name became taken after the release? Not possible at G (no selections), so
    // undo the XP instead: the release no longer holds and the undo is refused.
    const xp = c.events.find((e) => e.type === 'xp.awarded');
    expect(reject(c, { type: 'event.undo', eventId: xp?.id ?? '' })).toMatch(/cannot evolve yet/);
    // Undo the release itself: evolution must be released again.
    const rel = c.events.at(-1);
    c = ok(c, { type: 'event.undo', eventId: rel?.id ?? '' });
    expect(char(c).evolution).toBeNull();
    reject(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
  });

  it('undoing the choice restores the pre-evolution character and practice names', () => {
    let c = atGTop();
    c = ok(c, {
      type: 'practice.log',
      characterId: 'jake',
      action: 'shot',
      skills: [archery, stealth],
    });
    c = ok(c, release(archery, 'Volley', 'common'));
    const before = c.state;
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    c = ok(c, { type: 'event.undo', eventId: c.events.at(-1)?.id ?? '' });
    expect(c.state).toEqual(before);
  });

  it('profession unlock at E: offered professions, chosen with the evolution, starting at class level', () => {
    let c = ok(atGTop(), release(archery, 'Volley', 'common'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    c = ok(c, award(10 * XP_F + 2 * XP_E)); // class 14 (F top) + two E levels banked
    expect(char(c).classLevel).toBe(14);
    c = pickAll(c);
    expect(evolutionTarget(rules, char(c))?.id).toBe('E');
    c = ok(c, release('Volley', 'Volley II', 'epic', { professions: ['Smith', 'Cook'] }));
    expect(
      reject(c, {
        type: 'evolution.choose',
        characterId: 'jake',
        optionId: 'o1',
        profession: 'Baker',
      }),
    ).toMatch(/not an offered profession/);
    c = ok(
      c,
      { type: 'evolution.choose', characterId: 'jake', optionId: 'o1', profession: 'Smith' },
      player('jake'),
    );
    const j = char(c);
    expect(j.grade).toBe('E');
    expect(j.profession).toBe('Smith');
    expect(j.professionOffers).toEqual(['Smith', 'Cook']); // kept, locked (MQ.6)
    expect(j.professionLevel).toBe(14); // the System credits what it already saw
    expect(j.classLevel).toBe(16); // two E levels banked
    expect(raceLevel(rules, j)).toBe(15);
    // Profession options are now allowed in menus (level 15 is reached).
    c = ok(c, {
      type: 'selection.offer',
      characterId: 'jake',
      level: 15,
      options: [
        ...menu(15, 'epic').slice(0, 2),
        { name: 'Forge Sense', rarity: 'common', kind: 'profession' },
      ],
    });
    c = ok(c, { type: 'selection.choose', characterId: 'jake', level: 15, skill: 'Forge Sense' });
    expect(char(c).skills.at(-1)).toMatchObject({ name: 'Forge Sense', kind: 'profession' });
  });

  it('an E-grade release may offer no profession; the GM can grant one later', () => {
    let c = ok(atGTop(), release(archery, 'Volley', 'common'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    c = pickAll(ok(c, award(10 * XP_F)));
    c = ok(c, release('Volley', 'Volley II', 'uncommon'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(char(c).profession).toBeNull();
    c = ok(c, { type: 'character.grantProfession', characterId: 'jake', profession: 'Cook' });
    expect(char(c)).toMatchObject({ profession: 'Cook', professionLevel: 14 });
    // A character with a profession is never offered more.
    expect(
      reject(c, {
        type: 'evolution.release',
        characterId: 'jake',
        options: [{ className: 'X', transforms: [] }],
        professions: ['Smith'],
      }),
    ).toMatch(/cannot evolve yet/);
  });
});

describe('evolution gate (config tracks.evolutionGate)', () => {
  const smith = (classLevel: number, professionLevel: number): Character => ({
    ...createCharacter(rules, { id: 'c', name: 'C', className: 'Archer', classSkills: kit }),
    grade: 'E',
    profession: 'Smith',
    classLevel,
    professionLevel,
  });
  const classGate = { ...rules, tracks: { ...rules.tracks, evolutionGate: 'class' as const } };

  it('race gate: a lagging profession holds the evolution back', () => {
    expect(evolutionTarget(rules, smith(49, 30))).toBeNull();
    expect(evolutionTarget(rules, smith(49, 48))).toBeNull(); // race 48
    expect(evolutionTarget(rules, smith(49, 49))?.id).toBe('D');
  });

  it('class gate: class level alone opens it', () => {
    expect(evolutionTarget(classGate, smith(49, 30))?.id).toBe('D');
    expect(evolutionTarget(classGate, smith(48, 49))).toBeNull();
  });

  it('class gate end to end through commands', () => {
    const raw = bankingRules() as unknown as { tracks: { evolutionGate: string } };
    raw.tracks.evolutionGate = 'class';
    let c = run(
      [{ type: 'campaign.create', name: 'Gate', rules: raw }, make('jake', 'Jake')],
      testContext('g'),
    );
    c = ok(c, award(400));
    c = ok(c, release(archery, 'Volley', 'common'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(char(c).grade).toBe('F');
  });
});

describe('projection', () => {
  it('the owner sees their menus and released options; party members never do', () => {
    let c = ok(atGTop(), award(XP_F));
    c = ok(c, {
      type: 'evolution.release',
      characterId: 'jake',
      options: [
        {
          className: 'Canary Class',
          description: 'canary-desc',
          transforms: [{ skill: archery, name: 'Canary Shot', rarity: 'common' }],
          classWeights: { agility: 7 },
        },
      ],
    });
    const state = c.state;
    if (!state) throw new Error('no state');
    const mine = projectForPlayer(state, 'jake');
    expect(mine.me.evolution).toEqual(char(c).evolution);
    const kimView = projectForPlayer(state, 'kim');
    const theirs = JSON.stringify(kimView);
    for (const canary of ['Canary', 'canary-desc', '"toGrade"']) {
      expect(theirs).not.toContain(canary);
    }
    expect(Object.keys(kimView.party[0] ?? {})).not.toContain('evolution');
    expect(Object.keys(kimView.party[0] ?? {})).not.toContain('selections');
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    c = ok(c, { type: 'selection.offer', characterId: 'jake', level: 5, options: menu(5, 'rare') });
    const after = c.state;
    if (!after) throw new Error('no state');
    expect(projectForPlayer(after, 'jake').me.selections).toEqual(
      char(c).selections.map((r) => ({ ...r, passedOver: [] })),
    );
    expect(JSON.stringify(projectForPlayer(after, 'kim'))).not.toContain('Skill 5');
  });
});

describe('review fixes (M1.10 round 1)', () => {
  const toF = () =>
    ok(ok(atGTop(), release(archery, 'Volley', 'common')), {
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
    });

  it('undoing a re-release the player already answered is refused (the choice names its release)', () => {
    let c = ok(atGTop(), release(archery, 'Volley', 'common'));
    c = ok(c, release(archery, 'Sniper', 'uncommon'));
    const second = c.events.at(-1)?.id ?? '';
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' }, player('jake'));
    expect(c.events.at(-1)?.payload).toMatchObject({ releaseId: second });
    expect(reject(c, { type: 'event.undo', eventId: second })).toMatch(/released again/);
    expect(char(c).skills[0]?.name).toBe('Sniper');
  });

  it('a choice naming a stale release or offer is refused', () => {
    let c = ok(atGTop(), release(archery, 'Volley', 'common'));
    const first = c.events.at(-1)?.id ?? '';
    c = ok(c, release(archery, 'Sniper', 'uncommon'));
    expect(
      reject(c, {
        type: 'evolution.choose',
        characterId: 'jake',
        optionId: 'o1',
        releaseId: first,
      }),
    ).toMatch(/released again/);
    c = ok(ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' }), award(XP_F));
    c = ok(c, { type: 'selection.offer', characterId: 'jake', level: 5, options: menu(5, 'rare') });
    const offer1 = c.events.at(-1)?.id ?? '';
    c = ok(c, { type: 'selection.offer', characterId: 'jake', level: 5, options: menu(5, 'rare') });
    const offer2 = c.events.at(-1)?.id ?? '';
    expect(
      reject(c, {
        type: 'selection.choose',
        characterId: 'jake',
        level: 5,
        skill: 'Skill 5a',
        offerId: offer1,
      }),
    ).toMatch(/offered again/);
    c = ok(c, { type: 'selection.choose', characterId: 'jake', level: 5, skill: 'Skill 5a' });
    expect(reject(c, { type: 'event.undo', eventId: offer2 })).toMatch(/offered again/);
  });

  it('class gate: a lagging profession evolves with its level and banked XP repriced at the new grade', () => {
    const raw = bankingRules() as unknown as { tracks: { evolutionGate: string } };
    raw.tracks.evolutionGate = 'class';
    let c = run(
      [{ type: 'campaign.create', name: 'Gate', rules: raw }, make('jake', 'Jake')],
      testContext('h'),
    );
    c = ok(c, award(400));
    c = ok(c, release(archery, 'Volley', 'common'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    c = pickAll(ok(c, award(10 * XP_F)));
    c = ok(c, release('Volley', 'Volley II', 'uncommon', { professions: ['Smith'] }));
    c = ok(c, {
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
      profession: 'Smith',
    });
    // E: class to 49, profession only to 30 (+ 100 XP into level 31).
    c = ok(c, award(35 * XP_E));
    c = ok(c, award(16 * XP_E + 100, 'profession'));
    expect(char(c)).toMatchObject({ classLevel: 49, professionLevel: 30, grade: 'E' });
    expect(raceLevel(rules, char(c))).toBe(39);
    // Profession XP beyond what it needs is not banked: it is below its cap.
    expect(char(c).xp.profession).toBe(100);
    c = pickAll(ok(c, award(2 * XP_D + 100))); // banks on the class track
    c = ok(c, release('Volley II', 'Volley III', 'epic'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    const j = char(c);
    expect(j.grade).toBe('D');
    expect(j.classLevel).toBe(51); // two D levels banked, 100 left
    expect(j.xp.class).toBe(100);
    expect(j.professionLevel).toBe(30);
    expect(j.xp.profession).toBe(100); // kept; now toward a D level
  });

  it('race gate: banked profession XP applies after the evolution', () => {
    let c = toF();
    c = pickAll(ok(c, award(10 * XP_F)));
    c = ok(c, release('Volley', 'Volley II', 'uncommon', { professions: ['Smith'] }));
    c = ok(c, {
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
      profession: 'Smith',
    });
    c = ok(c, award(35 * XP_E));
    c = ok(c, award(35 * XP_E + 2 * XP_D + 100, 'profession'));
    expect(char(c)).toMatchObject({ classLevel: 49, professionLevel: 49 });
    expect(char(c).xp.profession).toBe(2 * XP_D + 100);
    c = pickAll(c);
    c = ok(c, release('Volley II', 'Volley III', 'epic'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(char(c)).toMatchObject({ grade: 'D', professionLevel: 51 });
    expect(char(c).xp.profession).toBe(100);
  });

  it('an evolution waits for every earned selection (D103, replaces Q21)', () => {
    let c = ok(toF(), award(10 * XP_F));
    expect(dueSelections(rules, char(c)).map((s) => s.level)).toEqual([5, 10]);
    expect(reject(c, release('Volley', 'Volley II', 'uncommon'))).toMatch(
      /skill selection to choose first \(class level 5, 10\)/,
    );
    c = ok(c, {
      type: 'selection.offer',
      characterId: 'jake',
      level: 5,
      options: menu(5, 'rare'),
    });
    c = ok(c, { type: 'selection.choose', characterId: 'jake', level: 5, skill: 'Skill 5b' });
    // An offered but unchosen menu still holds it back.
    c = ok(c, {
      type: 'selection.offer',
      characterId: 'jake',
      level: 10,
      options: menu(10, 'rare'),
    });
    expect(reject(c, release('Volley', 'Volley II', 'uncommon'))).toMatch(/class level 10\)/);
    c = ok(c, { type: 'selection.choose', characterId: 'jake', level: 10, skill: 'Skill 10b' });
    c = ok(c, release('Volley', 'Volley II', 'uncommon'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(char(c).grade).toBe('E');
  });

  it('the owner sees how many earned selections wait, offered or not (MQ.1 review)', () => {
    const due = (c: Campaign): number => {
      if (!c.state) throw new Error('no state');
      return projectForPlayer(c.state, 'jake').me.selectionsDue;
    };
    let c = ok(toF(), award(10 * XP_F));
    expect(due(c)).toBe(2);
    c = ok(c, { type: 'selection.offer', characterId: 'jake', level: 5, options: menu(5, 'rare') });
    expect(due(c)).toBe(2);
    c = ok(c, { type: 'selection.choose', characterId: 'jake', level: 5, skill: 'Skill 5b' });
    expect(due(c)).toBe(1);
  });
});

describe('review fixes (M1.10 round 2)', () => {
  it('a pick an open release depends on cannot be undone (D103)', () => {
    let c = ok(ok(atGTop(), release(archery, 'Volley', 'common')), {
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
    });
    c = pickAll(ok(c, award(10 * XP_F)));
    c = ok(c, release('Volley', 'Volley II', 'uncommon'));
    const pickEvent = c.events.findLast((e) => e.type === 'selection.chosen');
    if (!pickEvent) throw new Error('no pick');
    expect(reject(c, { type: 'event.undo', eventId: pickEvent.id })).toMatch(
      /skill selection to choose first/,
    );
  });
});

describe('banked marks through an evolution (M1.A review)', () => {
  const marked = () =>
    ['s1', 's2'].reduce(
      (c, session) =>
        ok(c, { type: 'skill.awardMark', characterId: 'jake', skill: archery, session }),
      atGTop(),
    );
  const evolveWith = (rarity: string) =>
    ok(ok(marked(), release(archery, 'Archery', rarity)), {
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
    });

  it('a transform that keeps the rarity keeps the banked marks', () => {
    expect(char(evolveWith('inferior')).skills[0]).toMatchObject({ name: 'Archery', marks: 2 });
  });

  it('a transform that raises the rarity spends them', () => {
    expect(char(evolveWith('common')).skills[0]).toMatchObject({ name: 'Archery', marks: 0 });
  });
});

/** Jake evolved to F with every pool at 1 (to see that the old rules never refill). */
function toFLegacy(): Campaign {
  let c = ok(ok(atGTop(), release(archery, 'Volley', 'common')), {
    type: 'evolution.choose',
    characterId: 'jake',
    optionId: 'o1',
  });
  const hurt = Object.fromEntries(Object.keys(char(c).pools).map((id) => [id, 1]));
  c = ok(c, { type: 'character.setPools', characterId: 'jake', pools: hurt });
  return c;
}

describe('evolution rules from Luke (MQ.1: D98, D99, D102, D103)', () => {
  const pools = (c: Campaign) => char(c).pools;
  it('the chosen option adds its one-time stat bonus to base stats; the others do not count', () => {
    let c = ok(atGTop(), {
      type: 'evolution.release',
      characterId: 'jake',
      options: [
        {
          className: 'Hunter',
          transforms: [{ skill: archery, name: 'Volley', rarity: 'common' }],
          statBonus: { strength: 3, agility: 5 },
        },
        {
          className: 'Scout',
          transforms: [{ skill: stealth, name: 'Shade', rarity: 'common' }],
          statBonus: { perception: 20 },
        },
      ],
    });
    const before = char(c).stats;
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' }, player('jake'));
    const after = char(c).stats;
    expect(after['strength']).toBe((before['strength'] ?? 0) + 3);
    expect(after['agility']).toBe((before['agility'] ?? 0) + 5);
    expect(after['perception']).toBe(before['perception']);
  });

  it('a +N to all bonus raises every stat', () => {
    const all = Object.fromEntries(rules.stats.list.map((s) => [s.id, 2]));
    let c = ok(atGTop(), {
      type: 'evolution.release',
      characterId: 'jake',
      options: [
        {
          className: 'Hunter',
          transforms: [{ skill: archery, name: 'Volley', rarity: 'common' }],
          statBonus: all,
        },
      ],
    });
    const before = char(c).stats;
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    for (const s of rules.stats.list) expect(char(c).stats[s.id]).toBe((before[s.id] ?? 0) + 2);
  });

  it('rejects a bonus for an unknown stat or a negative or fractional value', () => {
    const bad = (statBonus: Record<string, number>) =>
      reject(atGTop(), {
        type: 'evolution.release',
        characterId: 'jake',
        options: [
          {
            className: 'Hunter',
            transforms: [{ skill: archery, name: 'Volley', rarity: 'common' }],
            statBonus,
          },
        ],
      });
    expect(bad({ luck: 1 })).toMatch(/Unknown stat "luck"|luck/);
    expect(bad({ strength: -1 })).toMatch(/strength|nonnegative|>=/i);
    expect(bad({ strength: 1.5 })).toMatch(/strength|integer/i);
  });

  it('evolution refills HP, MP and Stamina, at the new maxima', () => {
    let c = atGTop();
    const hurt = Object.fromEntries(Object.keys(pools(c)).map((id) => [id, 1]));
    c = ok(c, { type: 'character.setPools', characterId: 'jake', pools: hurt });
    expect(Object.values(pools(c)).every((v) => v === 1)).toBe(true);
    c = ok(c, {
      type: 'evolution.release',
      characterId: 'jake',
      options: [
        {
          className: 'Hunter',
          transforms: [{ skill: archery, name: 'Volley', rarity: 'common' }],
          statBonus: { vitality: 10 },
        },
      ],
    });
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    const stats = char(c).stats;
    for (const pool of rules.pools) {
      expect(pools(c)[pool.id]).toBe(Math.floor(pool.multiplier * (stats[pool.stat] ?? 0)));
    }
    expect(pools(c)['hp']).toBeGreaterThan(10 * 10); // vitality bonus counted
  });

  it('level-ups never refill pools', () => {
    let c = atGTop();
    c = ok(c, release(archery, 'Volley', 'common'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    const hurt = Object.fromEntries(Object.keys(pools(c)).map((id) => [id, 1]));
    c = ok(c, { type: 'character.setPools', characterId: 'jake', pools: hurt });
    c = ok(c, award(3 * XP_F));
    expect(char(c).classLevel).toBeGreaterThan(4);
    expect(Object.values(pools(c)).every((v) => v === 1)).toBe(true);
  });

  it('transforms are optional: the default minimum is 0 (D102)', () => {
    expect(rules.skills.evolutionTransforms.min).toBe(0);
    let c = atGTop();
    c = ok(c, {
      type: 'evolution.release',
      characterId: 'jake',
      options: [{ className: 'Hunter', transforms: [], statBonus: { strength: 1 } }],
    });
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(char(c).grade).toBe('F');
  });

  it('events stored before MQ.1 replay under the old rules (upcast, no gate, no refill)', () => {
    // A v1 log: an evolution released and chosen while selections were pending.
    const legacy = ok(toFLegacy(), award(10 * XP_F));
    expect(dueSelections(rules, char(legacy)).length).toBeGreaterThan(0);
    const events = legacy.events.map((e) => ({ ...e }));
    const relId = 'v-legacy-rel';
    const choId = 'v-legacy-cho';
    const stamp = events.at(-1)?.timestamp ?? '2026-10-22T00:00:00.000Z';
    const v1Release = {
      id: relId,
      timestamp: stamp,
      actor: { role: 'gm' },
      sessionId: null,
      type: 'evolution.released',
      schemaVersion: 1,
      payload: {
        characterId: 'jake',
        options: [
          {
            id: 'o1',
            className: 'Hunter II',
            description: '',
            transforms: [{ skill: 'Volley', name: 'Volley II', rarity: 'uncommon' }],
            classWeights: null,
          },
        ],
        professions: [],
      },
    };
    const v1Choice = {
      ...v1Release,
      id: choId,
      type: 'evolution.chosen',
      schemaVersion: 1,
      payload: { characterId: 'jake', optionId: 'o1', profession: null, releaseId: relId },
    };
    const replayed = replay([...events, v1Release, v1Choice]);
    const j = replayed.state?.characters['jake'];
    expect(j?.grade).toBe('E');
    // No refill under the old rules: pools as they were before.
    expect(j?.pools).toEqual(char(legacy).pools);
  });
});

describe('evolution refill counts items and titles (MQ.1 review)', () => {
  it('refills to the effective maximum, not the base one', () => {
    let c = atGTop();
    c = ok(c, {
      type: 'item.define',
      id: 'amulet',
      name: 'Amulet of Life',
      rarity: 'common',
      slot: 'necklace',
      // Within MQ.14's item cap (20% of base Vitality, at least 2 here).
      bonuses: [{ stat: 'vitality', flat: 2 }],
    });
    c = ok(c, { type: 'holdings.adjust', characterId: 'jake', items: { amulet: 1 } });
    c = ok(c, { type: 'item.equip', characterId: 'jake', itemId: 'amulet', slot: 'necklace' });
    const hurt = Object.fromEntries(Object.keys(char(c).pools).map((id) => [id, 1]));
    c = ok(c, { type: 'character.setPools', characterId: 'jake', pools: hurt });
    c = ok(c, release(archery, 'Volley', 'common'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    const base = char(c).stats['vitality'] ?? 0;
    expect(char(c).pools['hp']).toBe(10 * (base + 2));
  });
});

describe('passed-over options stay eligible (MQ.3, DESIGN §6, D103)', () => {
  const toF = () =>
    ok(ok(atGTop(), release(archery, 'Volley', 'common')), {
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
    });
  const offer = (c: Campaign, level: number): Campaign =>
    ok(c, { type: 'selection.offer', characterId: 'jake', level, options: menu(level, 'rare') });
  const choose = (c: Campaign, level: number, skill: string): Campaign =>
    ok(c, { type: 'selection.choose', characterId: 'jake', level, skill });

  it('unchosen options appear for later selections, newest menu first, and can be picked', () => {
    let c = ok(toF(), award(10 * XP_F));
    c = choose(offer(c, 5), 5, 'Skill 5b');
    expect(passedOverOptions(rules, char(c), 10).map((o) => o.name)).toEqual([
      'Skill 5a',
      'Skill 5c',
    ]);
    c = offer(c, 10);
    // One pick per selection: the older option fills the level 10 selection.
    c = choose(c, 10, 'Skill 5a');
    expect(char(c).skills.some((s) => s.name === 'Skill 5a')).toBe(true);
    expect(char(c).selections.find((s) => s.level === 10)?.chosen).toBe('Skill 5a');
    expect(dueSelections(rules, char(c))).toEqual([]);
    // The owner's view lists them under the pending menu (MQ.3).
    expect(
      projectForPlayer(c.state ?? (null as never), 'jake').me.selections.find((r) => r.level === 10)
        ?.passedOver,
    ).toEqual([]);
    // Owned now, so it leaves the list; the level 10 leftovers come first.
    c = ok(c, award(5 * XP_F));
    expect(passedOverOptions(rules, char(c), 15).map((o) => o.name)).toEqual([
      'Skill 10a',
      'Skill 10b',
      'Skill 10c',
      'Skill 5c',
    ]);
  });

  it('a name on no menu, old or new, is still refused', () => {
    let c = ok(toF(), award(10 * XP_F));
    c = offer(choose(offer(c, 5), 5, 'Skill 5b'), 10);
    expect(
      reject(c, { type: 'selection.choose', characterId: 'jake', level: 10, skill: 'Skill 99' }),
    ).toMatch(/not on the level 10 menu/);
    const mine = projectForPlayer(c.state ?? (null as never), 'jake').me.selections;
    expect(mine.find((r) => r.level === 10)?.passedOver.map((o) => o.name)).toEqual([
      'Skill 5a',
      'Skill 5c',
    ]);
    expect(JSON.stringify(projectForPlayer(c.state ?? (null as never), 'kim'))).not.toContain(
      'Skill 5a',
    );
    // Options of an unchosen (pending) menu are not passed over yet.
    expect(passedOverOptions(rules, char(c), 15).map((o) => o.name)).toEqual([
      'Skill 5a',
      'Skill 5c',
    ]);
  });
});

describe('the GM withdraws a passed-over option (MQ.3, DESIGN §6)', () => {
  const toF = () =>
    ok(ok(atGTop(), release(archery, 'Volley', 'common')), {
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
    });
  const setUp = () => {
    let c = ok(toF(), award(10 * XP_F));
    c = ok(c, { type: 'selection.offer', characterId: 'jake', level: 5, options: menu(5, 'rare') });
    c = ok(c, { type: 'selection.choose', characterId: 'jake', level: 5, skill: 'Skill 5b' });
    return ok(c, {
      type: 'selection.offer',
      characterId: 'jake',
      level: 10,
      options: menu(10, 'rare'),
    });
  };

  it('removes it from later menus and refuses it as a pick', () => {
    let c = setUp();
    c = ok(c, { type: 'selection.withdrawOption', characterId: 'jake', skill: ' skill 5A ' });
    expect(passedOverOptions(rules, char(c), 10).map((o) => o.name)).toEqual(['Skill 5c']);
    expect(char(c).selections.find((s) => s.level === 5)?.withdrawn).toEqual(['Skill 5a']);
    const mine = projectForPlayer(c.state ?? (null as never), 'jake').me.selections;
    expect(mine.find((r) => r.level === 10)?.passedOver.map((o) => o.name)).toEqual(['Skill 5c']);
    expect(
      reject(c, { type: 'selection.choose', characterId: 'jake', level: 10, skill: 'Skill 5a' }),
    ).toMatch(/not on the level 10 menu/);
    // The other leftover is still a valid pick.
    c = ok(c, { type: 'selection.choose', characterId: 'jake', level: 10, skill: 'Skill 5c' });
    expect(char(c).selections.find((s) => s.level === 10)?.chosen).toBe('Skill 5c');
  });

  it('refuses names that are not passed over, twice, chosen, or from a pending menu', () => {
    let c = setUp();
    const withdraw = (skill: string) =>
      reject(c, { type: 'selection.withdrawOption', characterId: 'jake', skill });
    expect(withdraw('Skill 99')).toMatch(/not a passed-over option/);
    expect(withdraw('Skill 5b')).toMatch(/already has \[Skill 5b\]/);
    expect(withdraw('Skill 10a')).toMatch(/not a passed-over option/);
    c = ok(c, { type: 'selection.withdrawOption', characterId: 'jake', skill: 'Skill 5a' });
    expect(withdraw('Skill 5a')).toMatch(/not a passed-over option/);
    // Picked later from a newer menu: owned now, so not withdrawable.
    c = ok(c, { type: 'selection.choose', characterId: 'jake', level: 10, skill: 'skill 5C' });
    expect(char(c).selections.find((s) => s.level === 10)?.chosen).toBe('Skill 5c');
    expect(withdraw('Skill 5c')).toMatch(/already has \[Skill 5c\]/);
  });

  it('is GM only, can be undone, and is logged', () => {
    const c = setUp();
    expect(
      reject(
        c,
        { type: 'selection.withdrawOption', characterId: 'jake', skill: 'Skill 5a' },
        player('jake'),
      ),
    ).toMatch(/only the GM/);
    const done = ok(c, {
      type: 'selection.withdrawOption',
      characterId: 'jake',
      skill: 'Skill 5a',
    });
    const last = done.events.at(-1);
    expect(last?.type).toBe('selection.optionWithdrawn');
    expect(buildSessionLog(done, done.events.length - 1).entries.map((e) => e.text)).toEqual([
      "Skill 5a withdrawn from Jake's passed-over options",
    ]);
    const undone = ok(done, { type: 'event.undo', eventId: last?.id ?? '' });
    expect(passedOverOptions(rules, char(undone), 10).map((o) => o.name)).toEqual([
      'Skill 5a',
      'Skill 5c',
    ]);
    expect(char(undone).selections.find((s) => s.level === 5)?.withdrawn).toBeUndefined();
  });
});

describe('passed-over eligibility rules (MQ.3 review, DESIGN §6)', () => {
  const opt = (name: string, rarity: string, kind: 'class' | 'profession' = 'class') => ({
    name,
    rarity,
    kind,
    description: '',
  });
  const jake = (profession: string | null = null): Character => {
    const c = ok(ok(atGTop(), release(archery, 'Volley', 'common')), {
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
    });
    const me = char(c);
    const skill = me.skills[0];
    if (!skill) throw new Error('no skill');
    return {
      ...me,
      profession,
      // The chosen options are owned, as after real picks.
      skills: [...me.skills, { ...skill, name: 'Kept' }, { ...skill, name: 'Newer' }],
      selections: [
        {
          level: 5,
          offerId: 'a',
          chosen: 'Kept',
          options: [
            opt('Kept', 'common'),
            opt('dup skill', 'common'),
            opt('Epic One', 'epic'),
            opt('Craft One', 'rare', 'profession'),
            opt('Retired One', 'rare'),
            opt('Odd One', 'no-such-rarity'),
          ],
        },
        {
          level: 10,
          offerId: 'b',
          chosen: 'Newer',
          options: [opt('Newer', 'common'), opt('Dup Skill', 'rare')],
        },
      ],
    };
  };
  const names = (c: Character, level: number, retired: string[] = []) =>
    passedOverOptions(rules, c, level, new Set(retired.map((n) => n.toLowerCase()))).map(
      (o) => o.name,
    );

  it('drops options above the ceiling of the selection being chosen; they return at a higher grade', () => {
    // Level 15 is an E-grade selection (ceiling Epic); level 10 is F (ceiling Rare).
    expect(names(jake(), 15)).toContain('Epic One');
    const f = jake();
    expect(
      passedOverOptions(rules, { ...f, selections: f.selections.slice(0, 1) }, 10).map(
        (o) => o.name,
      ),
    ).not.toContain('Epic One');
  });

  it('keeps profession options back until a profession exists', () => {
    expect(names(jake(), 15)).not.toContain('Craft One');
    expect(names(jake('Smith'), 15)).toContain('Craft One');
  });

  it('drops retired names, unknown rarities and case-insensitive duplicates (newest menu wins)', () => {
    const list = names(jake(), 15, ['Retired One']);
    expect(list).not.toContain('Retired One');
    expect(list).not.toContain('Odd One');
    expect(list.filter((n) => n.toLowerCase() === 'dup skill')).toEqual(['Dup Skill']);
    expect(list).toEqual(['Dup Skill', 'Epic One']);
    expect(names(jake(), 15)).toContain('Retired One');
  });
});

describe('marks carry over through evolutions (MQ.4, D113, D114)', () => {
  const markIn = (c: Campaign, skill: string, n: number, tag: string): Campaign => {
    for (let i = 0; i < n; i++) {
      c = ok(c, { type: 'skill.awardMark', characterId: 'jake', skill, session: `${tag}${i}` });
    }
    return c;
  };
  const skillOf = (c: Campaign, name: string) => char(c).skills.find((s) => s.name === name);

  it('a rarity-raising transform spends each step’s cost and the rest carry on', () => {
    // Inferior → Uncommon costs 3 + 4; 10 banked marks leave 3.
    let c = markIn(atGTop(), archery, 10, 'm');
    c = ok(c, release(archery, 'Hunter’s Archery', 'uncommon'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(skillOf(c, 'Hunter’s Archery')).toMatchObject({ rarity: 'uncommon', marks: 3 });
  });

  it('a transform that costs more than the banked marks leaves 0', () => {
    let c = markIn(atGTop(), archery, 5, 'm');
    c = ok(c, release(archery, 'Hunter’s Archery', 'uncommon'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(skillOf(c, 'Hunter’s Archery')).toMatchObject({ rarity: 'uncommon', marks: 0 });
  });

  it('a transform that keeps the rarity keeps every mark', () => {
    let c = markIn(atGTop(), archery, 5, 'm');
    c = ok(c, release(archery, 'Hunter’s Archery', 'inferior'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(skillOf(c, 'Hunter’s Archery')).toMatchObject({ rarity: 'inferior', marks: 5 });
  });

  it('rules stored before MQ.4 (flag absent) still reset marks on a rarity gain', () => {
    const raw = rawRules() as { skills: Record<string, unknown> };
    const { marksCarryOver: _dropped, ...skills } = raw.skills;
    void _dropped;
    let c = run(
      [{ type: 'campaign.create', name: 'Old', rules: { ...raw, skills } }, make('jake', 'Jake')],
      ctx,
    );
    c = markIn(ok(c, award(400)), archery, 10, 'm');
    c = ok(c, release(archery, 'Hunter’s Archery', 'uncommon'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(skillOf(c, 'Hunter’s Archery')).toMatchObject({ rarity: 'uncommon', marks: 0 });
  });

  it('marks banked at the ceiling apply once an evolution raises it, and the rest carry on', () => {
    // Basic Archery to Rare (the G and F ceiling), then 10 more marks bank.
    let c = base();
    let tag = 0;
    for (const cost of [3, 4, 6]) {
      c = markIn(c, archery, cost, `u${tag++}-`);
      c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: archery });
    }
    c = markIn(c, archery, 10, 'bank');
    expect(skillOf(c, archery)).toMatchObject({ rarity: 'rare', marks: 10 });
    expect(reject(c, { type: 'skill.upgrade', characterId: 'jake', skill: archery })).toMatch(
      /ceiling/,
    );
    // Evolve G → F (still Rare) → E (Epic), with no transforms; the GM keeps
    // its rarity at each re-rating (MR.1).
    for (let step = 0; step < 200 && char(c).grade !== 'E'; step++) {
      c = pickAll(c);
      const target = evolutionTarget(rules, char(c));
      if (target) {
        c = ok(c, {
          type: 'evolution.release',
          characterId: 'jake',
          options: [{ className: 'Hunter', transforms: [] }],
          rerate: { [archery]: 'rare' },
        });
        c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
      } else {
        c = ok(c, award(3 * (rules.grades.find((g) => g.id === char(c).grade)?.xpPerLevel ?? 0)));
      }
    }
    expect(char(c).grade).toBe('E');
    expect(skillOf(c, archery)).toMatchObject({ rarity: 'rare', marks: 10 });
    // Rare → Epic costs 8; 2 carry toward Ancient.
    c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: archery });
    expect(skillOf(c, archery)).toMatchObject({ rarity: 'epic', marks: 2 });
  });
});

describe('a chosen option never returns as passed-over (QF.1, DESIGN §6)', () => {
  it('Piercing Shot chosen at 5, transformed to Storm Pierce, stays off the level 15 menu', () => {
    let c = ok(ok(atGTop(), release(archery, 'Volley', 'common')), {
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
    });
    c = ok(c, award(10 * XP_F));
    c = ok(c, {
      type: 'selection.offer',
      characterId: 'jake',
      level: 5,
      options: [
        { name: 'Piercing Shot', rarity: 'common' },
        { name: 'Skill 5b', rarity: 'common' },
        { name: 'Skill 5c', rarity: 'inferior' },
      ],
    });
    c = ok(c, { type: 'selection.choose', characterId: 'jake', level: 5, skill: 'Piercing Shot' });
    // Up to the F top, then evolve to E with the transform.
    for (let step = 0; step < 200 && !evolutionTarget(rules, char(c)); step++) {
      c = pickAll(c);
      if (!evolutionTarget(rules, char(c))) c = ok(c, award(3 * 300));
    }
    c = pickAll(c);
    c = ok(c, release('Piercing Shot', 'Storm Pierce', 'uncommon'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(char(c).grade).toBe('E');
    expect(char(c).skills.some((s) => s.name === 'Storm Pierce')).toBe(true);
    while (char(c).classLevel < 15) c = ok(c, award(900));
    const names = (cc: Campaign) => passedOverOptions(rules, char(cc), 15).map((o) => o.name);
    expect(names(c)).not.toContain('Piercing Shot');
    expect(names(c)).toContain('Skill 5c');
    c = ok(c, {
      type: 'selection.offer',
      characterId: 'jake',
      level: 15,
      options: menu(15, 'epic'),
    });
    expect(
      reject(c, {
        type: 'selection.choose',
        characterId: 'jake',
        level: 15,
        skill: 'Piercing Shot',
      }),
    ).toMatch(/not on the level 15 menu/);
    const mine = projectForPlayer(c.state ?? (null as never), 'jake').me.selections;
    const listed = mine.find((r) => r.level === 15)?.passedOver.map((o) => o.name) ?? [];
    expect(listed).not.toContain('Piercing Shot');
    expect(listed).toContain('Skill 5c');
  });
});

describe('tailored professions (MQ.6, DESIGN §2)', () => {
  /** Jake released into E with Smith and Cook offered, not chosen yet. */
  const offeredAtE = (): Campaign => {
    let c = ok(atGTop(), release(archery, 'Volley', 'common'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    c = pickAll(ok(c, award(10 * XP_F)));
    return ok(c, release('Volley', 'Volley II', 'epic', { professions: ['Smith', 'Cook'] }));
  };
  /** Jake evolved into E and chose "none for now". */
  const declined = (): Campaign =>
    ok(
      offeredAtE(),
      { type: 'evolution.choose', characterId: 'jake', optionId: 'o1', profession: null },
      player('jake'),
    );
  const take = (profession: string): Command => ({
    type: 'profession.choose',
    characterId: 'jake',
    profession,
  });

  it('the player may evolve with "none for now"; the offers stay and race level = class level', () => {
    const j = char(declined());
    expect(j.grade).toBe('E');
    expect(j.profession).toBeNull();
    expect(j.professionOffers).toEqual(['Smith', 'Cook']);
    expect(raceLevel(rules, j)).toBe(j.classLevel);
  });

  it('the player takes an offered profession later; it starts at class level and locks the list', () => {
    let c = declined();
    c = ok(c, award(XP_E)); // class 15 at E; race level follows class alone
    expect(raceLevel(rules, char(c))).toBe(15);
    c = pickAll(c);
    expect(reject(c, take('Baker'), player('jake'))).toMatch(/not one of your offered professions/);
    expect(reject(c, take('smith'), player('jake'))).toMatch(/not one of your offered/);
    c = ok(c, take('Cook'), player('jake'));
    const j = char(c);
    expect(j).toMatchObject({ profession: 'Cook', professionLevel: 15 });
    expect(j.professionOffers).toEqual(['Smith', 'Cook']);
    expect(raceLevel(rules, j)).toBe(15);
    expect(reject(c, take('Smith'), player('jake'))).toMatch(/already has the profession \[Cook\]/);
    const undone = ok(c, { type: 'event.undo', eventId: c.events.at(-1)?.id ?? '' });
    expect(char(undone).profession).toBeNull();
    expect(char(undone).professionOffers).toEqual(['Smith', 'Cook']);
  });

  it('only the owning player (or the GM) takes a profession; nothing is offered before E', () => {
    const c = declined();
    expect(reject(c, take('Cook'), player('kim'))).toMatch(/own character/);
    expect(char(ok(c, take('Smith'))).profession).toBe('Smith'); // GM may record it
    expect(reject(base(), take('Cook'))).toMatch(/not one of your offered/);
  });

  it('a GM grant also locks the offers', () => {
    let c = ok(declined(), {
      type: 'character.grantProfession',
      characterId: 'jake',
      profession: 'Tamer',
    });
    expect(char(c).professionOffers).toEqual(['Smith', 'Cook']);
    expect(reject(c, take('Cook'), player('jake'))).toMatch(/already has the profession/);
    c = ok(c, { type: 'event.undo', eventId: c.events.at(-1)?.id ?? '' });
    expect(char(ok(c, take('Cook'), player('jake'))).profession).toBe('Cook');
  });

  it('a character who declined can be offered more at a later evolution; offers merge', () => {
    let c = pickAll(ok(declined(), award(40 * XP_E)));
    expect(evolutionTarget(rules, char(c))?.id).toBe('D');
    c = ok(c, {
      type: 'evolution.release',
      characterId: 'jake',
      options: [{ className: 'Hunter III', transforms: [] }],
      professions: ['cook', 'Warden'],
    });
    c = ok(
      c,
      { type: 'evolution.choose', characterId: 'jake', optionId: 'o1', profession: 'Warden' },
      player('jake'),
    );
    const j = char(c);
    expect(j).toMatchObject({ grade: 'D', profession: 'Warden', professionLevel: 49 });
    expect(j.professionOffers).toEqual(['Smith', 'Cook', 'Warden']);
  });

  it("a profession taken while a later release waits locks out that release's offers", () => {
    let c = pickAll(ok(declined(), award(40 * XP_E)));
    c = ok(c, {
      type: 'evolution.release',
      characterId: 'jake',
      options: [{ className: 'Hunter III', transforms: [] }],
      professions: ['Warden'],
    });
    c = ok(c, take('Smith'), player('jake'));
    const pick = (profession: string | null): Command => ({
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
      profession,
    });
    expect(reject(c, pick('Warden'), player('jake'))).toMatch(
      /already has the profession \[Smith\]; evolve with none/,
    );
    c = ok(c, pick(null), player('jake'));
    expect(char(c)).toMatchObject({ grade: 'D', profession: 'Smith' });
    expect(char(c).professionOffers).toEqual(['Smith', 'Cook']);
  });

  it('the offers reach only their owner', () => {
    const state = declined().state;
    if (!state) throw new Error('no state');
    const mine = projectForPlayer(state, 'jake');
    expect(mine.me.professionOffers).toEqual(['Smith', 'Cook']);
    const theirs = projectForPlayer(state, 'kim');
    expect(JSON.stringify(theirs)).not.toContain('Smith');
    expect(theirs.me.professionOffers).toEqual([]);
    const jake = theirs.party.find((m) => m.id === 'jake');
    expect(jake && Object.keys(jake)).not.toContain('professionOffers');
  });

  it('taking a profession notifies "acquired at level N", not a level-up from 0', () => {
    const c = declined();
    const taken = ok(c, take('Cook'), player('jake'));
    const before = c.state;
    if (!before || !taken.state) throw new Error('no state');
    const event = taken.events.at(-1);
    if (!event) throw new Error('no event');
    expect(notificationsBetween(before, taken.state, event)).toEqual([
      { kind: 'profession', characterId: 'jake', name: 'Cook', level: 14 },
    ]);
  });

  it('the session log notes a declined profession', () => {
    const c = declined();
    const texts = buildSessionLog(c, c.events.length - 1).entries.map((e) => e.text);
    expect(texts.some((t) => t.includes('no profession for now'))).toBe(true);
    const taken = ok(c, take('Cook'), player('jake'));
    const after = buildSessionLog(taken, taken.events.length - 1).entries.map((e) => e.text);
    expect(after, after.join(' | ')).toContain('Jake gained the profession Cook at level 14');
  });
});
