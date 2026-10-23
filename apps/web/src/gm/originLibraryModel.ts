import {
  missingDefaultEntries,
  type DefaultTarget,
  type CampaignState,
  type ClassDef,
  type ProfessionDef,
  type RaceDef,
  type RulesConfig,
} from '@the-system/engine';

/**
 * The GM's class, race and profession libraries (ROADMAP M4.2). Pure helpers
 * for the form; tested in originLibraryModel.test.ts.
 */

export type OriginKind = 'class' | 'race' | 'profession';
export type OriginDef = ClassDef | RaceDef | ProfessionDef;

export const KIND_LABEL: Readonly<
  Record<OriginKind, { one: string; title: string; many: string }>
> = {
  class: { one: 'class', title: 'Class', many: 'Classes' },
  race: { one: 'race', title: 'Race', many: 'Races' },
  profession: { one: 'profession', title: 'Profession', many: 'Professions' },
};

export interface SkillRow {
  name: string;
  rarity: string;
}

export interface OriginDraft {
  name: string;
  description: string;
  /** Class: exactly the starting skill count. Profession: skill ideas (blank rows ignored). */
  skills: SkillRow[];
  /** Class only: weight per stat id, as typed. */
  weights: Record<string, string>;
}

type Rules = Pick<RulesConfig, 'stats' | 'skills' | 'grades'>;
type Libraries = Pick<
  CampaignState,
  | 'classLibrary'
  | 'classLibraryOrder'
  | 'raceLibrary'
  | 'raceLibraryOrder'
  | 'professionLibrary'
  | 'professionLibraryOrder'
>;

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Rarities a starting class skill may have: up to the first grade's ceiling. */
export function classRarities(rules: Rules) {
  const usable = rules.skills.rarities.filter((r) => !r.reserved);
  const ceiling = usable.findIndex((r) => r.id === rules.grades[0]?.rarityCeiling);
  return ceiling === -1 ? usable : usable.slice(0, ceiling + 1);
}

/** Library entries of one kind in definition order. */
export function entriesOf(state: Libraries, kind: OriginKind): OriginDef[] {
  const [library, order] =
    kind === 'class'
      ? [state.classLibrary, state.classLibraryOrder]
      : kind === 'race'
        ? [state.raceLibrary, state.raceLibraryOrder]
        : [state.professionLibrary, state.professionLibraryOrder];
  return order.flatMap((id) => {
    const def: OriginDef | undefined = hasOwn(library, id) ? library[id] : undefined;
    return def ? [def] : [];
  });
}

/** Entries matching a query on name, description or skill names (case-insensitive). */
export function searchEntries(state: Libraries, kind: OriginKind, query: string): OriginDef[] {
  const q = query.trim().toLowerCase();
  return entriesOf(state, kind).filter((def) => {
    if (q === '') return true;
    const skills = 'skills' in def ? def.skills.map((s) => s.name) : [];
    return [def.name, def.description, ...skills].some((s) => s.toLowerCase().includes(q));
  });
}

/** One weight text per stat, in the rules' stat order (missing stats read 0). */
export function weightTexts(
  rules: Rules,
  weights: Readonly<Record<string, number>> | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const stat of rules.stats.list) {
    out[stat.id] = weights === null ? '1' : String(weights[stat.id] ?? 0);
  }
  return out;
}

export function emptyDraft(kind: OriginKind, rules: Rules): OriginDraft {
  const first = classRarities(rules)[0]?.id ?? '';
  return {
    name: '',
    description: '',
    skills:
      kind === 'class'
        ? Array.from({ length: rules.skills.startingClassSkillCount }, () => ({
            name: '',
            rarity: first,
          }))
        : [],
    weights: kind === 'class' ? weightTexts(rules, null) : {},
  };
}

export function draftOf(kind: OriginKind, def: OriginDef, rules: Rules): OriginDraft {
  return {
    name: def.name,
    description: def.description,
    skills: 'skills' in def ? def.skills.map((s) => ({ name: s.name, rarity: s.rarity })) : [],
    weights: kind === 'class' && 'weights' in def ? weightTexts(rules, def.weights) : {},
  };
}

/** Why the draft cannot be saved yet, or null. */
export function draftProblem(kind: OriginKind, draft: OriginDraft): string | null {
  if (draft.name.trim() === '') return 'Give it a name.';
  if (kind === 'class') {
    if (draft.skills.some((s) => s.name.trim() === '')) return 'Name every starting skill.';
    const values = Object.values(draft.weights).map((t) => t.trim());
    if (values.some((t) => !/^\d{1,4}$/.test(t) || Number(t) > 1000)) {
      return 'Weights are whole numbers from 0 to 1000.';
    }
    if (values.every((t) => Number(t) === 0)) return 'Give at least one stat a weight above 0.';
  }
  return null;
}

function fieldsOf(kind: OriginKind, draft: OriginDraft): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    name: draft.name.trim(),
    description: draft.description.trim(),
  };
  if (kind !== 'race') {
    fields['skills'] = draft.skills
      .map((s) => ({ name: s.name.trim(), rarity: s.rarity }))
      .filter((s) => kind === 'class' || s.name !== '');
  }
  if (kind === 'class') {
    const weights: Record<string, number> = {};
    for (const [stat, text] of Object.entries(draft.weights)) weights[stat] = Number(text.trim());
    fields['weights'] = weights;
  }
  return fields;
}

const ID_FIELD: Readonly<Record<OriginKind, string>> = {
  class: 'classDefId',
  race: 'raceDefId',
  profession: 'professionDefId',
};

/**
 * The command that saves a draft: a define for a new entry, or an edit with
 * only the fields changed since `editing` was loaded. Null when an edit
 * changes nothing or the draft has a problem.
 */
export function saveCommand(
  kind: OriginKind,
  draft: OriginDraft,
  editing: OriginDef | null,
  rules: Rules,
): ({ type: string } & Record<string, unknown>) | null {
  if (draftProblem(kind, draft) !== null) return null;
  const next = fieldsOf(kind, draft);
  if (editing === null) return { type: `${kind}Def.define`, ...next };
  const old = fieldsOf(kind, draftOf(kind, editing, rules));
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (JSON.stringify(next[key]) !== JSON.stringify(old[key])) changes[key] = next[key];
  }
  if (Object.keys(changes).length === 0) return null;
  return { type: `${kind}Def.edit`, [ID_FIELD[kind]]: editing.id, ...changes };
}

/** Like saveCommand, but also tells apart "no changes" from "a problem". */
export function unsavedChanges(
  kind: OriginKind,
  draft: OriginDraft,
  editing: OriginDef,
  rules: Rules,
): boolean {
  return (
    JSON.stringify(fieldsOf(kind, draft)) !==
    JSON.stringify(fieldsOf(kind, draftOf(kind, editing, rules)))
  );
}

/** How many default entries (DEFAULT_LIBRARY, skills included) the campaign still lacks. */
export function missingDefaults(state: DefaultTarget): number {
  const lacking = missingDefaultEntries(state);
  return (
    lacking.classes.length +
    lacking.races.length +
    lacking.professions.length +
    lacking.skills.length
  );
}

/** One line describing a class's weights, biggest first ("Agility 3 · Perception 3 · …"). */
export function weightSummary(rules: Rules, weights: Readonly<Record<string, number>>): string {
  return rules.stats.list
    .map((s, i) => ({ name: s.name, w: weights[s.id] ?? 0, i }))
    .filter((s) => s.w > 0)
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map((s) => `${s.name} ${s.w}`)
    .join(' · ');
}
