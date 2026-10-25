import { describe, expect, it } from 'vitest';
import { execute, projectForGm, projectForPlayer, type Campaign, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

const ctx = testContext('id');
const player = (characterId: string) => ({
  ...ctx,
  actor: { role: 'player' as const, characterId },
});
/**
 * These tests pin D90's behaviour on rules stored before MQ.12 (no
 * `libraryByRarity`, read as false): name-only fill of empty text, effects
 * GM-only. MQ.12's rules are in `skillLibraryRarity.test.ts`.
 */
function storedRules(): unknown {
  const raw = rawRules() as { skills: Record<string, unknown> };
  const { libraryByRarity: _dropped, ...skills } = raw.skills;
  void _dropped;
  return { ...raw, skills };
}
const created = { type: 'campaign.create', name: 'Whale', rules: storedRules() } as const;
const jake = {
  type: 'character.create',
  id: 'jake',
  name: 'Jake',
  className: 'Archer',
  classSkills: kit,
} as const;
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
const identify: Command = {
  type: 'skillDef.define',
  id: 'identify',
  name: 'Identify',
  rarity: 'common',
  tags: ['Race', ' race ', '', 'Utility'],
  description: '  Learn what something is. ',
  flavor: 'Knowledge is the first weapon.',
  effects: 'GM: reveals tier text up to the skill’s rarity.',
};
const skillOf = (c: Campaign, name: string, id = 'jake') =>
  c.state?.characters[id]?.skills.find((s) => s.name === name);

describe('skill library (M4.1)', () => {
  it('defines a skill with trimmed text and de-duplicated tags', () => {
    const c = ok(run([created], ctx), identify);
    expect(c.state?.skillLibraryOrder).toEqual(['identify']);
    expect(c.state?.skillLibrary['identify']).toEqual({
      id: 'identify',
      name: 'Identify',
      rarity: 'common',
      tags: ['Race', 'Utility'],
      description: 'Learn what something is.',
      flavor: 'Knowledge is the first weapon.',
      effects: 'GM: reveals tier text up to the skill’s rarity.',
    });
  });

  it('refuses unknown or reserved rarities, clashing names and players', () => {
    const c = ok(run([created], ctx), identify);
    expect(reject(c, { type: 'skillDef.define', name: 'X', rarity: 'bogus' })).toMatch(
      /Unknown rarity/,
    );
    expect(reject(c, { type: 'skillDef.define', name: 'X', rarity: 'divine' })).toMatch(/reserved/);
    expect(reject(c, { type: 'skillDef.define', name: ' identify ', rarity: 'rare' })).toMatch(
      /already has \[Identify\]/,
    );
    expect(reject(c, { ...identify, name: 'Other' })).toMatch(/already exists/);
    expect(
      reject(c, { type: 'skillDef.define', name: 'Y', rarity: 'common', tags: ['x'.repeat(41)] }),
    ).toMatch(/tag/);
    const withJake = ok(c, jake);
    expect(
      reject(withJake, { type: 'skillDef.define', name: 'Z', rarity: 'common' }, player('jake')),
    ).toMatch(/GM/i);
  });

  it('edits keep omitted fields, refuse no-ops and name clashes', () => {
    let c = ok(ok(run([created], ctx), identify), {
      type: 'skillDef.define',
      id: 'archery',
      name: 'Basic Archery',
      rarity: 'inferior',
    });
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'archery', rarity: 'common', flavor: 'Aim.' });
    expect(c.state?.skillLibrary['archery']).toMatchObject({
      name: 'Basic Archery',
      rarity: 'common',
      flavor: 'Aim.',
      description: '',
    });
    expect(reject(c, { type: 'skillDef.edit', skillDefId: 'archery', flavor: ' Aim. ' })).toMatch(
      /nothing to change/,
    );
    expect(reject(c, { type: 'skillDef.edit', skillDefId: 'archery', name: 'IDENTIFY' })).toMatch(
      /already has/,
    );
    expect(reject(c, { type: 'skillDef.edit', skillDefId: 'nope', flavor: 'x' })).toMatch(
      /unknown library skill/,
    );
    // Renaming an entry to its own name in another case is allowed.
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'archery', name: 'basic archery' });
    expect(c.state?.skillLibrary['archery']?.name).toBe('basic archery');
  });

  it('fills a new character’s empty skill text, including Identify, without overwriting', () => {
    let c = ok(run([created], ctx), identify);
    c = ok(c, {
      type: 'skillDef.define',
      name: 'Basic Archery',
      rarity: 'inferior',
      description: 'Library text.',
      flavor: 'Library flavour.',
    });
    c = ok(c, {
      ...jake,
      classSkills: [
        { name: 'Basic Archery', rarity: 'inferior', description: 'Own text.' },
        ...kit.slice(1),
      ],
    });
    expect(skillOf(c, 'Identify')).toMatchObject({
      description: 'Learn what something is.',
      flavor: 'Knowledge is the first weapon.',
    });
    // Its own description stays; only the empty flavour is filled.
    expect(skillOf(c, 'Basic Archery')).toMatchObject({
      description: 'Own text.',
      flavor: 'Library flavour.',
    });
    expect(skillOf(c, 'Basic Stealth')).toMatchObject({ description: null, flavor: null });
  });

  it('changes no granted skill when the library is edited later, and clears stay cleared', () => {
    let c = ok(ok(run([created], ctx), identify), jake);
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'identify', description: 'New text.' });
    expect(skillOf(c, 'Identify')?.description).toBe('Learn what something is.');
    c = ok(c, {
      type: 'skill.describe',
      characterId: 'jake',
      skill: 'Identify',
      description: null,
      flavor: null,
    });
    expect(skillOf(c, 'Identify')).toMatchObject({ description: null, flavor: null });
  });

  it('fills a skill gained by evolution', () => {
    let c = ok(
      ok(run([created, jake], ctx), {
        type: 'skillDef.define',
        name: 'Hunter’s Archery',
        rarity: 'common',
        description: 'Shoot like a hunter.',
      }),
      { type: 'xp.award', track: 'class', amount: 400, participants: [{ characterId: 'jake' }] },
    );
    c = ok(c, {
      type: 'evolution.release',
      rerateApproved: true,
      characterId: 'jake',
      options: [
        {
          className: 'Hunter',
          transforms: [{ skill: 'Basic Archery', name: 'Hunter’s Archery', rarity: 'common' }],
        },
      ],
    });
    const optionId = c.state?.characters['jake']?.evolution?.options[0]?.id ?? '';
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId });
    expect(skillOf(c, 'Hunter’s Archery')?.description).toBe('Shoot like a hunter.');
  });

  it('never reaches a player; the GM sees it whole', () => {
    const c = ok(ok(run([created], ctx), identify), jake);
    if (!c.state) throw new Error('no state');
    const text = JSON.stringify(projectForPlayer(c.state, 'jake'));
    expect(text).not.toContain('GM: reveals tier text');
    expect(text).not.toContain('skillLibrary');
    // The granted copy's System text does reach its owner.
    expect(text).toContain('Learn what something is.');
    expect(projectForGm(c.state).skillLibrary['identify']?.effects).toMatch(/^GM:/);
  });

  it('undo replays as if the library event never happened', () => {
    let c = ok(run([created], ctx), identify);
    const defineId = c.events.at(-1)?.id ?? '';
    // A later edit depends on the define, so the define cannot be undone first.
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'identify', flavor: 'Edited.' });
    const editId = c.events.at(-1)?.id ?? '';
    expect(reject(c, { type: 'event.undo', eventId: defineId })).toMatch(/depends on it/);
    c = ok(c, jake);
    expect(skillOf(c, 'Identify')?.flavor).toBe('Edited.');
    // Undoing the edit re-folds the log, so Jake (created after it) gets the original flavour.
    c = ok(c, { type: 'event.undo', eventId: editId });
    expect(c.state?.skillLibrary['identify']?.flavor).toBe('Knowledge is the first weapon.');
    expect(skillOf(c, 'Identify')?.flavor).toBe('Knowledge is the first weapon.');
    // With the edit gone, undoing the define leaves Jake's Identify without text.
    c = ok(c, { type: 'event.undo', eventId: defineId });
    expect(c.state?.skillLibraryOrder).toEqual([]);
    expect(skillOf(c, 'Identify')).toMatchObject({ description: null, flavor: null });
  });
});
