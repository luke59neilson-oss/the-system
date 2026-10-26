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

/**
 * The session's spend, reread every SPEND_POLL_MS while `poll` is true.
 * `seed` is the latest tally a caller already has (a settings reply, a
 * generation's reply); a newer reread replaces it.
 */
export function useLiveSpend(gmKey: string, poll: boolean, seed: Spend | null): Spend | null {
  // A reread remembers the seed it replaced, so a newer seed wins over it.
  const [polled, setPolled] = useState<{ over: Spend | null; spend: Spend } | null>(null);
  const latest = useRef(seed);
  useEffect(() => {
    latest.current = seed;
  }, [seed]);
  useEffect(() => {
    if (!poll) return;
    let cancelled = false;
    const tick = () => {
      fetch('/api/gm/ai', { headers: { 'x-gm-key': gmKey } })
        .then((r) => (r.ok ? (r.json() as Promise<{ spend?: Spend }>) : null))
        .then((s) => {
          if (!cancelled && s?.spend) {
            setPolled({
              over: latest.current,
              spend: { calls: s.spend.calls, dollars: s.spend.dollars },
            });
          }
        })
        .catch(() => {
          // The laptop is busy or closing; the next tick tries again.
        });
    };
    const timer = window.setInterval(tick, SPEND_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [gmKey, poll]);
  return polled !== null && polled.over === seed ? polled.spend : seed;
}
