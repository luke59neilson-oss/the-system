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

/** Words a name may hold in lower case ("Tam of the Ferry", "Anna van Dorn"). */
const CONNECTORS = new Set(['of', 'the', 'de', 'van', 'von', 'da', 'del', 'la', 'le', 'and']);
/** Title abbreviations whose dot does not end the name ("Dr. Vance"). */
const ABBREVIATIONS =
  /\b(?:Dr|Mr|Mrs|Ms|Mx|St|Mt|Capt|Sgt|Lt|Fr|Sr|Jr|Prof|Rev|Gen|Col|Hon)\.(?=[\s,;:)]|$)/gu;

/**
 * Review M1/M2: whether text reads as a name: 1–5 words, each starting with a
 * capital letter (or a digit-free connector such as "of"), so a description
 * ("A half-blind woman who sells resin") or a note title ("Met the
 * ferryman", "Session 3 prep") is not taken for one.
 */
export function looksLikeName(text: string): boolean {
  const words = text.split(' ');
  if (words.length > 5 || text.length < 2 || text.length > NAME_MAX) return false;
  // A word counts when it starts with a capital or a letter with no case
  // (CJK names); lower-case connectors ("de la Cruz") need one such word.
  const named = (w: string) => /^(?:\p{Lu}|\p{Lo}|\p{Ll}'\p{Lu})/u.test(w);
  const connector = (w: string) => CONNECTORS.has(w);
  return words.some(named) && words.every((w) => named(w) || connector(w));
}

/**
 * The keeper's name from the GM's text ("Old Brenna: half-blind, …" or
 * "Old Brenna, half-blind …"): the words before the first `:`, `,`, `;`,
 * `.`, ` - `, ` — ` or `(`, keeping a title's dot ("Dr. Vance"). Null when
 * that does not read as a name.
 */
export function keeperName(keeper: string): string | null {
  const shielded = keeper
    .replace(/\s+/gu, ' ')
    .replace(ABBREVIATIONS, (m) => m.slice(0, -1) + '\uE000');
  const head = (shielded.split(/[:,;.(]| [-–—] /u)[0] ?? '').replace(/\uE000/gu, '.').trim();
  return looksLikeName(head) ? head : null;
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
      if (looksLikeName(name)) {
        // Review M3: a lore note that also names this NPC by `npc:<name>`
        // reaches the prompt as lore (loreFor); any other keeps its text here.
        const asLore = lore && tags.some((t) => t.toLowerCase() === `npc:${key(name)}`);
        add({ id: `npc:${key(name)}`, name, names: [name], notes: asLore ? '' : note.body });
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
