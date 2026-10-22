import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIBRARY,
  execute,
  projectForPlayer,
  replay,
  type Campaign,
  type Command,
} from '../src';
import {
  deepFreeze,
  kit,
  randomOriginLibraryCommand,
  rawRules,
  run,
  seededRandom,
  testContext,
} from './helpers/events';

const ctx = testContext('id');
const player = (characterId: string) => ({
  ...ctx,
  actor: { role: 'player' as const, characterId },
});
const created = { type: 'campaign.create', name: 'Whale', rules: rawRules() } as const;
function ok(c: Campaign, command: Command, context = ctx): Campaign {
  const r = execute(c, command, context);
  if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
  return r.campaign;
}
function reject(c: Campaign, command: Command, context = ctx): string {
  const r = execute(c, command, context);
  expect(r.ok, JSON.stringify(command)).toBe(false);
  return r.ok ? '' : r.error;
}
const warrior: Command = {
  type: 'classDef.define',
  id: 'warrior',
  name: 'Warrior',
  description: '  Holds the line. ',
  skills: [
    { name: 'Cut', rarity: 'inferior' },
    { name: 'Parry', rarity: 'common' },
    { name: 'Shout', rarity: 'rare' },
  ],
  weights: { strength: 3, toughness: 2 },
};

describe('class library (M4.2)', () => {
  it('defines a class with trimmed text', () => {
    const c = ok(run([created], ctx), warrior);
    expect(c.state?.classLibraryOrder).toEqual(['warrior']);
    expect(c.state?.classLibrary['warrior']).toEqual({
      id: 'warrior',
      name: 'Warrior',
      description: 'Holds the line.',
      skills: [
        { name: 'Cut', rarity: 'inferior' },
        { name: 'Parry', rarity: 'common' },
        { name: 'Shout', rarity: 'rare' },
      ],
      weights: { strength: 3, toughness: 2 },
    });
  });

  it('refuses a class that could not start a character', () => {
    const c = run([created], ctx);
    const base = warrior as Extract<Command, { type: 'classDef.define' }>;
    expect(reject(c, { ...base, skills: base.skills.slice(0, 2) })).toMatch(/exactly 3 skills/);
    expect(
      reject(c, {
        ...base,
        skills: [...base.skills.slice(0, 2), { name: 'Big Shout', rarity: 'epic' }],
      }),
    ).toMatch(/not allowed at G-grade/);
    expect(
      reject(c, {
        ...base,
        skills: [...base.skills.slice(0, 2), { name: 'identify', rarity: 'common' }],
      }),
    ).toMatch(/Duplicate skill/);
    expect(reject(c, { ...base, weights: { luck: 3 } })).toMatch(/Unknown stat/);
    expect(reject(c, { ...base, weights: { strength: 0 } })).toMatch(/at least one stat/);
    expect(reject(c, { ...base, weights: { strength: 1.5 } })).toMatch(/expected int/);
    expect(reject(c, { ...base, weights: { strength: 1001 } })).toMatch(/0 to 1000/);
    expect(reject(c, { ...base, name: '  ' })).toMatch(/blank/);
  });

  it('refuses clashing names (ignoring case), unknown ids, empty edits and players', () => {
    const c = ok(run([created, kitCharacter('jake')], ctx), warrior);
    const base = warrior as Extract<Command, { type: 'classDef.define' }>;
    expect(reject(c, { ...base, id: 'w2', name: ' warrior' })).toMatch(/already has \[Warrior\]/);
    expect(reject(c, { ...base })).toMatch(/already exists/);
    expect(reject(c, { type: 'classDef.edit', classDefId: 'nope', name: 'X' })).toMatch(
      /unknown library class/,
    );
    expect(reject(c, { type: 'classDef.edit', classDefId: 'warrior', name: 'Warrior' })).toMatch(
      /nothing to change/,
    );
    expect(reject(c, base, player('jake'))).toMatch(/only the GM/);
  });

  it('edits only the given fields and re-checks the result', () => {
    let c = ok(run([created], ctx), warrior);
    expect(
      reject(c, {
        type: 'classDef.edit',
        classDefId: 'warrior',
        weights: { toughness: 2, strength: 3 },
      }),
    ).toMatch(/nothing to change/);
    c = ok(c, { type: 'classDef.edit', classDefId: 'warrior', weights: { agility: 1 } });
    expect(c.state?.classLibrary['warrior']?.weights).toEqual({ agility: 1 });
    expect(c.state?.classLibrary['warrior']?.name).toBe('Warrior');
    expect(
      reject(c, {
        type: 'classDef.edit',
        classDefId: 'warrior',
        skills: [{ name: 'Cut', rarity: 'inferior' }],
      }),
    ).toMatch(/exactly 3/);
  });

  it('never reaches a player and editing it leaves existing characters alone', () => {
    let c = ok(run([created], ctx), warrior);
    const def = c.state?.classLibrary['warrior'];
    c = ok(c, {
      type: 'character.create',
      id: 'jake',
      name: 'Jake',
      className: def?.name ?? '',
      classSkills: def?.skills ?? [],
      classWeights: def?.weights,
    });
    c = ok(c, { type: 'classDef.edit', classDefId: 'warrior', name: 'Knight' });
    expect(c.state?.characters['jake']?.className).toBe('Warrior');
    const view = JSON.stringify(projectForPlayer(c.state!, 'jake'));
    expect(view).not.toContain('Holds the line');
    expect(view).not.toContain('Knight');
  });
});

function kitCharacter(id: string): Command {
  return { type: 'character.create', id, name: id, className: 'Archer', classSkills: kit };
}

describe('race and profession libraries (M4.2)', () => {
  it('defines and edits races; names are unique ignoring case', () => {
    let c = ok(run([created], ctx), {
      type: 'raceDef.define',
      id: 'human',
      name: 'Human',
      description: 'Earth’s own.',
    });
    expect(reject(c, { type: 'raceDef.define', name: 'HUMAN' })).toMatch(/race library/);
    c = ok(c, { type: 'raceDef.edit', raceDefId: 'human', description: '' });
    expect(c.state?.raceLibrary['human']).toEqual({ id: 'human', name: 'Human', description: '' });
    expect(reject(c, { type: 'raceDef.edit', raceDefId: 'human', description: '' })).toMatch(
      /nothing to change/,
    );
    expect(reject(c, { type: 'raceDef.edit', raceDefId: 'elf', name: 'Elf' })).toMatch(
      /unknown library race/,
    );
  });

  it('defines professions with skill ideas at any unreserved rarity', () => {
    let c = ok(run([created], ctx), {
      type: 'professionDef.define',
      id: 'alchemist',
      name: 'Alchemist',
      skills: [{ name: 'Brew', rarity: 'legendary' }],
    });
    expect(c.state?.professionLibrary['alchemist']).toEqual({
      id: 'alchemist',
      name: 'Alchemist',
      description: '',
      skills: [{ name: 'Brew', rarity: 'legendary' }],
    });
    const edit = (skills: { name: string; rarity: string }[]): Command => ({
      type: 'professionDef.edit',
      professionDefId: 'alchemist',
      skills,
    });
    expect(reject(c, edit([{ name: 'Brew', rarity: 'divine' }]))).toMatch(/reserved/);
    expect(reject(c, edit([{ name: 'Brew', rarity: 'bogus' }]))).toMatch(/unknown rarity/);
    expect(
      reject(
        c,
        edit([
          { name: 'Brew', rarity: 'common' },
          { name: 'brew', rarity: 'rare' },
        ]),
      ),
    ).toMatch(/Duplicate/);
    expect(
      reject(c, edit(Array.from({ length: 11 }, (_, i) => ({ name: `S${i}`, rarity: 'common' })))),
    ).toMatch(/at most 10|too_big|Too big|<=10/i);
    c = ok(c, edit([]));
    expect(c.state?.professionLibrary['alchemist']?.skills).toEqual([]);
  });
});

describe('default set (M4.2)', () => {
  it('seeds every default entry once, and later only what is missing', () => {
    let c = ok(run([created], ctx), { type: 'library.seedDefaults' });
    const s = c.state!;
    expect(s.classLibraryOrder.map((id) => s.classLibrary[id]?.name)).toEqual(
      DEFAULT_LIBRARY.classes.map((d) => d.name),
    );
    expect(s.raceLibraryOrder.map((id) => s.raceLibrary[id]?.name)).toEqual(['Human']);
    expect(s.professionLibraryOrder).toHaveLength(DEFAULT_LIBRARY.professions.length);
    expect(s.skillLibraryOrder).toHaveLength(DEFAULT_LIBRARY.skills.length);
    expect(reject(c, { type: 'library.seedDefaults' })).toMatch(/already hold every default/);

    c = ok(run([created], ctx), { ...(warrior as object), id: 'mine' } as Command);
    c = ok(c, { type: 'library.seedDefaults' });
    const names = c.state!.classLibraryOrder.map((id) => c.state!.classLibrary[id]?.name);
    expect(names.filter((n) => n === 'Warrior')).toHaveLength(1);
    expect(c.state!.classLibrary['mine']?.skills[0]?.name).toBe('Cut');
  });

  it('gives every default class a character whose skills take the library text', () => {
    let c = ok(run([created], ctx), { type: 'library.seedDefaults' });
    const s = c.state!;
    for (const [i, id] of s.classLibraryOrder.entries()) {
      const def = s.classLibrary[id]!;
      c = ok(c, {
        type: 'character.create',
        id: `c${i}`,
        name: def.name,
        className: def.name,
        race: 'Human',
        classSkills: def.skills,
        classWeights: def.weights,
      });
      for (const skill of c.state!.characters[`c${i}`]!.skills) {
        if (skill.name === 'Identify') continue;
        expect(skill.description, `${def.name}: ${skill.name}`).toBeTruthy();
        expect(skill.flavor, `${def.name}: ${skill.name}`).toBeTruthy();
      }
    }
  });

  it('is undone as one event', () => {
    const c = ok(run([created], ctx), { type: 'library.seedDefaults' });
    const seeded = c.events.at(-1)!;
    const undone = ok(c, { type: 'event.undo', eventId: seeded.id });
    expect(undone.state?.classLibraryOrder).toEqual([]);
    expect(undone.state?.skillLibraryOrder).toEqual([]);
    expect(undone.state?.professionLibraryOrder).toEqual([]);
  });

  it('refuses a hand-built seed that clashes or is empty', () => {
    const c = ok(run([created], ctx), warrior);
    const raw = {
      ...c.events.at(-1)!,
      id: 'x1',
      type: 'library.seeded',
      payload: { skills: [], classes: [], races: [], professions: [] },
    };
    expect(() => replay([...c.events, raw])).toThrow(/nothing to add/);
  });
});

describe('property: library commands replay to the same state (M4.2)', () => {
  const SEED = 20261022;
  it('holds over 400 random commands', () => {
    const rand = seededRandom(SEED);
    let c = run([created, kitCharacter('c1')], ctx);
    const accepted: Record<string, number> = {};
    for (let step = 0; step < 400; step++) {
      let command = randomOriginLibraryCommand(rand, c);
      if (step % 7 === 3 && c.events.length > 2) {
        const target = c.events[2 + Math.floor(rand() * (c.events.length - 2))]!;
        command = { type: 'event.undo', eventId: target.id };
      }
      const r = execute(deepFreeze(c), command, ctx);
      if (!r.ok) continue;
      accepted[command.type] = (accepted[command.type] ?? 0) + 1;
      c = r.campaign;
      const replayed = replay(JSON.parse(JSON.stringify(c.events)) as unknown[]);
      expect(replayed.state, `seed ${SEED}, step ${step}`).toEqual(c.state);
    }
    for (const type of [
      'classDef.define',
      'classDef.edit',
      'raceDef.define',
      'raceDef.edit',
      'professionDef.define',
      'professionDef.edit',
      'library.seedDefaults',
      'event.undo',
    ]) {
      expect(accepted[type] ?? 0, `seed ${SEED}: accepted ${type}`).toBeGreaterThan(0);
    }
  });
});
