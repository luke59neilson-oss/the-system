import type { CampaignState, SkillDef } from '@the-system/engine';

/** The GM's skill library form (ROADMAP M4.1). Pure helpers; tested in skillLibraryModel.test.ts. */

export interface SkillDraft {
  name: string;
  rarity: string;
  /** Comma-separated, as typed. */
  tags: string;
  description: string;
  flavor: string;
  effects: string;
}

/** Splits typed tags on commas, trimming and dropping blanks and repeats (ignoring case). */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const tag = raw.trim();
    if (tag === '' || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

/** A blank draft at the first selectable rarity. */
export function emptyDraft(rarities: readonly { id: string }[]): SkillDraft {
  return {
    name: '',
    rarity: rarities[0]?.id ?? '',
    tags: '',
    description: '',
    flavor: '',
    effects: '',
  };
}

/** The draft that shows a stored entry. */
export function draftOf(def: SkillDef): SkillDraft {
  return {
    name: def.name,
    rarity: def.rarity,
    tags: def.tags.join(', '),
    description: def.description,
    flavor: def.flavor,
    effects: def.effects,
  };
}

/** Library entries in definition order, filtered by name, tag or rarity name (case-insensitive). */
export function librarySkills(
  state: Pick<CampaignState, 'skillLibrary' | 'skillLibraryOrder'> & {
    rules: { skills: { rarities: readonly { id: string; name: string }[] } };
  },
  query: string,
): SkillDef[] {
  const q = query.trim().toLowerCase();
  const rarityName = (id: string) =>
    state.rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
  return state.skillLibraryOrder.flatMap((id) => {
    const def = Object.prototype.hasOwnProperty.call(state.skillLibrary, id)
      ? state.skillLibrary[id]
      : undefined;
    if (!def) return [];
    if (q === '') return [def];
    const hay = [def.name, rarityName(def.rarity), ...def.tags].map((s) => s.toLowerCase());
    return hay.some((s) => s.includes(q)) ? [def] : [];
  });
}

type Fields = Omit<SkillDraft, 'tags'> & { tags: string[] };

const fieldsOf = (d: SkillDraft): Fields => ({
  name: d.name.trim(),
  rarity: d.rarity,
  tags: parseTags(d.tags),
  description: d.description.trim(),
  flavor: d.flavor.trim(),
  effects: d.effects.trim(),
});

/**
 * The command that saves a draft: a define for a new entry, or an edit with
 * only the changed fields. Null when an edit changes nothing.
 */
export function saveCommand(
  draft: SkillDraft,
  editing: SkillDef | null,
): ({ type: string } & Record<string, unknown>) | null {
  const next = fieldsOf(draft);
  if (editing === null) return { type: 'skillDef.define', ...next };
  const old: Fields = { ...fieldsOf(draftOf(editing)), tags: [...editing.tags] };
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof Fields)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(old[key])) changes[key] = next[key];
  }
  if (Object.keys(changes).length === 0) return null;
  return { type: 'skillDef.edit', skillDefId: editing.id, ...changes };
}
