import { useState } from 'react';
import type { PlayerMessage } from '@the-system/engine';
import { activeBanners, useTick } from '../banners';

/**
 * MT.6 (DESIGN §7 Broadcasts): System broadcasts the GM sent as banners, at
 * the top of the player's screen, for a set time or until the GM removes them.
 */
export function BroadcastBanners({ messages }: { messages: readonly PlayerMessage[] }) {
  const [mounted] = useState(() => Date.now());
  // Messages already there when the page opened time from when they were sent;
  // a live arrival times from when this screen first saw it.
  const [initial] = useState(() => new Set(messages.map((m) => m.id)));
  const [arrivals, setArrivals] = useState<ReadonlyMap<string, number>>(() => new Map());
  // Ticks every second, so `now` is at most a second old when a banner lands.
  const now = useTick(true);
  const fresh = messages.filter((m) => !initial.has(m.id) && !arrivals.has(m.id));
  if (fresh.length > 0) {
    // Recorded during render (React's "adjust state on prop change"), once per id.
    setArrivals(new Map([...arrivals, ...fresh.map((m) => [m.id, now] as const)]));
  }
  const up = activeBanners(messages, now, (m) => {
    const arrived = arrivals.get(m.id);
    if (arrived !== undefined) return arrived;
    if (!initial.has(m.id)) return now;
    const sent = Date.parse(m.at);
    return Number.isFinite(sent) ? Math.min(sent, mounted) : mounted;
  });
  if (up.length === 0) return null;
  return (
    <div className="banner-stack" aria-live="polite" data-testid="broadcast-banners">
      {up.map((m) => (
        <p key={m.id} className="system-banner" data-testid="broadcast-banner">
          <span className="system-banner-mark" aria-hidden="true">
            [System]
          </span>{' '}
          {m.text}
        </p>
      ))}
    </div>
  );
}
