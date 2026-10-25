import { useEffect, useState } from 'react';
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
  const freshKey = fresh.map((m) => m.id).join(',');
  useEffect(() => {
    if (freshKey === '') return;
    // Stamped with the wall clock, not the tick (a throttled background tab
    // can leave the tick minutes old); deferred so the effect stays pure.
    const timer = setTimeout(() => {
      const at = Date.now();
      setArrivals(
        (prev) => new Map([...prev, ...freshKey.split(',').map((id) => [id, at] as const)]),
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [freshKey]);
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
