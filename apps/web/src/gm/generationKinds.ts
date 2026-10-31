/**
 * QF.50: what each co-DM generation kind is meant to contain (the server's
 * KIND_GUIDE, apps/server/src/ai/generate.ts). A generation that also carries
 * other sections (a shop that adds a quest or a skill menu) previews those
 * entries unticked, marked "not what you asked for", so the GM opts in
 * rather than out. GM notes are always expected: they stay GM-only.
 */
const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  shop: ['shop.define', 'item.define', 'note.create'],
  npc: ['note.create', 'entity.define'],
  place: ['region.define', 'entity.define', 'note.create'],
  encounter: ['entity.define', 'note.create'],
  item: ['item.define', 'note.create'],
  questHook: ['quest.create', 'note.create'],
};

export const OFF_KIND_NOTE = 'not what you asked for: tick it to apply it too';

/** True when a generation of `kind` was not asked to make a `commandType` entry. */
export function offKind(kind: string | undefined, commandType: string): boolean {
  if (kind === undefined) return false;
  const expected = EXPECTED[kind];
  return expected !== undefined && !expected.includes(commandType);
}
