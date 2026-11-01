// ME.4 (DESIGN §4 "Reference while building"): the campaign's own earlier
// evolution options, for the Evolutions tab's reference table. GM-only: the
// server serves them on a GM route; nothing here goes to players.
import type { Campaign } from '../events/log';

export type ShapeTrack = 'class' | 'profession' | 'race';

/** One row of the Evolutions tab's reference table (books or campaign). */
export interface ShapeReferenceRow {
  readonly id: string;
  readonly source: 'books' | 'campaign';
  readonly track: ShapeTrack;
  readonly name: string;
  /** Where it comes from, in a few words (book grade and stage, or who and when). */
  readonly note: string;
  /** Whole points per stat id per level (zeros left out). */
  readonly stats: Readonly<Record<string, number>>;
  readonly free: number;
  /** Stats plus free points. */
  readonly total: number;
}

const TRACKS: readonly ShapeTrack[] = ['class', 'profession', 'race'];

/**
 * Every option of every three-step evolution release in the log that has
 * not been undone, oldest first; a release replaced by a later one still
 * counts (it was built). Options with no points are left out (nothing to
 * scale). Each row names the character as they are now and the release date.
 */
export function campaignEvolutionOptions(campaign: Campaign): ShapeReferenceRow[] {
  const names = campaign.state?.characters ?? {};
  const rows: ShapeReferenceRow[] = [];
  for (const event of campaign.events) {
    if (event.type !== 'evolution.released' || campaign.undone[event.id] !== undefined) continue;
    const steps = event.payload.steps;
    if (steps === undefined) continue;
    const who = names[event.payload.characterId]?.name ?? event.payload.characterId;
    for (const track of TRACKS) {
      for (const o of steps[track]) {
        const stats = Object.fromEntries(
          Object.entries(o.distribution.stats).filter(([, v]) => v > 0),
        );
        const total = Object.values(stats).reduce((a, b) => a + b, 0) + o.distribution.free;
        if (total <= 0) continue;
        rows.push({
          id: `campaign-${event.id}-${track}-${o.id}`,
          source: 'campaign',
          track,
          name: o.name,
          note: `${who}, ${event.timestamp.slice(0, 10)}`,
          stats,
          free: o.distribution.free,
          total,
        });
      }
    }
  }
  return rows;
}
