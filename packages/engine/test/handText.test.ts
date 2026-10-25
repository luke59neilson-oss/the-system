import { describe, expect, it } from 'vitest';
import {
  execute,
  marksToUpgrade,
  projectForGm,
  projectForPlayer,
  replay,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

/**
 * MR.4 (DESIGN §6, L17): a hand-written skill copy keeps its text through
 * upgrades until the GM presses Use library text (`skill.useLibraryText`),
 * which reconnects it to the entry for its current name and rarity. Every
 * step goes through `execute`, on the rules a new campaign gets.
 */
const ctx = testContext('ht');
const player = (characterId: string): CommandContext => ({
  ...ctx,
  actor: { role: 'player', characterId },
});
const created = { type: 'campaign.create', name: 'Whale', rules: rawRules() } as const;
const make = (id: string, name: string): Command => ({
  type: 'character.create',
  id,
  name,
  className: 'Archer',
  classSkills: kit,
});
function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const r = execute(c, command, context);
  if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
  return r.campaign;
}
function reject(c: Campaign, command: Command, context: CommandContext = ctx): string {
  const r = execute(c, command, context);
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
const handWrite = (text: string, id = 'jake'): Command => ({
  type: 'skill.describe',
  characterId: id,
  skill: 'Identify',
  description: text,
  flavor: null,
});
const useLibrary = (id = 'jake'): Command => ({
  type: 'skill.useLibraryText',
  characterId: id,
  skill: 'Identify',
});
const skillOf = (c: Campaign, id = 'jake') =>
  c.state?.characters[id]?.skills.find((s) => s.name === 'Identify');
let session = 0;
function upgradeIdentify(c: Campaign, id = 'jake'): Campaign {
  let next = c;
  const s = skillOf(next, id);
  const needed = next.state && s ? (marksToUpgrade(next.state.rules, s) ?? 0) : 0;
  for (let m = s?.marks ?? 0; m < needed; m++) {
    next = ok(next, {
      type: 'skill.awardMark',
      characterId: id,
      skill: 'Identify',
      session: `s${++session}`,
    });
  }
  return ok(next, { type: 'skill.upgrade', characterId: id, skill: 'Identify' });
}
/** Library text for Common and Uncommon Identify; Jake and Kim hold Common copies. */
const base = (): Campaign => {
  let c = ok(run([created], ctx), define('idc', 'common', 'Common', 'Common effects.'));
  c = ok(c, define('idu', 'uncommon', 'Uncommon', 'Uncommon effects.'));
  c = ok(c, make('jake', 'Jake'));
  return ok(c, make('kim', 'Kim'));
};

describe('hand-written skill text survives upgrades (MR.4)', () => {
  it('new campaigns turn the rule on; stored rules read it as off', () => {
    expect(base().state?.rules.skills.handTextSurvivesUpgrade).toBe(true);
    const raw = rawRules() as { skills: Record<string, unknown> };
    delete raw.skills.handTextSurvivesUpgrade;
    const old = run([{ type: 'campaign.create', name: 'Old', rules: raw }], ctx);
    expect(old.state?.rules.skills.handTextSurvivesUpgrade).toBe(false);
  });

  it('an upgrade keeps a hand-written copy’s text and mark; an unedited copy takes the new text', () => {
    let c = ok(base(), handWrite('Jake’s own words.'));
    c = upgradeIdentify(c, 'jake');
    c = upgradeIdentify(c, 'kim');
    expect(skillOf(c, 'jake')).toMatchObject({
      rarity: 'uncommon',
      description: 'Jake’s own words.',
      flavor: null,
      textEdited: true,
    });
    expect(skillOf(c, 'kim')).toMatchObject({
      rarity: 'uncommon',
      description: 'Uncommon description.',
      flavor: 'Uncommon flavour.',
    });
    expect(skillOf(c, 'kim')?.textEdited).toBeUndefined();
    // A later library edit at the new rarity still skips the hand-written copy.
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'idu', description: 'Edited.' });
    expect(skillOf(c, 'jake')?.description).toBe('Jake’s own words.');
    expect(skillOf(c, 'kim')?.description).toBe('Edited.');
  });

  it('a re-rating at evolution never changes text, hand-written or not', () => {
    let c = ok(base(), handWrite('Jake’s own words.'));
    c = ok(c, {
      type: 'xp.award',
      track: 'class',
      amount: 800,
      participants: [{ characterId: 'jake' }, { characterId: 'kim' }],
    });
    for (const id of ['jake', 'kim']) {
      c = ok(c, {
        type: 'evolution.release',
        rerateApproved: true,
        characterId: id,
        options: [{ className: 'Hunter' }],
        // Identify is a race skill and never drops (MT.1), so the GM raises it.
        rerate: { Identify: 'uncommon' },
      });
      c = ok(c, { type: 'evolution.choose', characterId: id, optionId: 'o1' }, player(id));
    }
    expect(skillOf(c, 'jake')).toMatchObject({
      rarity: 'uncommon',
      description: 'Jake’s own words.',
      textEdited: true,
    });
    expect(skillOf(c, 'kim')).toMatchObject({
      rarity: 'uncommon',
      description: 'Common description.',
    });
  });

  it('Use library text reconnects the copy to its current rarity’s entry', () => {
    let c = ok(base(), handWrite('Jake’s own words.'));
    c = upgradeIdentify(c);
    c = ok(c, useLibrary());
    expect(skillOf(c)).toMatchObject({
      rarity: 'uncommon',
      description: 'Uncommon description.',
      flavor: 'Uncommon flavour.',
    });
    expect(skillOf(c)?.textEdited).toBeUndefined();
    // Library edits reach it again, and the owner still sees the entry's effects.
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'idu', description: 'Edited.' });
    expect(skillOf(c)?.description).toBe('Edited.');
    const own = projectForPlayer(c.state!, 'jake');
    expect(own.me?.skills.find((s) => s.name === 'Identify')).toMatchObject({
      description: 'Edited.',
      effects: 'Uncommon effects.',
    });
    // The event is logged and replays to the same state.
    expect(c.events.at(-2)?.type).toBe('skill.libraryTextUsed');
    expect(replay(JSON.parse(JSON.stringify(c.events)) as unknown[]).state).toEqual(c.state);
  });

  it('a blank entry field keeps the copy’s own text for that field', () => {
    let c = ok(base(), {
      type: 'skillDef.edit',
      skillDefId: 'idc',
      flavor: '',
    });
    c = ok(c, {
      type: 'skill.describe',
      characterId: 'jake',
      skill: 'Identify',
      description: 'Mine.',
      flavor: 'My flavour.',
    });
    c = ok(c, useLibrary());
    expect(skillOf(c)).toMatchObject({ description: 'Common description.', flavor: 'My flavour.' });
  });

  it('after a re-rating, reconnecting follows the new rarity, not the old text rarity', () => {
    let c = ok(base(), handWrite('Jake’s own words.'));
    c = ok(c, {
      type: 'xp.award',
      track: 'class',
      amount: 400,
      participants: [{ characterId: 'jake' }],
    });
    c = ok(c, {
      type: 'evolution.release',
      rerateApproved: true,
      characterId: 'jake',
      options: [{ className: 'H' }],
      rerate: { Identify: 'uncommon' },
    });
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' }, player('jake'));
    expect(skillOf(c)).toMatchObject({ rarity: 'uncommon', textRarity: 'common' });
    c = ok(c, useLibrary());
    expect(skillOf(c)).toMatchObject({
      rarity: 'uncommon',
      description: 'Uncommon description.',
    });
    expect(skillOf(c)?.textRarity).toBeUndefined();
    // From now on it follows the Uncommon entry.
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'idu', description: 'Uncommon edited.' });
    expect(skillOf(c)?.description).toBe('Uncommon edited.');
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'idc', description: 'Common edited.' });
    expect(skillOf(c)?.description).toBe('Uncommon edited.');
  });

  it('moves a re-rated, library-linked copy to its current rarity’s entry (MR.A)', () => {
    let c = ok(base(), {
      type: 'xp.award',
      track: 'class',
      amount: 400,
      participants: [{ characterId: 'kim' }],
    });
    c = ok(c, {
      type: 'evolution.release',
      rerateApproved: true,
      characterId: 'kim',
      options: [{ className: 'H' }],
      rerate: { Identify: 'uncommon' },
    });
    c = ok(c, { type: 'evolution.choose', characterId: 'kim', optionId: 'o1' }, player('kim'));
    expect(skillOf(c, 'kim')).toMatchObject({
      rarity: 'uncommon',
      textRarity: 'common',
      description: 'Common description.',
    });
    expect(skillOf(c, 'kim')?.textEdited).toBeUndefined();
    c = ok(c, useLibrary('kim'));
    expect(skillOf(c, 'kim')).toMatchObject({ description: 'Uncommon description.' });
    expect(skillOf(c, 'kim')?.textRarity).toBeUndefined();
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'idu', description: 'Uncommon edited.' });
    expect(skillOf(c, 'kim')?.description).toBe('Uncommon edited.');
    // Now it follows the library at its own rarity, so a second press is refused.
    expect(reject(c, useLibrary('kim'))).toMatch(/already uses the library text/);
    expect(replay(c.events).state).toEqual(c.state);
  });

  it('is refused with no entry, on an unedited copy, for players and for unknown skills', () => {
    let c = ok(base(), handWrite('Jake’s own words.'));
    expect(reject(c, useLibrary('kim'))).toMatch(/already uses the library text/);
    expect(reject(c, useLibrary(), player('jake'))).toMatch(/GM|not allowed|permission/i);
    expect(reject(c, { type: 'skill.useLibraryText', characterId: 'jake', skill: 'Nope' })).toMatch(
      /has no skill/,
    );
    c = upgradeIdentify(c);
    c = upgradeIdentify(c); // Rare: no entry
    expect(skillOf(c)).toMatchObject({ rarity: 'rare', description: 'Jake’s own words.' });
    expect(reject(c, useLibrary())).toMatch(/no entry with text for \[Identify\] at its rarity/);
    expect(JSON.stringify(projectForPlayer(c.state!, 'kim'))).not.toContain('Jake’s own words');
    expect(projectForGm(c.state!).characters.jake?.skills.length).toBeGreaterThan(0);
  });

  it('refuses an all-blank entry, and undo restores the hand-written copy', () => {
    let c = ok(base(), handWrite('Jake’s own words.'));
    const before = skillOf(c);
    c = ok(c, useLibrary());
    const used = c.events.at(-1)!;
    c = ok(c, { type: 'event.undo', eventId: used.id });
    expect(skillOf(c)).toEqual(before);
    c = ok(c, { type: 'skillDef.edit', skillDefId: 'idc', description: ' ', flavor: '' });
    expect(reject(c, useLibrary())).toMatch(/no entry with text/);
  });

  it('a same-name evolution transform keeps hand-written text', () => {
    let c = ok(base(), handWrite('Jake’s own words.'));
    c = ok(c, {
      type: 'xp.award',
      track: 'class',
      amount: 400,
      participants: [{ characterId: 'jake' }],
    });
    c = ok(c, {
      type: 'evolution.release',
      rerateApproved: true,
      characterId: 'jake',
      options: [
        {
          className: 'Hunter',
          transforms: [{ skill: 'Identify', name: 'Identify', rarity: 'uncommon' }],
        },
      ],
    });
    c = ok(c, { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' }, player('jake'));
    expect(skillOf(c)).toMatchObject({
      rarity: 'uncommon',
      description: 'Jake’s own words.',
      textEdited: true,
    });
  });

  it('under stored rules (D133) an upgrade still replaces hand text with the entry’s', () => {
    const raw = rawRules() as { skills: Record<string, unknown> };
    raw.skills.handTextSurvivesUpgrade = false;
    let c = ok(run([{ type: 'campaign.create', name: 'Old', rules: raw }], ctx), {
      ...define('idc', 'common', 'Common'),
    });
    c = ok(c, define('idu', 'uncommon', 'Uncommon'));
    c = ok(c, make('jake', 'Jake'));
    c = ok(c, handWrite('Old words.'));
    c = upgradeIdentify(c);
    expect(skillOf(c)).toMatchObject({ description: 'Uncommon description.' });
    expect(skillOf(c)?.textEdited).toBeUndefined();
  });
});
