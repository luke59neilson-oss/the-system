/**
 * Trackers (M7.4, DESIGN §7–§8): the regions the party moves through and the
 * survivor factions they meet. Light bookkeeping for the GM; only the current
 * region's name and revealed factions' names and standings reach players. (The hunger tracker was retired by MT.3:
 * hunger is narrated, never tracked.)
 */

/** A region of the world (DESIGN §8: The Crown → … → The Drum). */
export interface Region {
  readonly id: string;
  readonly name: string;
  /** GM-only notes. */
  readonly notes: string;
  /** True once the party has been there (set when it becomes the current region). */
  readonly visited: boolean;
  readonly createdAt: string;
}

/**
 * A survivor faction (DESIGN §8: NPC survivors form factions). GM-only until
 * the GM reveals it (MT.8, Q69): then players see its name and standing only.
 */
export interface Faction {
  readonly id: string;
  readonly name: string;
  /** Where it is based, or null. */
  readonly regionId: string | null;
  /** How many survivors it counts, or null when unknown. */
  readonly members: number | null;
  /** How it stands toward the party, in the GM's words ("Wary", "Allied"). */
  readonly standing: string;
  readonly notes: string;
  readonly createdAt: string;
  /** MT.8: shown to players (name and standing). Absent in older states = hidden. */
  readonly revealed?: boolean;
}
