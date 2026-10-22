import { describe, expect, it } from 'vitest';
import { cssToken, poolPercent, themeClass } from '../src/player/sheet';

describe('poolPercent', () => {
  it('fills by current over max, clamped to 0–100', () => {
    expect(poolPercent(100, 110)).toBeCloseTo(90.909, 2);
    expect(poolPercent(380, 380)).toBe(100);
    expect(poolPercent(120, 100)).toBe(100);
    expect(poolPercent(-5, 100)).toBe(0);
    expect(poolPercent(5, 0)).toBe(0);
    expect(poolPercent(5, Number.NaN)).toBe(0);
  });
});

describe('css tokens', () => {
  it('keeps only safe class-name characters', () => {
    expect(cssToken('epic')).toBe('epic');
    expect(cssToken('a b"><x')).toBe('abx');
    expect(themeClass('silver')).toBe(' theme-silver');
    expect(themeClass('"><')).toBe('');
    expect(themeClass(null)).toBe('');
    expect(themeClass(undefined)).toBe('');
  });
});
