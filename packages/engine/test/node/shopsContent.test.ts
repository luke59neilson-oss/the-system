// MC.3: the shop example in docs/content-examples imports end to end.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  contentToCommands,
  execute,
  parseContentFile,
  previewContent,
  type Command,
} from '../../src';
import { kit, run, testContext } from '../helpers/events';

const setup: Command[] = [
  {
    type: 'campaign.create',
    name: 'Whale',
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) as typeof DEFAULT_RULES,
  },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
];

describe('shops in content files (MC.3)', () => {
  it('the example imports: wares and place resolve to what the file defines above', () => {
    const file = readFileSync(
      path.join(import.meta.dirname, '../../../../docs/content-examples/shop.json'),
      'utf8',
    );
    const parsed = parseContentFile(file);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    let c = run(setup);
    const { commands, errors } = contentToCommands(parsed.content, c.state!);
    expect(errors).toEqual([]);
    const ctx = testContext('m');
    for (const { command } of commands) {
      const r = execute(c, command, ctx);
      if (!r.ok) throw new Error(r.error);
      c = r.campaign;
    }
    const shop = Object.values(c.state?.shops ?? {})[0];
    expect(shop?.name).toBe('Sap & Sinew');
    expect(shop?.wares.map((w) => [c.state?.items[w.itemId]?.name, w.price])).toEqual([
      ['Clotleaf Salve', 15],
      ['Bracers of the Grove', 120],
    ]);
    expect(c.state?.regions[shop?.regionId ?? '']?.name).toBe('The Crown Camp');
  });
  it('importing the shop again is noted, not refused (shops may share names)', () => {
    const c = run([
      ...setup,
      { type: 'item.define', id: 'salve', name: 'Clotleaf Salve', rarity: 'common' },
      { type: 'shop.define', name: 'Sap & Sinew', wares: [{ item: 'salve', price: 15 }] },
    ]);
    const file = JSON.stringify({
      format: 'the-system/content',
      version: 1,
      shops: [{ name: 'sap & sinew', wares: [{ item: 'Clotleaf Salve', price: 9 }] }],
    });
    const preview = previewContent(c, file, testContext('p'));
    if (!preview.ok) throw new Error(JSON.stringify(preview.errors));
    expect(preview.entries[0]?.error).toBeNull();
    expect(preview.entries[0]?.note).toBe(
      'The campaign already has a shop named [sap & sinew]: this adds another',
    );
  });
  it('QF.29: a file that defines an item the library already has sells its own copy', () => {
    const c = run([
      ...setup,
      { type: 'item.define', id: 'old-salve', name: 'Clotleaf Salve', rarity: 'common' },
    ]);
    const file = JSON.stringify({
      format: 'the-system/content',
      version: 1,
      items: [{ name: 'Clotleaf Salve', rarity: 'common' }],
      shops: [{ name: 'Sap & Sinew', wares: [{ item: 'clotleaf salve', price: 9 }] }],
    });
    const preview = previewContent(c, file, testContext('p'));
    if (!preview.ok) throw new Error(JSON.stringify(preview.errors));
    expect(preview.entries.map((e) => e.error)).toEqual([null, null]);
    const parsed = parseContentFile(file);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    let next = c;
    const ctx = testContext('q');
    for (const { command } of contentToCommands(parsed.content, c.state!).commands) {
      const r = execute(next, command, ctx);
      if (!r.ok) throw new Error(r.error);
      next = r.campaign;
    }
    const shop = Object.values(next.state?.shops ?? {})[0];
    const newSalve = next.state?.itemOrder.at(-1);
    expect(newSalve).not.toBe('old-salve');
    expect(shop?.wares[0]?.itemId).toBe(newSalve);
  });
  it('QF.29: the example imports again; its shop sells the new copies at the existing place', () => {
    const file = readFileSync(
      path.join(import.meta.dirname, '../../../../docs/content-examples/shop.json'),
      'utf8',
    );
    const parsed = parseContentFile(file);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    let c = run(setup);
    const ctx = testContext('m');
    for (let pass = 0; pass < 2; pass += 1) {
      const preview = previewContent(c, file, testContext(`p${pass}`));
      if (!preview.ok) throw new Error(JSON.stringify(preview.errors));
      // Region names are unique, so the second pass refuses only the region;
      // the shop then stands at the one that exists.
      const failing = preview.entries.filter((e) => e.error !== null).map((e) => e.error);
      expect(failing).toEqual(
        pass === 0 ? [] : [expect.stringContaining('a region is already called')],
      );
      for (const { command } of contentToCommands(parsed.content, c.state!).commands) {
        const r = execute(c, command, ctx);
        if (!r.ok && command.type === 'region.define' && pass === 1) continue;
        if (!r.ok) throw new Error(r.error);
        c = r.campaign;
      }
    }
    const [first, second] = (c.state?.shopOrder ?? []).map((id) => c.state?.shops?.[id]);
    const firstIds = first?.wares.map((w) => w.itemId) ?? [];
    const secondIds = second?.wares.map((w) => w.itemId) ?? [];
    expect(secondIds).toHaveLength(firstIds.length);
    for (const id of secondIds) expect(firstIds).not.toContain(id);
    expect(second?.regionId).toBe(first?.regionId);
  });
});
