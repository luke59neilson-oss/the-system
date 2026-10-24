import { describe, expect, it } from 'vitest';
import { SOUNDS, scaledPeak } from '../src/player/sounds';
import { DEFAULT_VOLUME, readVolume, writeVolume } from '../src/player/history';

// M8.4: three original sounds made in code, with volume and mute.

const store = (v: string | null) => {
  const m = new Map<string, string>(v === null ? [] : [['the-system:volume', v]]);
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, x: string) => void m.set(k, x),
  };
};

describe('sound recipes', () => {
  it('each sound is distinct: its own notes and length', () => {
    const sig = (k: keyof typeof SOUNDS) => SOUNDS[k].map((n) => `${n.freq}/${n.wave}`).join(',');
    expect(new Set([sig('ding'), sig('selection'), sig('evolution')]).size).toBe(3);
    const end = (k: keyof typeof SOUNDS) => Math.max(...SOUNDS[k].map((n) => n.at + n.length));
    expect(end('ding')).toBeLessThan(0.6);
    expect(end('selection')).toBeLessThan(0.8);
    expect(end('evolution')).toBeGreaterThan(1.5); // the swell under the 2.4s re-theme
    expect(end('evolution')).toBeLessThanOrEqual(2.4);
  });

  it('every note is audible, short of clipping, and starts at or after zero', () => {
    for (const notes of Object.values(SOUNDS)) {
      const peakSum = notes.reduce((a, n) => a + n.peak, 0);
      expect(peakSum).toBeLessThanOrEqual(0.5);
      for (const n of notes) {
        expect(n.at).toBeGreaterThanOrEqual(0);
        expect(n.attack).toBeLessThan(n.length);
        expect(n.freq).toBeGreaterThan(100);
      }
    }
  });

  it('volume scales the peaks linearly and clamps to 0–100', () => {
    const n = SOUNDS.ding[0]!;
    expect(scaledPeak(n, 100)).toBe(n.peak);
    expect(scaledPeak(n, 50)).toBeCloseTo(n.peak / 2, 10);
    expect(scaledPeak(n, 0)).toBe(0);
    expect(scaledPeak(n, 250)).toBe(n.peak);
    expect(scaledPeak(n, -5)).toBe(0);
  });
});

describe('volume per browser', () => {
  it('defaults, rounds to steps of 10, clamps, and survives bad or blocked storage', () => {
    expect(readVolume(store(null))).toBe(DEFAULT_VOLUME);
    expect(readVolume(null)).toBe(DEFAULT_VOLUME);
    expect(readVolume(store('44'))).toBe(40);
    expect(readVolume(store('300'))).toBe(100);
    expect(readVolume(store('0'))).toBe(0);
    expect(readVolume(store('loud'))).toBe(DEFAULT_VOLUME);
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readVolume(blocked)).toBe(DEFAULT_VOLUME);
    expect(() => writeVolume(blocked, 30)).not.toThrow();
    const s = store(null);
    writeVolume(s, 30);
    expect(readVolume(s)).toBe(30);
  });
});
