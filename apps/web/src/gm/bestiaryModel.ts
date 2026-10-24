import {
  identifyInRange,
  rankProblem,
  type CampaignState,
  type Command,
  type Entity,
} from '@the-system/engine';

/**
 * GM bestiary and NPC form model (ROADMAP M7.2, DESIGN §7 "Identify", D84,
 * D123, D181): an entity's GM name, player-facing label, grade and level
 * (the Identify range), stats, Identify tiers and notes. Stats and notes are
 * GM-only; players see only the label and the tier their Identify unlocks.
 */
export interface EntityDraft {
  name: string;
  /** Blank = same as the name. */
  label: string;
  /** Grade id, or '' for none (a place, an energy: always in range). */
  grade: string;
  level: string;
  /** Stat id → whole value as typed; blank = not given. */
  stats: Record<string, string>;
  /** Rarity id → tier text; blank = no tier at that rarity. */
  tiers: Record<string, string>;
  notes: string;
}

export const emptyEntityDraft = (): EntityDraft => ({
  name: '',
  label: '',
  grade: '',
  level: '',
  stats: {},
  tiers: {},
  notes: '',
});

export function entityDraftOf(e: Entity): EntityDraft {
  return {
    name: e.name,
    label: e.label === e.name ? '' : e.label,
    grade: e.grade ?? '',
    level: e.level === null ? '' : String(e.level),
    stats: Object.fromEntries(Object.entries(e.stats ?? {}).map(([k, v]) => [k, String(v)])),
    tiers: Object.fromEntries(e.tiers.map((t) => [t.minRarity, t.text])),
    notes: e.notes,
  };
}

const clean = (s: string) => s.trim().replace(/\s+/gu, ' ');

interface Parsed {
  name: string;
  label: string;
  grade: string | null;
  level: number | null;
  stats: Record<string, number> | null;
  tiers: { minRarity: string; text: string }[];
  notes: string;
}

/** The draft's values checked against the rules, or an error message. */
export function parseEntityDraft(state: CampaignState, draft: EntityDraft): Parsed | string {
  const name = clean(draft.name);
  if (name === '') return 'Give it a name';
  const label = clean(draft.label) || name;
  const lv = draft.level.trim();
  if (lv !== '' && !/^\d+$/u.test(lv)) return 'Level must be a whole number';
  const grade = draft.grade === '' ? null : draft.grade;
  const level = lv === '' ? null : Number(lv);
  const rank = rankProblem(state.rules, grade, level);
  if (rank) return rank.charAt(0).toUpperCase() + rank.slice(1);
  const stats: Record<string, number> = {};
  for (const s of state.rules.stats.list) {
    const v = (draft.stats[s.id] ?? '').trim();
    if (v === '') continue;
    if (!/^\d+$/u.test(v)) return `${s.name} must be a whole number`;
    stats[s.id] = Number(v);
  }
  const tiers = state.rules.skills.rarities
    .map((r) => ({ minRarity: r.id, text: (draft.tiers[r.id] ?? '').trim() }))
    .filter((t) => t.text !== '');
  if (tiers.length === 0) return 'Write at least one Identify tier';
  return {
    name,
    label,
    grade,
    level,
    stats: Object.keys(stats).length === 0 ? null : stats,
    tiers,
    notes: draft.notes.trim(),
  };
}

export function entityDefineCommand(state: CampaignState, draft: EntityDraft): Command | string {
  const p = parseEntityDraft(state, draft);
  if (typeof p === 'string') return p;
  return {
    type: 'entity.define',
    name: p.name,
    label: p.label,
    tiers: p.tiers,
    grade: p.grade,
    level: p.level,
    stats: p.stats,
    ...(p.notes === '' ? {} : { notes: p.notes }),
  };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The entity.edit command with only what changed, null when nothing did, or an error. */
export function entityEditCommand(
  state: CampaignState,
  entity: Entity,
  draft: EntityDraft,
): Command | string | null {
  const p = parseEntityDraft(state, draft);
  if (typeof p === 'string') return p;
  const change: Record<string, unknown> = {};
  if (p.name !== entity.name) change['name'] = p.name;
  if (p.label !== entity.label) change['label'] = p.label;
  if (p.grade !== entity.grade || p.level !== entity.level) {
    change['grade'] = p.grade;
    change['level'] = p.level;
  }
  if (!sameJson(p.stats, entity.stats)) change['stats'] = p.stats;
  if (!sameJson(p.tiers, entity.tiers)) change['tiers'] = p.tiers;
  if (p.notes !== entity.notes.trim()) change['notes'] = p.notes;
  if (Object.keys(change).length === 0) return null;
  return { type: 'entity.edit', entityId: entity.id, ...change } as Command;
}

/**
 * D181: names of characters who know (or, before anyone knows it, could be
 * shown) this entity but cannot Identify it, when its label gives away what
 * it is: the label is the GM name or contains it, or shows a grade or level.
 * Out-of-range players still see the label (D123, Q48).
 */
export function labelLeaks(
  state: CampaignState,
  draft: Pick<EntityDraft, 'name' | 'label' | 'grade' | 'level'>,
  knownBy: readonly string[],
): string[] {
  const name = clean(draft.name).toLowerCase();
  const label = (clean(draft.label) || clean(draft.name)).toLowerCase();
  if (name === '' || draft.grade === '' || !/^\d+$/u.test(draft.level.trim())) return [];
  const raw = clean(draft.label) || clean(draft.name);
  // Grade letters are capitals ("(F)", "F-grade"), so "Wolf(s)" is no hint.
  const gradeHint =
    /\(\s*[A-Z]\s*\)|\b[A-Z]-grade\b/u.test(raw) || /\b(lvl|level)\b\s*\d/iu.test(raw);
  if (!label.includes(name) && !gradeHint) return [];
  const rank = { grade: draft.grade, level: Number(draft.level.trim()) };
  const who = knownBy.length > 0 ? knownBy : state.characterOrder;
  return who
    .map((id) => state.characters[id])
    .filter((c) => c !== undefined && !identifyInRange(state.rules, c, rank))
    .map((c) => c?.name ?? '');
}

/**
 * QF.20: the GM's line after a reveal. A character the entity is out of
 * Identify range for learns of it but sees `[??? – lvl ???]`, so the line
 * says so instead of "can now Identify" (DESIGN §7, D123).
 */
export function revealOutcome(
  state: CampaignState,
  entity: Pick<Entity, 'grade' | 'level' | 'label'>,
  characterIds: readonly string[],
): string {
  const chars = characterIds.map((id) => state.characters[id]).filter((c) => c !== undefined);
  const inRange = chars.filter((c) => identifyInRange(state.rules, c, entity)).map((c) => c.name);
  const outOfRange = chars
    .filter((c) => !identifyInRange(state.rules, c, entity))
    .map((c) => c.name);
  const parts: string[] = [];
  if (inRange.length > 0) parts.push(`${inRange.join(', ')} can now Identify ${entity.label}`);
  if (outOfRange.length > 0) {
    parts.push(
      `${outOfRange.join(', ')} now ${outOfRange.length === 1 ? 'knows' : 'know'} of ${entity.label} but ${outOfRange.length === 1 ? 'is' : 'are'} out of Identify range (sees [??? – lvl ???])`,
    );
  }
  return parts.join('; ');
}
