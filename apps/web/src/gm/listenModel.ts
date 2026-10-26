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
