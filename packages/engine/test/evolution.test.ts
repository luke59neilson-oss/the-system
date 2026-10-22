import { describe, expect, it } from 'vitest';
import {
  createCharacter,
  defaultRules,
  dueSelections,
  evolutionTarget,
  execute,
  nextSelectionLevel,
  projectForPlayer,
  raceLevel,
  selectionSlots,
  skillPairCounts,
  type Campaign,
  type Character,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

const rules = defaultRules();
const created: Command = { type: 'campaign.create', name: 'Whale', rules: rawRules() };
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
      const j = char(c);
      if (j.classLevel >= 240 && j.professionLevel >= 240) break;
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
  const reached5 = () => ok(at5(), award(150));

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
    const c = ok(reached5(), award(5 * 150));
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
    let c = ok(atGTop(), award(450));
    expect(char(c).classLevel).toBe(4);
    expect(char(c).xp.class).toBe(450);
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
    expect(j.classLevel).toBe(7); // 450 banked / 150 per F level
    expect(j.xp.class).toBe(0);
    expect(j.skills.map((s) => [s.name, s.rarity])).toEqual([
      ['Twin Shot', 'rare'],
      [stealth, 'common'],
      ['Archer’s Eye', 'common'],
      ['Identify', 'common'],
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
    expect(bad([{ className: 'H', transforms: [] }])).toMatch(/transforms 0 skills/);
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
      /Professions are offered at the E-grade/,
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
    c = ok(c, award(10 * 150 + 500)); // class 14 (F top) + 500 banked
    expect(char(c).classLevel).toBe(14);
    expect(evolutionTarget(rules, char(c))?.id).toBe('E');
    c = ok(c, release('Volley', 'Volley II', 'epic', { professions: ['Smith', 'Cook'] }));
    expect(reject(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' })).toMatch(
      /Choose one of the offered professions/,
    );
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
    expect(j.professionLevel).toBe(14); // the System credits what it already saw
    expect(j.classLevel).toBe(16); // 500 banked / 250 per E level
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
    c = ok(c, award(10 * 150));
    c = ok(c, release('Volley', 'Volley II', 'uncommon'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(char(c).profession).toBeNull();
    c = ok(c, { type: 'character.grantProfession', characterId: 'jake', profession: 'Cook' });
    expect(char(c)).toMatchObject({ profession: 'Cook', professionLevel: 14 });
    // Past E, professions are never offered with an evolution.
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
    const raw = rawRules() as { tracks: { evolutionGate: string } };
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
    let c = ok(atGTop(), award(150));
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
    expect(projectForPlayer(after, 'jake').me.selections).toEqual(char(c).selections);
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
    c = ok(ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' }), award(150));
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
    const raw = rawRules() as { tracks: { evolutionGate: string } };
    raw.tracks.evolutionGate = 'class';
    let c = run(
      [{ type: 'campaign.create', name: 'Gate', rules: raw }, make('jake', 'Jake')],
      testContext('h'),
    );
    c = ok(c, award(400));
    c = ok(c, release(archery, 'Volley', 'common'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    c = ok(c, award(10 * 150));
    c = ok(c, release('Volley', 'Volley II', 'uncommon', { professions: ['Smith'] }));
    c = ok(c, {
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
      profession: 'Smith',
    });
    // E: class to 49, profession only to 30 (+ 100 XP into level 31).
    c = ok(c, award(35 * 250));
    c = ok(c, award(16 * 250 + 100, 'profession'));
    expect(char(c)).toMatchObject({ classLevel: 49, professionLevel: 30, grade: 'E' });
    expect(raceLevel(rules, char(c))).toBe(39);
    // Profession XP beyond what it needs is not banked: it is below its cap.
    expect(char(c).xp.profession).toBe(100);
    c = ok(c, award(1000)); // banks on the class track
    c = ok(c, release('Volley II', 'Volley III', 'epic'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    const j = char(c);
    expect(j.grade).toBe('D');
    expect(j.classLevel).toBe(51); // 1000 banked / 400 per D level, 200 left
    expect(j.xp.class).toBe(200);
    expect(j.professionLevel).toBe(30);
    expect(j.xp.profession).toBe(100); // kept; now toward a D level (400)
  });

  it('race gate: banked profession XP applies after the evolution', () => {
    let c = toF();
    c = ok(c, award(10 * 150));
    c = ok(c, release('Volley', 'Volley II', 'uncommon', { professions: ['Smith'] }));
    c = ok(c, {
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
      profession: 'Smith',
    });
    c = ok(c, award(35 * 250));
    c = ok(c, award(35 * 250 + 900, 'profession'));
    expect(char(c)).toMatchObject({ classLevel: 49, professionLevel: 49 });
    expect(char(c).xp.profession).toBe(900);
    c = ok(c, release('Volley II', 'Volley III', 'epic'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(char(c)).toMatchObject({ grade: 'D', professionLevel: 51 });
    expect(char(c).xp.profession).toBe(100);
  });

  it('a selection left pending across an evolution keeps its own grade ceiling (Q21)', () => {
    let c = ok(toF(), award(10 * 150));
    c = ok(c, release('Volley', 'Volley II', 'uncommon'));
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    expect(char(c).grade).toBe('E');
    expect(dueSelections(rules, char(c)).map((s) => s.level)).toEqual([5, 10]);
    expect(
      reject(c, {
        type: 'selection.offer',
        characterId: 'jake',
        level: 10,
        options: menu(10, 'epic'),
      }),
    ).toMatch(/above the F-grade ceiling/);
    c = ok(c, {
      type: 'selection.offer',
      characterId: 'jake',
      level: 10,
      options: menu(10, 'rare'),
    });
    c = ok(c, { type: 'selection.choose', characterId: 'jake', level: 10, skill: 'Skill 10a' });
    expect(char(c).skills.at(-1)).toMatchObject({ name: 'Skill 10a', rarity: 'rare' });
  });

  it('a transform may not take a name on a pending menu', () => {
    let c = ok(toF(), award(10 * 150));
    c = ok(c, {
      type: 'selection.offer',
      characterId: 'jake',
      level: 10,
      options: menu(10, 'rare'),
    });
    expect(reject(c, release('Volley', 'Skill 10b', 'uncommon'))).toMatch(/pending level 10 menu/);
  });
});

describe('review fixes (M1.10 round 2)', () => {
  it('a menu may not offer a name a released evolution transforms into', () => {
    let c = ok(ok(atGTop(), release(archery, 'Volley', 'common')), {
      type: 'evolution.choose',
      characterId: 'jake',
      optionId: 'o1',
    });
    c = ok(c, award(10 * 150));
    c = ok(c, release('Volley', 'Volley II', 'uncommon'));
    expect(
      reject(c, {
        type: 'selection.offer',
        characterId: 'jake',
        level: 5,
        options: [...menu(5, 'rare').slice(0, 2), { name: 'Volley II', rarity: 'common' }],
      }),
    ).toMatch(/released evolution/);
    // A rarity-only transform keeps its own name.
    ok(c, release('Volley', 'Volley', 'rare'));
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
