// ME.4 (DESIGN §4 "Reference while building"): the books' evolution options
// (`docs/reference/primal-hunter/evolutions.csv`, embedded by `npm run
// reference`) as rows of the Evolutions tab's reference table. GM-only.
import type { ShapeReferenceRow, ShapeTrack } from '@the-system/engine';
import { csvRecords } from './csv';
import { REFERENCE_CSV } from './lists.generated';

/** The CSV's stat columns → the default rules' stat ids. */
export const EVOLUTION_STAT_COLUMNS: Readonly<Record<string, string>> = {
  str: 'strength',
  agi: 'agility',
  end: 'endurance',
  vit: 'vitality',
  tough: 'toughness',
  wis: 'wisdom',
  int: 'intelligence',
  per: 'perception',
  will: 'willpower',
};

const TRACKS = new Set<string>(['class', 'profession', 'race']);
const whole = (v: string | undefined) => {
  const n = Number(v ?? '');
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/** Rows with a name, a known track and at least one point, in file order. */
export function parseEvolutionReference(csv: string): ShapeReferenceRow[] {
  return csvRecords(csv).flatMap((r, i) => {
    const track = r['track'] ?? '';
    if ((r['name'] ?? '') === '' || !TRACKS.has(track)) return [];
    const stats: Record<string, number> = {};
    for (const [column, id] of Object.entries(EVOLUTION_STAT_COLUMNS)) {
      const v = whole(r[column]);
      if (v > 0) stats[id] = v;
    }
    const free = whole(r['free']);
    const total = Object.values(stats).reduce((a, b) => a + b, 0) + free;
    if (total === 0) return [];
    const note = [r['book_grade'], r['stage'], r['chosen_by']]
      .filter((x) => (x ?? '') !== '')
      .join(' · ');
    return [
      {
        id: `books-${i + 1}`,
        source: 'books' as const,
        track: track as ShapeTrack,
        name: r['name']!,
        note,
        stats,
        free,
        total,
      },
    ];
  });
}

let cache: readonly ShapeReferenceRow[] | null = null;

export function evolutionReference(): readonly ShapeReferenceRow[] {
  cache ??= parseEvolutionReference(REFERENCE_CSV.evolutions);
  return cache;
}
