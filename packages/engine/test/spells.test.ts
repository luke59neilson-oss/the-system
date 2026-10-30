import { describe, expect, it } from 'vitest';
import {
  castingOf,
  CONTENT_FORMAT,
  CONTENT_FORMAT_VERSION,
  contentToCommands,
  execute,
  parseContentFile,
  isSpell,
  projectForPlayer,
  replay,
  type Campaign,
  type Command,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

/** MU.4 (DESIGN §6 "Spells are skills with costs"): library entries with costs. */
const ctx = testContext('sp');
const created = { type: 'campaign.create', name: 'Spells', rules: rawRules() } as const;
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
const bolt: Command = {
  type: 'skillDef.define',
  id: 'bolt',
  name: 'Arcane Bolt',
  rarity: 'common',
  tags: ['spell', 'arcane'],
  description: 'A bolt of raw mana.',
  effects: 'CANARY 2d6 arcane damage.',
  cost: { pool: 'mp', amount: 15 },
  cooldown: ' 10 seconds ',
  range: '30 m',
  castingNotes: 'Point and speak the word.',
};
const jake: Command = {
  type: 'character.create',
  id: 'jake',
  name: 'Jake',
  className: 'Caster',
  classSkills: [...kit.slice(0, 2), { name: 'Arcane Bolt', rarity: 'common' }],
};
const kim: Command = {
  type: 'character.create',
  id: 'kim',
  name: 'Kim',
  className: 'Brawler',
  classSkills: [
    { name: 'Kim One', rarity: 'inferior' },
    { name: 'Kim Two', rarity: 'inferior' },
    { name: 'Kim Three', rarity: 'common' },
  ],
};
const lib = (c: Campaign, id = 'bolt') => c.state?.skillLibrary[id];

describe('spells: skills with costs (MU.4)', () => {
  it('a library entry stores cost, cooldown, range and casting notes (trimmed)', () => {
    const c = ok(run([created], ctx), bolt);
    expect(lib(c)).toMatchObject({
      cost: { pool: 'mp', amount: 15 },
      cooldown: '10 seconds',
      range: '30 m',
      castingNotes: 'Point and speak the word.',
    });
    expect(isSpell(lib(c) ?? { tags: [] })).toBe(true);
  });

  it('an entry without casting fields stores exactly as before MU.4', () => {
    const c = ok(run([created], ctx), {
      type: 'skillDef.define',
      id: 'plain',
      name: 'Plain',
      rarity: 'common',
      cooldown: '  ',
      range: '',
    });
    expect(Object.keys(lib(c, 'plain') ?? {}).sort()).toEqual(
      ['description', 'effects', 'flavor', 'id', 'name', 'rarity', 'tags'].sort(),
    );
    expect(castingOf(lib(c, 'plain'))).toBeNull();
    expect(isSpell(lib(c, 'plain') ?? { tags: [] })).toBe(false);
  });

  it('refuses an unknown pool, a zero or fractional cost and over-long text', () => {
    const c = run([created], ctx);
    expect(reject(c, { ...bolt, cost: { pool: 'qi', amount: 5 } } as Command)).toMatch(
      /Unknown pool "qi"/,
    );
    expect(reject(c, { ...bolt, cost: { pool: 'mp', amount: 0 } } as Command)).toBeTruthy();
    expect(reject(c, { ...bolt, cost: { pool: 'mp', amount: 1.5 } } as Command)).toBeTruthy();
    expect(reject(c, { ...bolt, range: 'x'.repeat(81) } as Command)).toBeTruthy();
    expect(reject(c, { ...bolt, castingNotes: 'x'.repeat(1001) } as Command)).toBeTruthy();
  });

  it('edits change, clear and keep casting fields', () => {
    let c = ok(run([created], ctx), bolt);
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'bolt', cost: { pool: 'stamina', amount: 3 } });
    expect(lib(c)?.cost).toEqual({ pool: 'stamina', amount: 3 });
    expect(lib(c)?.range).toBe('30 m');
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'bolt', cost: null, range: '' });
    expect(lib(c)?.cost).toBeUndefined();
    expect(lib(c) && 'range' in lib(c)!).toBe(false);
    expect(lib(c)?.cooldown).toBe('10 seconds');
    // Clearing what is already clear changes nothing and is refused as such.
    expect(reject(c, { type: 'skillDef.edit', skillDefId: 'bolt', cost: null })).toMatch(
      /nothing to change/,
    );
    expect(
      reject(c, { type: 'skillDef.edit', skillDefId: 'bolt', cost: { pool: 'nope', amount: 1 } }),
    ).toMatch(/Unknown pool/);
  });

  it('the owner sees the cost on their skill; other players never do', () => {
    let c = ok(run([created], ctx), bolt);
    c = ok(c, jake);
    c = ok(c, kim);
    const state = c.state;
    if (!state) throw new Error('no state');
    const mine = projectForPlayer(state, 'jake').me.skills;
    expect(mine.find((s) => s.name === 'Arcane Bolt')?.casting).toEqual({
      cost: { pool: 'mp', amount: 15 },
      cooldown: '10 seconds',
      range: '30 m',
      castingNotes: 'Point and speak the word.',
    });
    // A skill whose entry has no casting fields carries none.
    expect(mine.find((s) => s.name === 'Basic Archery')).not.toHaveProperty('casting');
    const kims = JSON.stringify(projectForPlayer(state, 'kim'));
    expect(kims).not.toContain('Point and speak');
    expect(kims).not.toContain('CANARY');
  });

  it('a stored log replays to the same state with and without spells', () => {
    let c = ok(run([created], ctx), bolt);
    c = ok(c, jake);
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'bolt', cooldown: '' });
    const again = replay(c.events);
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(c.state));
  });

  it('a content pack can define a spell, and the schema refuses a bad cost', () => {
    const file = {
      format: CONTENT_FORMAT,
      version: CONTENT_FORMAT_VERSION,
      skills: [
        {
          name: 'Mend',
          rarity: 'common',
          tags: ['spell'],
          cost: { pool: 'mp', amount: 10 },
          cooldown: '1 minute',
          range: 'Touch',
          castingNotes: 'Hands on the wound.',
        },
      ],
    };
    const parsed = parseContentFile(file);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    let c = run([created], ctx);
    const { commands, errors } = contentToCommands(parsed.content, c.state!);
    expect(errors).toEqual([]);
    for (const x of commands) c = ok(c, x.command);
    const mend = Object.values(c.state?.skillLibrary ?? {}).find((d) => d.name === 'Mend');
    expect(castingOf(mend)).toEqual({
      cost: { pool: 'mp', amount: 10 },
      cooldown: '1 minute',
      range: 'Touch',
      castingNotes: 'Hands on the wound.',
    });
    const bad = parseContentFile({
      ...file,
      skills: [{ name: 'X', rarity: 'common', cost: { pool: 'mp', amount: -1 } }],
    });
    expect(bad.ok).toBe(false);
  });
});
