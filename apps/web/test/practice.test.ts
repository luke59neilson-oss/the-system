import { describe, expect, it } from 'vitest';
import { defaultRules, projectRules, type PlayerPractice } from '@the-system/engine';
import {
  MAX_ACTION,
  RECENT_PRACTICE,
  practiceProblem,
  practiceWhat,
  recentPractice,
  sourceLabel,
} from '../src/player/practice';

const rules = projectRules(defaultRules());
const entry = (id: string, over: Partial<PlayerPractice> = {}): PlayerPractice => ({
  id,
  at: '2026-10-22T12:00:00.000Z',
  action: 'Shot at targets',
  skills: [],
  stat: null,
  source: 'player',
  ...over,
});

describe('practice window helpers (M3.11)', () => {
  it('needs an action and a skill or a stat', () => {
    expect(practiceProblem(' ', ['Basic Archery'], null)).toBe('Say what you did');
    expect(practiceProblem('x', [], null)).toBe('Pick a skill or a stat');
    expect(practiceProblem('x'.repeat(MAX_ACTION + 1), [], 'strength')).toContain('At most');
    expect(practiceProblem('x', [], 'strength')).toBeNull();
    expect(practiceProblem('x', ['Basic Archery'], null)).toBeNull();
    // A montage focus is just a line.
    expect(practiceProblem('x', [], null, false)).toBeNull();
  });

  it('describes skills and the stat by its configured name', () => {
    expect(practiceWhat({ skills: ['A', 'B'], stat: 'perception' }, rules)).toBe(
      'A + B · Perception',
    );
    expect(practiceWhat({ skills: [], stat: 'strength' }, rules)).toBe('Strength');
    expect(practiceWhat({ skills: ['A'], stat: null }, rules)).toBe('A');
    expect(sourceLabel('montage')).toBe('montage focus');
    expect(sourceLabel('gm')).toBe('by the GM');
  });

  it('lists the newest entries first, capped', () => {
    const many = Array.from({ length: RECENT_PRACTICE + 3 }, (_, i) => entry(`p${i}`));
    const shown = recentPractice(many);
    expect(shown).toHaveLength(RECENT_PRACTICE);
    expect(shown[0]?.id).toBe(`p${RECENT_PRACTICE + 2}`);
  });
});
