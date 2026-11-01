import {
  entryBudget,
  entryPoints,
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
  /** ML.2: whole points per stat id for one level, as typed (blank = 0). */
  points: Record<string, string>;
  /** ML.2: free points per level, as typed (blank = 0). */
  free: string;
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
    points: pointTexts(rules, null),
    free: '',
  };
}

/** ML.2: one points text per stat, blank where the entry gives none. */
export function pointTexts(
  rules: Rules,
  stats: Readonly<Record<string, number>> | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const stat of rules.stats.list) {
    const n = stats?.[stat.id] ?? 0;
    out[stat.id] = n > 0 ? String(n) : '';
  }
  return out;
}

/**
 * ML.2: what the entry's points read on the form: its own points, a class's
 * weights converted to points at the first grade's class budget, or blank.
 */
function storedPoints(kind: OriginKind, def: OriginDef, rules: Rules) {
  const grade = rules.grades[0]?.id ?? '';
  const weights = kind === 'class' && 'weights' in def ? def.weights : undefined;
  return entryPoints(rules, grade, {
    ...(def.points ? { points: def.points } : {}),
    ...(weights ? { weights } : {}),
  });
}

export function draftOf(kind: OriginKind, def: OriginDef, rules: Rules): OriginDraft {
  return {
    name: def.name,
    description: def.description,
    skills: 'skills' in def ? def.skills.map((s) => ({ name: s.name, rarity: s.rarity })) : [],
    weights: kind === 'class' && 'weights' in def ? weightTexts(rules, def.weights) : {},
    ...(() => {
      const shown = storedPoints(kind, def, rules);
      return {
        points: pointTexts(rules, shown?.points.stats ?? null),
        free: shown && shown.points.free > 0 ? String(shown.points.free) : '',
      };
    })(),
  };
}

const POINTS_TEXT = /^\d{0,3}$/;

/** ML.2: the draft's points per level, or null while a box is not a whole number 0–999. */
export function draftPoints(
  draft: Pick<OriginDraft, 'points' | 'free'>,
): { stats: Record<string, number>; free: number } | null {
  const texts = [...Object.values(draft.points), draft.free].map((t) => t.trim());
  if (texts.some((t) => !POINTS_TEXT.test(t))) return null;
  const stats: Record<string, number> = {};
  for (const [id, t] of Object.entries(draft.points)) {
    const n = Number(t.trim() || '0');
    if (n > 0) stats[id] = n;
  }
  return { stats, free: Number(draft.free.trim() || '0') };
}

/**
 * ML.2 (DESIGN §2, Q93): the budget reminder for an entry at the first grade
 * (G: class 8, race 5, profession 5) and a warning while the total differs.
 */
export function pointsCheck(
  kind: OriginKind,
  draft: Pick<OriginDraft, 'points' | 'free'>,
  rules: Rules,
): { grade: string; budget: number | null; total: number | null; warning: string | null } {
  const grade = rules.grades[0]?.id ?? '';
  const budget = entryBudget(rules, grade, kind);
  const points = draftPoints(draft);
  const total =
    points === null ? null : Object.values(points.stats).reduce((a, b) => a + b, 0) + points.free;
  let warning: string | null = null;
  if (budget !== null && total !== null && total !== budget) {
    warning =
      total === 0
        ? `No points set: ${defaultNote(kind)}`
        : `These total ${total}; the ${grade}-grade budget for a ${kind} level is ${budget}. Each level is scaled to the budget until they match.`;
  }
  return { grade, budget, total, warning };
}

function defaultNote(kind: OriginKind): string {
  return kind === 'race'
    ? 'each race level gives all free points (Human).'
    : kind === 'profession'
      ? 'each profession level follows the class’s shape.'
      : 'each class level follows the stat weights below.';
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
  if (draftPoints(draft) === null) return 'Points per level are whole numbers from 0 to 999.';
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
  // ML.2: points only once any are set, so an entry without stays without.
  const points = draftPoints(draft);
  if (points && (points.free > 0 || Object.keys(points.stats).length > 0))
    fields['points'] = points;
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
  // ML.2 review: blanking every point box clears stored points (the engine
  // drops an all-zero edit), so the entry follows its default again.
  if (!('points' in next) && editing.points) changes['points'] = { stats: {}, free: 0 };
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
/**
 * ML.2 review: whether the class's weights are set aside by points per level
 * (the entry has its own, or the draft lays out new ones). An old class's
 * weights shown as converted points still use the weights.
 */
export function weightsSetAside(
  draft: OriginDraft,
  editing: OriginDef | null,
  rules: Rules,
): boolean {
  const points = draftPoints(draft);
  if (points === null || points.free + Object.values(points.stats).reduce((a, b) => a + b, 0) === 0)
    return false;
  if (editing === null || editing.points) return true;
  const loaded = draftPoints(draftOf('class', editing, rules));
  return JSON.stringify(loaded) !== JSON.stringify(points);
}

/** ML.2 review: an entry's own points per level, for its library card ("" when none). */
export function pointsSummary(
  rules: Rules,
  points: { readonly stats: Readonly<Record<string, number>>; readonly free: number } | undefined,
): string {
  if (!points) return '';
  const parts = rules.stats.list
    .map((s, i) => ({ name: s.name, n: points.stats[s.id] ?? 0, i }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((s) => `${s.name} +${s.n}`);
  if (points.free > 0) parts.push(`+${points.free} free`);
  return parts.length === 0 ? '' : `Per level: ${parts.join(' · ')}`;
}

export function weightSummary(rules: Rules, weights: Readonly<Record<string, number>>): string {
  return rules.stats.list
    .map((s, i) => ({ name: s.name, w: weights[s.id] ?? 0, i }))
    .filter((s) => s.w > 0)
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map((s) => `${s.name} ${s.w}`)
    .join(' · ');
}
