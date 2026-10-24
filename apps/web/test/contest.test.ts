import { describe, expect, it } from 'vitest';
import type { PlayerContest } from '@the-system/engine';
import { chanceText, contestLines, newContests } from '../src/player/contest';

const contest = (id: string, extra: Partial<PlayerContest> = {}): PlayerContest => ({
  id,
  at: '2026-10-24T12:00:00.000Z',
  yours: { label: 'Jake · Perception', stat: 'perception', value: 30 },
  theirs: 'Pale stalker',
  chance: 0.75,
  walled: false,
  won: true,
  ...extra,
});

describe('contest pop-up (M7.3)', () => {
  it('pops up only contests not known when the page loaded', () => {
    expect(newContests([contest('a'), contest('b')], new Set(['a'])).map((c) => c.id)).toEqual([
      'b',
    ]);
  });
  it('words the contest from the viewer side', () => {
    expect(contestLines(contest('a'))).toEqual({
      title: '[Jake · Perception] vs [Pale stalker]',
      odds: 'Your chance: 75%',
      result: 'Success.',
    });
    expect(contestLines(contest('b', { walled: true, won: false, chance: 0 }))).toEqual({
      title: '[Jake · Perception] vs [Pale stalker]',
      odds: 'A grade wall decides it: no roll.',
      result: 'Failure.',
    });
    expect(chanceText(0.004)).toBe('<1%');
    expect(chanceText(0.999)).toBe('>99%');
  });
});
