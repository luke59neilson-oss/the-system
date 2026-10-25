import { describe, expect, it } from 'vitest';
import { LATE_ARRIVAL_GRACE_MS, activeBanners, bannerStart, type BannerSource } from './banners';

const T0 = Date.parse('2026-10-25T20:00:00.000Z');
const at = new Date(T0).toISOString();
const timed = (id: string, seconds: number, extra: Partial<BannerSource> = {}): BannerSource => ({
  id,
  at,
  text: id,
  display: { mode: 'timed', seconds },
  ...extra,
});

describe('activeBanners (MT.6)', () => {
  it('keeps pinned banners until removed and drops list-only and removed ones', () => {
    const list = [
      { id: 'plain', at, text: 'plain' },
      { id: 'pin', at, text: 'pin', display: { mode: 'pinned' as const } },
      {
        id: 'gone',
        at,
        text: 'gone',
        display: { mode: 'pinned' as const },
        removed: true as const,
      },
    ];
    const up = activeBanners(list, T0 + 86_400_000, () => T0);
    expect(up.map((m) => m.id)).toEqual(['pin']);
  });

  it('shows a timed banner for exactly its seconds from its start', () => {
    const list = [timed('t', 30)];
    expect(activeBanners(list, T0 + 29_999, () => T0)).toHaveLength(1);
    expect(activeBanners(list, T0 + 30_000, () => T0)).toHaveLength(0);
  });
});

describe('bannerStart (MT.6 late arrivals)', () => {
  it('times a live arrival from when the screen saw it, within the grace', () => {
    expect(bannerStart(T0, T0 + 500)).toBe(T0 + 500);
    // A phone clock behind the server still gets the full time.
    expect(bannerStart(T0, T0 - 90_000)).toBe(T0 - 90_000);
    expect(bannerStart(T0, T0 + LATE_ARRIVAL_GRACE_MS)).toBe(T0 + LATE_ARRIVAL_GRACE_MS);
  });

  it('bounds a late arrival (after a reconnect) by its send time', () => {
    const arrived = T0 + 10 * 60_000;
    const start = bannerStart(T0, arrived);
    expect(start).toBe(T0 + LATE_ARRIVAL_GRACE_MS);
    // A 5-minute banner first seen 10 minutes after sending stays down.
    expect(activeBanners([timed('late', 300)], arrived, () => start)).toHaveLength(0);
    // A 1-hour banner seen late shows only what is left of its hour (plus the grace).
    const hour = activeBanners([timed('hour', 3600)], arrived, () => start);
    expect(hour).toHaveLength(1);
    expect(
      activeBanners([timed('hour', 3600)], T0 + 3600_000 + LATE_ARRIVAL_GRACE_MS, () => start),
    ).toHaveLength(0);
  });

  it('falls back to the arrival when the send time is unreadable', () => {
    expect(bannerStart(Number.NaN, T0)).toBe(T0);
  });
});
