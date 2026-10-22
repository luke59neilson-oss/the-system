import type { PartyMember, PlayerRules } from '@the-system/engine';

/**
 * Party view helpers (ROADMAP M3.12, D5, D39). Pure. Party members carry
 * names, race/class/profession levels and pool bars as whole percents only;
 * nothing here may need another character's raw pools or stats.
 */

export interface PartyPoolRow {
  readonly id: string;
  readonly name: string;
  /** The abbreviation in brackets ("HP" for "Health Points (HP)"), else the name. */
  readonly shortName: string;
  readonly percent: number;
  /** "Full", "Empty" or "62%". */
  readonly label: string;
  /** At or under the low threshold (but not empty): drawn as a warning. */
  readonly low: boolean;
}

export interface PartyRow {
  readonly id: string;
  readonly name: string;
  readonly race: string;
  readonly className: string;
  readonly profession: string | null;
  readonly raceLevel: number;
  readonly classLevel: number;
  readonly professionLevel: number;
  readonly grade: string;
  /** The grade's metal token from the rules config (frame colour), or null. */
  readonly theme: string | null;
  readonly pools: readonly PartyPoolRow[];
  /** Portrait URL path, or null for the monogram (M4.4). */
  readonly portrait: string | null;
}

/** A bar at or below this percent reads as "low" (display only, not a rule). */
export const LOW_POOL_PERCENT = 25;

/** "Full" at 100, "Empty" at 0, else "62%". Out-of-range input is clamped. */
export function poolLabel(percent: number): string {
  const p = clampPercent(percent);
  if (p >= 100) return 'Full';
  if (p <= 0) return 'Empty';
  return `${p}%`;
}

/** "HP" for "Health Points (HP)"; names without a bracketed tail stay whole. */
export function shortPoolName(name: string): string {
  const m = /\(([^()]+)\)\s*$/.exec(name);
  const short = m?.[1]?.trim();
  return short ? short : name;
}

export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

/** Party rows in the projection's order (creation order), pools in the rules' order. */
export function partyRows(
  party: readonly PartyMember[],
  rules: Pick<PlayerRules, 'pools' | 'grades'>,
): PartyRow[] {
  return party.map((m) => ({
    id: m.id,
    name: m.name,
    race: m.race,
    className: m.className,
    profession: m.profession,
    raceLevel: m.raceLevel,
    classLevel: m.classLevel,
    professionLevel: m.professionLevel,
    grade: m.grade,
    theme: rules.grades.find((g) => g.id === m.grade)?.theme ?? null,
    portrait: m.portrait,
    pools: rules.pools.flatMap((rp) => {
      const bar = m.pools.find((b) => b.id === rp.id);
      if (!bar) return [];
      const percent = clampPercent(bar.percent);
      return [
        {
          id: rp.id,
          name: rp.name,
          shortName: shortPoolName(rp.name),
          percent,
          label: poolLabel(percent),
          low: percent > 0 && percent <= LOW_POOL_PERCENT,
        },
      ];
    }),
  }));
}
