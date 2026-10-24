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
 * M8.2: whether the evolution re-theme is playing now. It starts when this
 * character's grade rises while the screen is open (a reconnect that lands on
 * a higher grade counts too: the player did evolve). Switching to another
 * character never plays it. The grid is never remounted, so open panels and
 * drafts survive.
 */
export function useEvolutionFlash(
  characterId: string,
  grades: readonly { id: string }[],
  grade: string | undefined,
): boolean {
  const [seen, setSeen] = useState({ characterId, grade });
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(0);
  if (characterId !== seen.characterId) {
    setSeen({ characterId, grade });
    setPlaying(false);
  } else if (grade !== seen.grade) {
    setSeen({ characterId, grade });
    if (isEvolution(grades, seen.grade, grade)) {
      setPlaying(true);
      setStarted(started + 1);
    }
  }
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setPlaying(false), EVOLUTION_FLASH_MS);
    return () => clearTimeout(t);
  }, [playing, started]);
  return playing;
}
