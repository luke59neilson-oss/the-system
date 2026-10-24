// M9.3 (in progress): the import preview runs a file's commands on a
// scratch copy and changes nothing.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { previewContent, type Campaign } from '../../src';
import { kit, rawRules, run, testContext } from '../helpers/events';

const examples = path.resolve(import.meta.dirname, '../../../../docs/content-examples');
const ctx = testContext('pv');
const campaign = (): Campaign =>
  run(
    [
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
    ],
    ctx,
  );

describe('previewContent (M9.3)', () => {
  it('checks every entry against the campaign without changing it', () => {
    const c = campaign();
    const before = JSON.stringify(c.state);
    const p = previewContent(c, readFileSync(path.join(examples, 'library.json'), 'utf8'), ctx);
    expect(p.ok && p.entries.map((e) => e.error)).toEqual([null, null, null]);
    expect(JSON.stringify(c.state)).toBe(before);
  });

  it('reports a later entry that clashes with an earlier one, and shape errors first', () => {
    const skill = { name: 'Twice', rarity: 'rare' };
    const p = previewContent(
      campaign(),
      {
        format: 'the-system/content',
        version: 1,
        skills: [skill, skill],
        skillOffers: [{ character: 'Nobody', level: 5, options: [skill] }],
      },
      ctx,
    );
    if (!p.ok) throw new Error('expected a preview');
    expect(p.entries[0]?.error).toBeNull();
    expect(p.entries[1]?.error).toBeTruthy();
    expect(p.errors).toEqual([
      { path: 'skillOffers[0].character', message: 'No character named "Nobody"' },
    ]);
    expect(previewContent(campaign(), '{', ctx).ok).toBe(false);
  });

  it('previews only the ticked entries, still in file order', () => {
    const skill = { name: 'Twice', rarity: 'rare' };
    const file = { format: 'the-system/content', version: 1, skills: [skill, skill] };
    const all = previewContent(campaign(), file, ctx);
    expect(all.ok && all.entries.map((e) => e.error === null)).toEqual([true, false]);
    // With the first left out, the second no longer clashes with it.
    const second = previewContent(campaign(), file, ctx, new Set(['skills[1]']));
    expect(second.ok && second.entries.map((e) => e.error)).toEqual([null, null]);
    // With both, the clash is reported on the later one.
    const both = previewContent(campaign(), file, ctx, new Set(['skills[0]', 'skills[1]']));
    expect(both.ok && both.entries[1]?.error).toBeTruthy();
  });

  it('says so when no campaign is open', () => {
    const p = previewContent(
      { events: [], state: null } as unknown as Campaign,
      { format: 'the-system/content', version: 1 },
      ctx,
    );
    expect(p).toEqual({ ok: false, errors: [{ path: '(file)', message: 'No campaign is open' }] });
  });

  it('notes, without blocking, an item whose name the library already has', () => {
    const item = { name: 'Salt', rarity: 'common' };
    const p = previewContent(
      campaign(),
      { format: 'the-system/content', version: 1, items: [item, item] },
      ctx,
    );
    if (!p.ok) throw new Error('expected a preview');
    expect(p.entries.map((e) => e.error)).toEqual([null, null]);
    expect(p.entries[0]?.note).toBeNull();
    expect(p.entries[1]?.note).toContain('[Salt]');
  });
});

describe('previewContent: drafted menus and evolutions say where they go (M9.A)', () => {
  const atTop = (extra: Parameters<typeof run>[0] = []) =>
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
        {
          type: 'xp.award',
          amount: 400,
          track: 'class',
          participants: [{ characterId: 'jake' }],
        },
        ...extra,
      ],
      ctx,
    );
  const evolution = (className: string) => ({
    character: 'Jake',
    options: [{ className }, { className: `${className} II` }],
  });

  it('names the player and the options, and a release it replaces', () => {
    const p = previewContent(
      atTop(),
      {
        format: 'the-system/content',
        version: 1,
        evolutions: [evolution('Skirmisher'), evolution('Marksman')],
      },
      ctx,
    );
    if (!p.ok) throw new Error('expected a preview');
    expect(p.entries.map((e) => e.error)).toEqual([null, null]);
    expect(p.entries[0]?.note).toBe(
      "Goes to Jake's screen on Apply: [Skirmisher], [Skirmisher II]",
    );
    expect(p.entries[1]?.note).toBe(
      "Goes to Jake's screen on Apply: [Marksman], [Marksman II]; replaces the evolution Jake was offered",
    );
  });

  it('names a menu’s options with their rarities, and the open menu it replaces', () => {
    const evolved = atTop([
      { type: 'evolution.release', characterId: 'jake', options: [{ className: 'Hunter' }] },
      { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' },
      {
        type: 'xp.award',
        amount: 300,
        track: 'class',
        participants: [{ characterId: 'jake' }],
      },
    ]);
    const menu = {
      character: 'Jake',
      level: 5,
      options: [
        { name: 'Quick Draw', rarity: 'common' },
        { name: 'Pinning Shot', rarity: 'uncommon' },
        { name: 'Steady Breath', rarity: 'rare' },
      ],
    };
    const p = previewContent(
      evolved,
      { format: 'the-system/content', version: 1, skillOffers: [menu, menu] },
      ctx,
    );
    if (!p.ok) throw new Error('expected a preview');
    expect(p.entries.map((e) => e.error)).toEqual([null, null]);
    expect(p.entries[0]?.note).toBe(
      "Goes to Jake's screen on Apply: [Quick Draw (Common)], [Pinning Shot (Uncommon)], [Steady Breath (Rare)]",
    );
    expect(p.entries[1]?.note).toContain('; replaces the level 5 menu Jake has now');
  });
});
