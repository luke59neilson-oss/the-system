// M9.5: the tutorial content pack (DESIGN §8) imports cleanly into a new
// campaign and sets up the quest, regions, bestiary, loot, titles and notes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute, previewContent, type Campaign } from '../../src';
import { kit, rawRules, run, testContext } from '../helpers/events';

const pack = readFileSync(
  path.resolve(import.meta.dirname, '../../../../docs/content-packs/tutorial.json'),
  'utf8',
);
const ctx = testContext('tp');
const fresh = (): Campaign =>
  run(
    [
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
    ],
    ctx,
  );

function importAll(campaign: Campaign): Campaign {
  const p = previewContent(campaign, pack, ctx);
  if (!p.ok) throw new Error(JSON.stringify(p.errors));
  let c = campaign;
  for (const e of p.entries) {
    const r = execute(c, e.command, ctx);
    if (!r.ok) throw new Error(`${e.path}: ${r.error}`);
    c = { ...r.campaign };
  }
  return c;
}

describe('tutorial content pack (M9.5)', () => {
  it('previews with no problems on a new campaign', () => {
    const p = previewContent(fresh(), pack, ctx);
    if (!p.ok) throw new Error(JSON.stringify(p.errors));
    expect(p.errors).toEqual([]);
    expect(p.entries.filter((e) => e.error !== null)).toEqual([]);
    expect(p.entries.filter((e) => e.note !== null)).toEqual([]);
  });

  it('sets up DESIGN §8: the 30-day quest with World Stability, the seven regions, the curse tiers', () => {
    const state = importAll(fresh()).state;
    if (!state) throw new Error('no state');
    const quests = Object.values(state.quests);
    const main = quests.find((q) => q.title === 'The World Is Dying');
    // The app shows the timer itself ("Time remaining: N days"), so the text
    // leaves out DESIGN §8's fixed "30 days", which would go stale.
    expect(main?.text).toBe(
      'The world is dying. Find what is killing it. Delve to the heart of the world and purge the infection.',
    );
    expect(main?.days).toBe(30);
    expect(main?.visible).toBe(true);
    expect(main?.stability?.rules).toEqual({
      'cleanse-curse-zone': -5,
      'kill-pale-hunter': -2,
      'kill-system-beast': 1,
      'kill-beast-lord': 5,
    });
    expect(quests.find((q) => q.title === "The Host's Response")?.visible).toBe(false);
    expect(Object.values(state.regions).map((r) => r.name)).toEqual([
      'The Crown',
      'Rake Canyons',
      'Twin Spouts',
      'Stormlung',
      'Red Rivers',
      'Marrow Halls',
      'The Drum',
    ]);
    const miasma = Object.values(state.entities).find((e) => e.name === 'Curse energy');
    expect(miasma?.tiers.map((t) => t.text)).toEqual([
      '[Malignant Miasma]',
      '[Fever]',
      "[The Host's Response]",
    ]);
    const rapid = Object.values(state.titleLibrary).find((t) => t.name === 'Rapid Spread');
    expect(rapid?.text).toBe('You have propagated through the Host faster than any before you.');
    expect(state.hunger.enabled).toBe(true);
    expect(Object.values(state.notes).every((n) => n.kind === 'gm')).toBe(true);
  });

  it('a second import is caught by the preview before anything doubles up', () => {
    const p = previewContent(importAll(fresh()), pack, ctx);
    if (!p.ok) throw new Error('expected a preview');
    const blocked = new Set(p.entries.filter((e) => e.error !== null).map((e) => e.path));
    for (const path of ['regions[0]', 'titles[0]', 'skills[0]', 'hunger']) {
      expect(blocked, path).toContain(path);
    }
    // Items and bestiary entries may share names: those are notes, not errors.
    expect(p.entries.find((e) => e.path === 'items[0]')?.note).toContain('[Grazer Hide Vest]');
    expect(p.entries.find((e) => e.path === 'bestiary[1]')?.note).toContain('[Curse energy]');
  });
});
