import { useEffect, useRef, useState } from 'react';

// MC.A review M1 (DESIGN §11 "a spend counter shows the session's API cost"):
// suggestions, prepare-ahead, practice drafts, notes and the summary all
// spend in the background, so the counter rereads the laptop's tally on a
// slow clock instead of only after a button. It polls only while a key is
// saved (no key, no spend), so consoles without the co-DM make no requests.

export interface Spend {
  calls: number;
  dollars: number;
}

/** How often the counter rereads the tally while a key is saved. */
export const SPEND_POLL_MS = 20_000;

const money = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

/** "This session: $0.013 · 2 calls" */
export function spendLine(spend: Spend): string {
  return `This session: ${money(spend.dollars)} · ${spend.calls} call${spend.calls === 1 ? '' : 's'}`;
}

/** Whether the counter should keep rereading: only with a key saved. */
export function shouldPollSpend(status: { hasKey: boolean } | null): boolean {
  return status?.hasKey === true;
}

/** What a poll uses: the browser's fetch and clock, swapped out in tests. */
export interface SpendPollDeps {
  fetch: (
    url: string,
    init: { headers: Record<string, string> },
  ) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
  setInterval: (tick: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
}

/**
 * Starts rereading the tally every SPEND_POLL_MS while `poll` is true (the
 * hook's effect, testable without a DOM; QF.35 (c)). Returns the stop
 * function, or nothing when there is nothing to poll.
 */
export function startSpendPoll(
  gmKey: string,
  poll: boolean,
  onSpend: (spend: Spend) => void,
  deps: SpendPollDeps,
): (() => void) | undefined {
  if (!poll) return;
  let cancelled = false;
  const tick = () => {
    deps
      .fetch('/api/gm/ai', { headers: { 'x-gm-key': gmKey } })
      .then((r) => (r.ok ? (r.json() as Promise<{ spend?: Spend }>) : null))
      .then((s) => {
        if (!cancelled && s?.spend) onSpend({ calls: s.spend.calls, dollars: s.spend.dollars });
      })
      .catch(() => {
        // The laptop is busy or closing; the next tick tries again.
      });
  };
  const timer = deps.setInterval(tick, SPEND_POLL_MS);
  return () => {
    cancelled = true;
    deps.clearInterval(timer);
  };
}

/** A reread remembers the seed it replaced, so a newer seed wins over it. */
export interface PolledSpend {
  readonly over: Spend | null;
  readonly spend: Spend;
}

/** The tally to show: the reread, unless a newer seed has come in since. */
export function shownSpend(polled: PolledSpend | null, seed: Spend | null): Spend | null {
  return polled !== null && polled.over === seed ? polled.spend : seed;
}

/**
 * The session's spend, reread every SPEND_POLL_MS while `poll` is true.
 * `seed` is the latest tally a caller already has (a settings reply, a
 * generation's reply); a newer reread replaces it.
 */
export function useLiveSpend(gmKey: string, poll: boolean, seed: Spend | null): Spend | null {
  const [polled, setPolled] = useState<PolledSpend | null>(null);
  const latest = useRef(seed);
  useEffect(() => {
    latest.current = seed;
  }, [seed]);
  useEffect(
    () =>
      startSpendPoll(gmKey, poll, (spend) => setPolled({ over: latest.current, spend }), {
        fetch: (url, init) => window.fetch(url, init),
        setInterval: (tick, ms) => window.setInterval(tick, ms),
        clearInterval: (id) => window.clearInterval(id),
      }),
    [gmKey, poll],
  );
  return shownSpend(polled, seed);
}
