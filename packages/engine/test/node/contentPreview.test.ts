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
