import { type Character } from '../character';
import type { RulesConfig } from '../rules';

/**
 * Practice log and notes (ROADMAP M1.8, DESIGN §6–7). Pure helpers over the
 * entries and notes kept in campaign state.
 */

export type PracticeSource = 'gm' | 'player' | 'montage';

/** One logged use: what a character did and which skills/stat it exercised. */
export interface PracticeEntry {
  /** Id of the `practice.logged` event. */
  readonly id: string;
  readonly at: string;
  /** Play session it happened in (repeats are judged per session). */
  readonly sessionId: string | null;
  readonly characterId: string;
  readonly action: string;
  /** Names of the character's skills used, in order; two or more = used together. */
  readonly skills: readonly string[];
  /** Stat id exercised, if any. */
  readonly stat: string | null;
  readonly tags: readonly string[];
  readonly source: PracticeSource;
}

export type NoteKind = 'journal' | 'party' | 'gm';

/**
 * A note. `journal`: a player's private journal entry, readable by the GM
 * only when `shareable`. `party`: shared by the whole party and the GM.
 * `gm`: the GM's private notes, never sent to players.
 */
export interface Note {
  readonly id: string;
  readonly kind: NoteKind;
  /** Author character; null = the GM. Journal notes always have one. */
  readonly author: string | null;
  readonly title: string;
  /** Markdown. */
  readonly body: string;
  /** Free tags linking the note to characters, NPCs, regions, quests ("npc:Casper"). */
  readonly tags: readonly string[];
  /** Journal only: the GM (and session reports) may read it. Always true for party, false for gm. */
  readonly shareable: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Normalized action text for repeat detection: case, spacing and trailing punctuation ignored. */
export const normalizeAction = (action: string): string =>
  action
    .toLowerCase()
    .replace(/[\s]+/g, ' ')
    .replace(/[.!?,;:\s]+$/u, '')
    .trim();

const pairKey = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

/** Identity of a use for repeat detection; null outside a play session (never a repeat). */
const useKey = (e: PracticeEntry): string | null =>
  e.sessionId === null
    ? null
    : JSON.stringify([
        e.characterId,
        e.sessionId,
        normalizeAction(e.action),
        e.stat,
        [...e.skills].sort(),
      ]);

/**
 * Ids of entries that repeat an earlier entry: same character, same session,
 * same action (normalized) and the same skills and stat (DESIGN §7
 * "repeats flagged"). The first of a run is not a repeat. Entries logged
 * outside a session are never repeats. One pass.
 */
export function repeatedEntryIds(entries: readonly PracticeEntry[]): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = useKey(entry);
    if (key === null) continue;
    if (seen.has(key)) out.add(entry.id);
    else seen.add(key);
  }
  return out;
}

/** Host-independent string order (UTF-16 code units), unlike locale-dependent localeCompare. */
const codeUnitCompare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface SkillPairCount {
  /** The two skill names, sorted. */
  readonly skills: readonly [string, string];
  readonly count: number;
}

/**
 * How often each pair of a character's skills was logged working together
 * (DESIGN §6 merges). Repeats do not count; an entry with three skills
 * counts each of its three pairs once. Sorted by count, then names.
 */
export function skillPairCounts(
  entries: readonly PracticeEntry[],
  characterId: string,
): SkillPairCount[] {
  const repeats = repeatedEntryIds(entries);
  const counts = new Map<string, SkillPairCount>();
  for (const entry of entries) {
    if (entry.characterId !== characterId || repeats.has(entry.id)) continue;
    const skills = [...new Set(entry.skills)];
    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        const pair = pairKey(skills[i] as string, skills[j] as string);
        const key = pair.join('\u0000');
        counts.set(key, { skills: pair, count: (counts.get(key)?.count ?? 0) + 1 });
      }
    }
  }
  return [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      codeUnitCompare(a.skills[0], b.skills[0]) ||
      codeUnitCompare(a.skills[1], b.skills[1]),
  );
}

/**
 * The next class level that grants a skill selection (DESIGN §3): multiples
 * of each grade's selection interval inside that grade's level range, up to
 * the campaign cap. null when none remains.
 */
export function nextSelectionLevel(rules: RulesConfig, classLevel: number): number | null {
  let bottom = 0;
  for (const grade of rules.grades) {
    const top = Math.min(grade.topLevel, rules.campaign.levelCap);
    const interval = grade.selectionInterval;
    if (interval !== null) {
      const from = Math.max(bottom, classLevel + 1);
      const first = Math.ceil(from / interval) * interval;
      if (first <= top) return first;
    }
    bottom = grade.topLevel + 1;
  }
  return null;
}

export type PracticeAlert =
  | {
      readonly kind: 'selection';
      readonly characterId: string;
      /** Class level the selection arrives at. */
      readonly level: number;
      readonly levelsAway: number;
    }
  | {
      readonly kind: 'merge';
      readonly characterId: string;
      readonly skills: readonly [string, string];
      readonly count: number;
      /** Both skills currently meet the merge minimum rarity (M1.9 checks the rest). */
      readonly rarityOk: boolean;
    };

/**
 * GM prep alerts for one character (DESIGN §7): a selection within
 * `practice.selectionAlertWithinLevels` class levels, and every pair of the
 * character's current skills logged together at least
 * `skills.merge.requiredJointUses` times.
 */
export function practiceAlerts(
  rules: RulesConfig,
  character: Character,
  entries: readonly PracticeEntry[],
): PracticeAlert[] {
  const alerts: PracticeAlert[] = [];
  const next = nextSelectionLevel(rules, character.classLevel);
  if (next !== null) {
    const away = next - character.classLevel;
    if (away <= rules.practice.selectionAlertWithinLevels) {
      alerts.push({ kind: 'selection', characterId: character.id, level: next, levelsAway: away });
    }
  }
  const ladder = rules.skills.rarities.map((r) => r.id);
  const min = ladder.indexOf(rules.skills.merge.minRarity);
  const rarityOf = new Map(character.skills.map((s) => [s.name, s.rarity]));
  for (const pair of skillPairCounts(entries, character.id)) {
    if (pair.count < rules.skills.merge.requiredJointUses) continue;
    const [a, b] = pair.skills;
    const ra = rarityOf.get(a);
    const rb = rarityOf.get(b);
    if (ra === undefined || rb === undefined) continue; // a skill is gone (merged, transformed)
    alerts.push({
      kind: 'merge',
      characterId: character.id,
      skills: pair.skills,
      count: pair.count,
      rarityOk: ladder.indexOf(ra) >= min && ladder.indexOf(rb) >= min,
    });
  }
  return alerts;
}

export interface NoteQuery {
  /** Words that must all appear in the title, body or tags (case-insensitive). */
  readonly text?: string;
  /** Tags that must all be present (case-insensitive). */
  readonly tags?: readonly string[];
  readonly kinds?: readonly NoteKind[];
}

/** Filters notes (already limited to what the viewer may read), newest update first. */
export function searchNotes(notes: readonly Note[], query: NoteQuery): Note[] {
  const words = (query.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const tags = (query.tags ?? []).map((t) => t.toLowerCase());
  return notes
    .filter((note) => {
      if (query.kinds && !query.kinds.includes(note.kind)) return false;
      const own = note.tags.map((t) => t.toLowerCase());
      if (!tags.every((t) => own.includes(t))) return false;
      const hay = `${note.title}\n${note.body}\n${own.join(' ')}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => codeUnitCompare(b.updatedAt, a.updatedAt) || codeUnitCompare(a.id, b.id));
}

/** May this reader see the note? Reader: a character id, or null for the GM. */
export function canReadNote(note: Note, reader: string | null): boolean {
  switch (note.kind) {
    case 'journal':
      return reader === null ? note.shareable : note.author === reader;
    case 'party':
      return true;
    case 'gm':
      return reader === null;
  }
}
