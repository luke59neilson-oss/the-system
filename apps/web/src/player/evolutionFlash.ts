import { useEffect, useState } from 'react';

/** How long the evolution re-theme plays (ms); matches `evolve-*` in themes.css. */
export const EVOLUTION_FLASH_MS = 2400;

/**
 * True when the character moved to a higher grade (an evolution), by the
 * order of the rules config's grades. Undoing an evolution, an unknown grade
 * or the first value seen never plays it.
 */
export function isEvolution(
  grades: readonly { id: string }[],
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (from === undefined || to === undefined || from === to) return false;
  const a = grades.findIndex((g) => g.id === from);
  const b = grades.findIndex((g) => g.id === to);
  return a >= 0 && b > a;
}

/**
 * M8.2: counts evolutions seen since this screen opened and reports whether
 * the re-theme is playing now (the grid is never remounted, so open panels
 * and drafts survive it).
 */
export function useEvolutionFlash(
  grades: readonly { id: string }[],
  grade: string | undefined,
): { playing: boolean; count: number } {
  const [seen, setSeen] = useState(grade);
  const [count, setCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  if (grade !== seen) {
    setSeen(grade);
    if (isEvolution(grades, seen, grade)) {
      setCount(count + 1);
      setPlaying(true);
    }
  }
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setPlaying(false), EVOLUTION_FLASH_MS);
    return () => clearTimeout(t);
  }, [playing, count]);
  return { playing, count };
}
