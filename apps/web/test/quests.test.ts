import { describe, expect, it } from 'vitest';
import type { PlayerQuest } from '@the-system/engine';
import { splitQuests, stabilityLabel, statusText, timeText } from '../src/player/quests';

const q = (over: Partial<PlayerQuest>): PlayerQuest => ({
  id: 'q',
  title: 'T',
  text: '',
  status: 'active',
  daysLeft: null,
  stability: null,
  stabilityPercent: null,
  ...over,
});

describe('quest log helpers (M3.8)', () => {
  it('shows the days left only on an active timed quest', () => {
    expect(timeText(q({ daysLeft: 26 }))).toBe('Time remaining: 26 days');
    expect(timeText(q({ daysLeft: 1 }))).toBe('Time remaining: 1 day');
    expect(timeText(q({ daysLeft: 0 }))).toBe('Time is up');
    expect(timeText(q({ daysLeft: -2 }))).toBe('Time is up');
    expect(timeText(q({ daysLeft: null }))).toBeNull();
    expect(timeText(q({ daysLeft: 5, status: 'completed' }))).toBeNull();
  });

  it('lists active quests first, finished ones newest first', () => {
    const list = [
      q({ id: 'a', status: 'completed' }),
      q({ id: 'b' }),
      q({ id: 'c', status: 'failed' }),
      q({ id: 'd' }),
    ];
    const { active, finished } = splitQuests(list);
    expect(active.map((x) => x.id)).toEqual(['b', 'd']);
    expect(finished.map((x) => x.id)).toEqual(['c', 'a']);
  });

  it('labels status and stability values', () => {
    expect(['active', 'completed', 'failed'].map((s) => statusText(s as 'active'))).toEqual([
      'Active',
      'Completed',
      'Failed',
    ]);
    expect(stabilityLabel(89)).toBe('89');
    expect(stabilityLabel(88.25)).toBe('88.3');
  });
});
