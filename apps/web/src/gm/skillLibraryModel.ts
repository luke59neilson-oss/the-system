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
  /** MU.4: ticked = the entry carries the "spell" tag (kept out of `tags`). */
  spell: boolean;
  /** MU.4: the pool one use spends ("" = no cost) and the amount as typed. */
  costPool: string;
  costAmount: string;
  cooldown: string;
  range: string;
  castingNotes: string;
}

const SPELL = 'spell';
const isSpellTag = (t: string) => t.trim().toLowerCase() === SPELL;

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
    spell: false,
    costPool: '',
    costAmount: '',
    cooldown: '',
    range: '',
    castingNotes: '',
  };
}

/** The draft that shows a stored entry. */
export function draftOf(def: SkillDef): SkillDraft {
  return {
    name: def.name,
    rarity: def.rarity,
    tags: def.tags.filter((t) => !isSpellTag(t)).join(', '),
    description: def.description,
    flavor: def.flavor,
    effects: def.effects,
    spell: def.tags.some(isSpellTag),
    costPool: def.cost?.pool ?? '',
    costAmount: def.cost ? String(def.cost.amount) : '',
    cooldown: def.cooldown ?? '',
    range: def.range ?? '',
    castingNotes: def.castingNotes ?? '',
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

interface Fields {
  name: string;
  rarity: string;
  tags: string[];
  description: string;
  flavor: string;
  effects: string;
  cost: { pool: string; amount: number } | null;
  cooldown: string;
  range: string;
  castingNotes: string;
}

/** The typed cost as a whole number, or null when it is not one (1 or more). */
function amountOf(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 1_000_000 ? n : null;
}

/** Why the draft cannot be saved yet (MU.4 cost), or null. */
export function draftProblem(d: SkillDraft): string | null {
  if (d.costPool !== '' && amountOf(d.costAmount) === null) {
    return 'The cost is a whole number from 1 to 1,000,000';
  }
  if (d.costPool === '' && d.costAmount.trim() !== '') return 'Choose the pool the cost comes from';
  return null;
}

const fieldsOf = (d: SkillDraft): Fields => {
  const tags = parseTags(d.tags).filter((t) => !isSpellTag(t));
  const amount = amountOf(d.costAmount);
  return {
    name: d.name.trim(),
    rarity: d.rarity,
    tags: d.spell ? [...tags, SPELL] : tags,
    description: d.description.trim(),
    flavor: d.flavor.trim(),
    effects: d.effects.trim(),
    cost: d.costPool !== '' && amount !== null ? { pool: d.costPool, amount } : null,
    cooldown: d.cooldown.trim(),
    range: d.range.trim(),
    castingNotes: d.castingNotes.trim(),
  };
};

/**
 * The command that saves a draft: a define for a new entry, or an edit with
 * only the changed fields. Null when an edit changes nothing or the draft has
 * a problem (`draftProblem`).
 */
export function saveCommand(
  draft: SkillDraft,
  editing: SkillDef | null,
): ({ type: string } & Record<string, unknown>) | null {
  if (draftProblem(draft) !== null) return null;
  const next = fieldsOf(draft);
  if (editing === null) {
    // Blank casting fields are left out, so a plain skill sends what it did before MU.4.
    const { cost, cooldown, range, castingNotes, ...rest } = next;
    const text = Object.entries({ cooldown, range, castingNotes }).filter(([, v]) => v !== '');
    return {
      type: 'skillDef.define',
      ...rest,
      ...(cost ? { cost } : {}),
      ...Object.fromEntries(text),
    };
  }
  const old: Fields = fieldsOf(draftOf(editing));
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof Fields)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(old[key])) changes[key] = next[key];
  }
  if (Object.keys(changes).length === 0) return null;
  return { type: 'skillDef.edit', skillDefId: editing.id, ...changes };
}
