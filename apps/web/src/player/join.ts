/**
 * Join screen helpers (ROADMAP M3.1): the public character list, the
 * remembered character, and the portrait monogram.
 */

/** One entry of `GET /api/characters` (public: no stats, no GM data). */
export interface JoinEntry {
  id: string;
  name: string;
  grade: string;
  /** Grade metal theme token from the rules config (null if unknown). */
  theme: string | null;
  /** Portrait image URL, once characters carry one (M4.4). */
  portrait?: string | null;
}

export const REMEMBER_KEY = 'the-system:last-character';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** localStorage, or null where the browser blocks it (private mode, previews). */
export function browserStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The character id this browser last played, or null. Never throws. */
export function readRemembered(storage: KeyValueStore | null): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(REMEMBER_KEY);
    return value && value.length <= 200 ? value : null;
  } catch {
    return null;
  }
}

/** Remembers the character this browser plays. Never throws. */
export function remember(storage: KeyValueStore | null, characterId: string): void {
  if (!storage) return;
  try {
    storage.setItem(REMEMBER_KEY, characterId);
  } catch {
    // Storage full or blocked: the join screen just won't offer "Continue".
  }
}

/** The remembered entry when it is still in this campaign's list. */
export function rememberedEntry(
  list: readonly JoinEntry[],
  rememberedId: string | null,
): JoinEntry | null {
  if (rememberedId === null) return null;
  return list.find((c) => c.id === rememberedId) ?? null;
}

/** Up to two initials for the portrait placeholder ("Jake Thayne" → "JT"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const first = words[0];
  if (!first) return '?';
  const letter = (w: string) => Array.from(w)[0]?.toLocaleUpperCase() ?? '';
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return letter(first) + (last ? letter(last) : '');
}

/**
 * Validates the untyped JSON from `/api/characters`; drops malformed rows.
 * Portraits must be same-origin paths (never `//host` or another origin).
 */
export function parseJoinList(json: unknown): JoinEntry[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((row: unknown) => {
    if (typeof row !== 'object' || row === null) return [];
    const r = row as Record<string, unknown>;
    if (typeof r['id'] !== 'string' || typeof r['name'] !== 'string') return [];
    if (typeof r['grade'] !== 'string') return [];
    const portrait = r['portrait'];
    return [
      {
        id: r['id'],
        name: r['name'],
        grade: r['grade'],
        theme: typeof r['theme'] === 'string' ? r['theme'] : null,
        ...(typeof portrait === 'string' && /^\/(?![/\\])/u.test(portrait) ? { portrait } : {}),
      },
    ];
  });
}
