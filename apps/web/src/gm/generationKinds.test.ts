import { describe, expect, it } from 'vitest';
import { initialPicks } from './ContentImport';
import { offKind } from './generationKinds';

// QF.50: a generation's sections of other kinds start unticked.
describe('generation kinds (QF.50)', () => {
  it('a shop expects shops, items and GM notes only', () => {
    for (const t of ['shop.define', 'item.define', 'note.create'])
      expect(offKind('shop', t)).toBe(false);
    for (const t of ['quest.create', 'selection.offer', 'skillDef.define', 'evolution.release']) {
      expect(offKind('shop', t)).toBe(true);
    }
    expect(offKind('questHook', 'quest.create')).toBe(false);
    expect(offKind('npc', 'entity.define')).toBe(false);
  });
  it('a file the GM picked (no kind) and an unknown kind tick everything', () => {
    expect(offKind(undefined, 'quest.create')).toBe(false);
    expect(offKind('mystery', 'quest.create')).toBe(false);
  });
  it('initial picks leave errors and off-kind entries unticked', () => {
    const entries = [
      { path: 'shops[0]', command: { type: 'shop.define' }, error: null },
      { path: 'items[0]', command: { type: 'item.define' }, error: null },
      { path: 'items[1]', command: { type: 'item.define' }, error: 'bad' },
      { path: 'quests[0]', command: { type: 'quest.create' }, error: null },
      { path: 'skillOffers[0]', command: { type: 'selection.offer' }, error: null },
    ];
    expect([...initialPicks(entries, 'shop')]).toEqual(['shops[0]', 'items[0]']);
    expect([...initialPicks(entries, undefined)]).toEqual([
      'shops[0]',
      'items[0]',
      'quests[0]',
      'skillOffers[0]',
    ]);
  });
});
