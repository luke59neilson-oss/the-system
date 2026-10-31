/**
 * QF.50: who can be "the NPC in the scene" for the quick responses (DESIGN
 * §11). Bestiary entities (MD.1), shop keepers (MU.1 shops are GM-side and a
 * generated shop's keeper exists only in the shop) and NPCs that live only in
 * GM notes: a note tagged `npc` (a co-DM NPC generation writes one, titled with
 * the NPC's name) or any GM note tagged `npc:<name>` (kept lore, D260).
 */
import type { CampaignState } from '@the-system/engine';

export interface SceneNpc {
  /** Opaque to the client: an entity id, `shop:<shop id>` or `npc:<lower-cased name>`. */
  readonly id: string;
  readonly name: string;
  /** Every name the table might say for it (the entity's player label too). */
  readonly names: readonly string[];
  /** What the GM wrote about it; clipped in the prompt. */
  readonly notes: string;
}

const NAME_MAX = 60;

/**
 * The keeper's name from the GM's text ("Old Brenna: half-blind, …" or
 * "Old Brenna, half-blind …"): the words before the first `:`, `,`, `;`,
 * `.`, ` - `, ` — ` or `(`. Null when that is empty or too long to be a name.
 */
export function keeperName(keeper: string): string | null {
  const head =
    keeper
      .split(/[:,;.(]| [-–—] /u)[0]
      ?.replace(/\s+/gu, ' ')
      .trim() ?? '';
  if (head.length < 2 || head.length > NAME_MAX) return null;
  return head;
}

const key = (name: string) => name.trim().toLowerCase();

export function sceneNpcs(state: CampaignState): SceneNpc[] {
  const out: SceneNpc[] = [];
  const byName = new Map<string, number>();
  const add = (npc: SceneNpc) => {
    const at = byName.get(key(npc.name));
    if (at !== undefined) {
      // The same person in two places (a bestiary entry and a note): one choice,
      // with both texts.
      const was = out[at] as SceneNpc;
      const notes = [was.notes, npc.notes].filter((n) => n.trim() !== '');
      out[at] = { ...was, notes: [...new Set(notes)].join('\n') };
      return;
    }
    byName.set(key(npc.name), out.length);
    out.push(npc);
  };

  for (const e of Object.values(state.entities)) {
    add({
      id: e.id,
      name: e.name,
      names: [e.name, e.label].filter((n, i, all) => n.trim() !== '' && all.indexOf(n) === i),
      notes: e.notes,
    });
  }
  for (const shop of Object.values(state.shops ?? {})) {
    const name = keeperName(shop.keeper);
    if (!name) continue;
    add({
      id: `shop:${shop.id}`,
      name,
      names: [name],
      notes: `Keeper of ${shop.name}. ${shop.keeper}`,
    });
  }
  const gmNotes = Object.values(state.notes)
    .filter((n) => n.kind === 'gm')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const note of gmNotes) {
    const tags = note.tags.map((t) => t.trim());
    const lore = tags.some((t) => t.toLowerCase() === 'lore');
    if (tags.some((t) => t.toLowerCase() === 'npc')) {
      const name = note.title.replace(/\s+/gu, ' ').trim();
      if (name.length >= 2 && name.length <= NAME_MAX) {
        add({ id: `npc:${key(name)}`, name, names: [name], notes: note.body });
      }
    }
    for (const t of tags) {
      const m = /^npc:(.+)$/iu.exec(t);
      const name = m?.[1]?.replace(/\s+/gu, ' ').trim() ?? '';
      if (name.length < 2 || name.length > NAME_MAX) continue;
      // A lore note's text reaches the prompt as lore (loreFor), not as notes.
      add({ id: `npc:${key(name)}`, name, names: [name], notes: lore ? '' : note.body });
    }
  }
  return out;
}
