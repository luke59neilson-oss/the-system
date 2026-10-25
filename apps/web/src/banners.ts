import { useEffect, useState } from 'react';

/** A broadcast as both screens see it (MT.6). */
export interface BannerSource {
  readonly id: string;
  readonly at: string;
  readonly text: string;
  readonly display?:
    { readonly mode: 'pinned' } | { readonly mode: 'timed'; readonly seconds: number } | undefined;
  readonly removed?: true | undefined;
}

/**
 * Banners up at `now` (ms), oldest first (MT.6, DESIGN §7 Broadcasts): a
 * pinned one until the GM removes it; a timed one for its seconds from
 * `startOf(id)`, which is when this screen first saw it if it arrived live,
 * else its send time (so a phone with a skewed clock still shows a fresh one
 * for its full time).
 */
export function activeBanners<T extends BannerSource>(
  messages: readonly T[],
  now: number,
  startOf: (m: T) => number,
): T[] {
  return messages.filter((m) => {
    if (!m.display || m.removed) return false;
    if (m.display.mode === 'pinned') return true;
    return now < startOf(m) + m.display.seconds * 1000;
  });
}

/** Re-renders every second while `on`, so timed banners come down on time. */
export function useTick(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}
