import { describe, it } from 'vitest';

/**
 * MT.3 (DESIGN §7 "No hunger tracker", Q68): hunger is narrated, never
 * tracked. Work in progress (run 35fed412): acceptance tests to write first.
 * Planned shape:
 * - State schema v33: `CampaignState.hunger` removed (reducer.ts:190, :842);
 *   a v32 snapshot replays from the log (snapshot loader refuses old versions).
 * - Events `hunger.configured` / `hunger.levelsSet` stay in the envelope
 *   (stored logs must parse) but reduce as no-ops; no command emits them
 *   (remove `hunger.configure` / `hunger.setLevels` commands from commands.ts).
 * - Rules: `rules.hunger` dropped from defaults and schema (schema.ts:224,
 *   :342) with a rules upcaster that strips it from stored configs.
 * - Content format: `hunger` (format.ts:293, :321) no longer accepted, or
 *   accepted and ignored with a preview warning; tutorial pack cleaned.
 * - Projection: `hunger` field and PlayerView hunger removed (player.ts).
 * - Web: remove gm/Trackers.tsx hunger UI, trackersModel.ts, the player's
 *   hunger row (PlayerScreen.tsx), ContentImport hunger preview.
 * - Goldens: every log with hunger events or `rules.hunger` keeps its .jsonl;
 *   re-record all .state.json under the v33 bump (`npm run golden:record`).
 * - e2e: M7.4 spec loses its hunger part; full e2e green.
 */
describe('no hunger tracker (MT.3)', () => {
  it.todo('stored hunger events replay as no-ops');
  it.todo('no command records a hunger event');
  it.todo('stored rules with a hunger block load without it');
  it.todo('the player projection carries no hunger');
  it.todo('content with a hunger block imports without tracking it');
});
