/** MC.5 (D236): the downloadable speech model, as the server reports it. */
export type ModelStatus =
  | { state: 'missing'; bytes: number }
  | { state: 'downloading'; received: number; bytes: number }
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'failed'; error: string; bytes: number; loadFailed?: boolean };

/**
 * QF.31: the Listening panel polls the laptop only while something it shows
 * can change on its own: the mic is on (new transcript lines; the laptop may
 * stop), or the speech model is downloading or loading. Idle, it reads once
 * when it opens, so an idle GM console sends no request every 2 s (one in
 * flight as the laptop shuts down was logged as a 503).
 */
export const listenPollNeeded = (on: boolean, model: ModelStatus | null): boolean =>
  on || model?.state === 'downloading' || model?.state === 'loading';

/** MC.6: how long the Voices section records for one sample (the server takes 3–15 s). */
export const ENROL_SECONDS = 5;

export interface VoiceEnrolment {
  readonly characterId: string;
  readonly name: string;
  readonly enrolledAt: string;
}

export interface VoiceRow {
  readonly characterId: string;
  readonly name: string;
  readonly enrolledAt: string | null;
}

/**
 * MC.6: one row per character in party order, with its enrolment if any;
 * an enrolment whose character is gone is still listed (so it can be deleted).
 */
export function voiceRows(
  characters: readonly { id: string; name: string }[],
  enrolments: readonly VoiceEnrolment[],
): VoiceRow[] {
  const byId = new Map(enrolments.map((e) => [e.characterId, e]));
  const rows: VoiceRow[] = characters.map((c) => ({
    characterId: c.id,
    name: c.name,
    enrolledAt: byId.get(c.id)?.enrolledAt ?? null,
  }));
  const known = new Set(characters.map((c) => c.id));
  for (const e of enrolments) {
    if (!known.has(e.characterId)) rows.push({ ...e });
  }
  return rows;
}

/** Joins ~1 s blocks into one sample of exactly `samples` length (extra audio dropped). */
export function joinBlocks(blocks: readonly Float32Array[], samples: number): Float32Array {
  const out = new Float32Array(samples);
  let at = 0;
  for (const b of blocks) {
    if (at >= samples) break;
    const n = Math.min(b.length, samples - at);
    out.set(b.subarray(0, n), at);
    at += n;
  }
  return at === samples ? out : out.subarray(0, at);
}
