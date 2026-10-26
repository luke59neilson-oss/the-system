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
});
