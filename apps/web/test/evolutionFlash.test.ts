import { describe, expect, it } from 'vitest';
import { isEvolution } from '../src/player/evolutionFlash';

const grades = ['G', 'F', 'E', 'D'].map((id) => ({ id }));

describe('isEvolution (M8.2)', () => {
  it('plays when the grade rises', () => {
    expect(isEvolution(grades, 'G', 'F')).toBe(true);
    expect(isEvolution(grades, 'F', 'D')).toBe(true);
  });
  it('never plays for an undo, no change, a first sighting or an unknown grade', () => {
    expect(isEvolution(grades, 'F', 'G')).toBe(false);
    expect(isEvolution(grades, 'E', 'E')).toBe(false);
    expect(isEvolution(grades, undefined, 'E')).toBe(false);
    expect(isEvolution(grades, 'E', undefined)).toBe(false);
    expect(isEvolution(grades, 'X', 'E')).toBe(false);
    expect(isEvolution(grades, 'E', 'X')).toBe(false);
  });
});
