import { describe, expect, it } from 'vitest';
import {
  execute,
  marksToUpgrade,
  projectForGm,
  projectForPlayer,
  type Campaign,
  type Command,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

/** MQ.12 (DESIGN §6 skill library, L4), on the rules new campaigns get. */
const ctx = testContext('lr');
const created = { type: 'campaign.create', name: 'Whale', rules: rawRules() } as const;
const make = (id: string, name: string): Command => ({
  type: 'character.create',
  id,
  name,
  className: 'Archer',
  classSkills: kit,
});
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
const define = (id: string, rarity: string, text: string, effects = ''): Command => ({
  type: 'skillDef.define',
  id,
  name: 'Identify',
  rarity,
  tags: [],
  description: `${text} description.`,
  flavor: `${text} flavour.`,
  effects,
});
const skillOf = (c: Campaign, id = 'jake') =>
  c.state?.characters[id]?.skills.find((s) => s.name === 'Identify');
let session = 0;
function upgradeIdentify(c: Campaign): Campaign {
  let next = c;
  const s = skillOf(next);
  const needed = next.state && s ? (marksToUpgrade(next.state.rules, s) ?? 0) : 0;
  for (let m = s?.marks ?? 0; m < needed; m++) {
    next = ok(next, {
      type: 'skill.awardMark',
      characterId: 'jake',
      skill: 'Identify',
      session: `s${++session}`,
    });
  }
  return ok(next, { type: 'skill.upgrade', characterId: 'jake', skill: 'Identify' });
}

describe('skill library keyed by name and rarity (MQ.12)', () => {
  it('new campaigns turn the rule on', () => {
    expect(run([created], ctx).state?.rules.skills.libraryByRarity).toBe(true);
  });

  it('holds one entry per name and rarity', () => {
    let c = ok(run([created], ctx), define('idc', 'common', 'Common'));
    c = ok(c, define('idu', 'uncommon', 'Uncommon'));
    expect(c.state?.skillLibraryOrder).toEqual(['idc', 'idu']);
    expect(
      reject(c, { ...define('idx', 'common', 'Again'), name: ' identify ' } as Command),
    ).toMatch(/already has \[Identify\] \(Common\)/);
    // Renaming the rarity onto an existing pair is refused too.
    expect(reject(c, { type: 'skillDef.edit', skillDefId: 'idu', rarity: 'common' })).toMatch(
      /already has/,
    );
  });

  it('a granted skill takes the text for its rarity, and an upgrade takes the next', () => {
    let c = ok(run([created], ctx), define('idc', 'common', 'Common'));
    c = ok(c, define('idu', 'uncommon', 'Uncommon'));
    c = ok(c, make('jake', 'Jake'));
    expect(skillOf(c)).toMatchObject({
      rarity: 'common',
      description: 'Common description.',
      flavor: 'Common flavour.',
    });
    c = upgradeIdentify(c);
    expect(skillOf(c)).toMatchObject({
      rarity: 'uncommon',
      description: 'Uncommon description.',
      flavor: 'Uncommon flavour.',
    });
    // No entry for Rare: the copy keeps the text it had.
    c = upgradeIdentify(c);
    expect(skillOf(c)).toMatchObject({ rarity: 'rare', description: 'Uncommon description.' });
  });

  it('a library edit reaches every copy the GM has not edited, and only its rarity', () => {
    let c = ok(run([created], ctx), define('idc', 'common', 'Common'));
    c = ok(c, define('idu', 'uncommon', 'Uncommon'));
    c = ok(c, make('jake', 'Jake'));
    c = ok(c, make('kim', 'Kim'));
    c = ok(c, make('mira', 'Mira'));
    c = ok(c, {
      type: 'skill.describe',
      characterId: 'kim',
      skill: 'Identify',
      description: 'Kim’s own words.',
      flavor: null,
    });
    expect(c.state?.characters['kim']?.skills.find((s) => s.name === 'Identify')?.textEdited).toBe(
      true,
    );
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'idc', description: 'Rewritten.' });
    expect(skillOf(c)?.description).toBe('Rewritten.');
    expect(skillOf(c, 'mira')?.description).toBe('Rewritten.');
    expect(skillOf(c, 'kim')).toMatchObject({ description: 'Kim’s own words.', flavor: null });
    // Editing the Uncommon entry leaves Common copies alone.
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'idu', description: 'Uncommon v2.' });
    expect(skillOf(c)?.description).toBe('Rewritten.');
    // A copy defined after its owner exists picks up the text on define.
    c = ok(c, {
      type: 'skillDef.define',
      id: 'stealth',
      name: 'Basic Stealth',
      rarity: 'inferior',
      tags: [],
      description: 'Move unseen.',
      flavor: '',
      effects: '',
    });
    const stealth = c.state?.characters['jake']?.skills.find((s) => s.name === 'Basic Stealth');
    expect(stealth).toMatchObject({ description: 'Move unseen.', flavor: null });
  });

  it('undoing an edit puts the old text back on every copy', () => {
    let c = ok(run([created], ctx), define('idc', 'common', 'Common'));
    c = ok(c, make('jake', 'Jake'));
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'idc', description: 'Rewritten.' });
    const editId = c.events.at(-1)?.id ?? '';
    c = ok(c, { type: 'event.undo', eventId: editId });
    expect(skillOf(c)?.description).toBe('Common description.');
  });

  it('effects reach the owner only; other players never see them; the GM sees all', () => {
    const eye = kit[2] ?? { name: '', rarity: 'common' };
    let c = ok(run([created], ctx), {
      type: 'skillDef.define',
      id: 'eye',
      name: eye.name,
      rarity: eye.rarity,
      tags: [],
      description: 'Sees far.',
      flavor: '',
      effects: '  CANARY effects text ',
    });
    c = ok(c, make('jake', 'Jake'));
    c = ok(c, {
      type: 'character.create',
      id: 'kim',
      name: 'Kim',
      className: 'Brawler',
      classSkills: [
        { name: 'Kim One', rarity: 'inferior' },
        { name: 'Kim Two', rarity: 'inferior' },
        { name: 'Kim Three', rarity: 'common' },
      ],
    });
    const state = c.state;
    if (!state) throw new Error('no state');
    const mine = projectForPlayer(state, 'jake').me.skills;
    expect(mine.find((s) => s.name === eye.name)?.effects).toBe('CANARY effects text');
    // Skills without an entry, or an entry without effects, show none.
    expect(mine.find((s) => s.name === 'Identify')?.effects).toBeNull();
    // Kim's view carries Jake's sheet only as a party card: never the effects.
    expect(JSON.stringify(projectForPlayer(state, 'kim'))).not.toContain('CANARY');
    expect(JSON.stringify(projectForGm(state))).toContain('CANARY effects text');
  });

  it('seeding the default set reaches copies that already exist', () => {
    let c = ok(run([created], ctx), {
      type: 'character.create',
      id: 'kim',
      name: 'Kim',
      className: 'Brawler',
      classSkills: [
        { name: 'Kim One', rarity: 'inferior' },
        { name: 'Kim Two', rarity: 'inferior' },
        { name: 'Brace', rarity: 'common' },
      ],
    });
    const cry = () => c.state?.characters['kim']?.skills.find((s) => s.name === 'Brace');
    expect(cry()?.description).toBeNull();
    c = ok(c, { type: 'library.seedDefaults' });
    const entry = Object.values(c.state?.skillLibrary ?? {}).find((d) => d.name === 'Brace');
    expect(entry?.description).toBeTruthy();
    expect(cry()?.description).toBe(entry?.description);
  });

  it('seeding adds a default entry when only another rarity of that name exists', () => {
    const cry = {
      type: 'skillDef.define',
      id: 'cry-u',
      name: 'Brace',
      rarity: 'uncommon',
      tags: [],
      description: 'Louder.',
      flavor: '',
      effects: '',
    } as const;
    const cries = (c: Campaign) =>
      Object.values(c.state?.skillLibrary ?? {})
        .filter((d) => d.name === 'Brace')
        .map((d) => d.rarity)
        .sort();
    const c = ok(ok(run([created], ctx), cry), { type: 'library.seedDefaults' });
    expect(cries(c)).toEqual(['common', 'uncommon']);
    // Stored rules (D90) still match by name only.
    const raw = rawRules() as { skills: Record<string, unknown> };
    const { libraryByRarity: _dropped, ...skills } = raw.skills;
    void _dropped;
    const old = run([{ type: 'campaign.create', name: 'Old', rules: { ...raw, skills } }], ctx);
    expect(cries(ok(ok(old, cry), { type: 'library.seedDefaults' }))).toEqual(['uncommon']);
  });

  it('rules stored before MQ.12 keep effects GM-only', () => {
    const raw = rawRules() as { skills: Record<string, unknown> };
    const { libraryByRarity: _dropped, ...skills } = raw.skills;
    void _dropped;
    let c = run([{ type: 'campaign.create', name: 'Old', rules: { ...raw, skills } }], ctx);
    c = ok(c, define('idc', 'common', 'Common', 'CANARY effects text'));
    c = ok(c, make('jake', 'Jake'));
    const state = c.state;
    if (!state) throw new Error('no state');
    expect(state.rules.skills.libraryByRarity).toBe(false);
    expect(JSON.stringify(projectForPlayer(state, 'jake'))).not.toContain('CANARY');
  });
});
