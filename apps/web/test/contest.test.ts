import { describe, expect, it } from 'vitest';
import type { PlayerContest } from '@the-system/engine';
import {
  chanceText,
  contestLines,
  diceLines,
  newContests,
  rollPromptText,
} from '../src/player/contest';

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
      odds: 'Too far apart in grade: the higher grade wins, no roll.',
      result: 'Failure.',
    });
    expect(chanceText(0.004)).toBe('<1%');
    expect(chanceText(0.999)).toBe('>99%');
  });
});

describe('d20 dice in the pop-up (MK.2)', () => {
  it('shows each die, how it was rolled, modifier and total; ties say so', () => {
    const c = contest('d', {
      d20: {
        yourModifier: 3,
        theirModifier: -2,
        rounds: [
          { yours: { die: 4, how: 'typed', total: 7 }, theirs: { die: 9, how: 'app', total: 7 } },
          { yours: { die: 12, how: 'app', total: 15 }, theirs: { die: 5, how: 'app', total: 3 } },
        ],
      },
    });
    expect(diceLines(c)).toEqual([
      'You: d20 4 (typed) +3 = 7 · They: d20 9 (app) −2 = 7 (tie, roll again)',
      'You: d20 12 (app) +3 = 15 · They: d20 5 (app) −2 = 3',
    ]);
    expect(diceLines(contest('o'))).toEqual([]);
  });
});

describe('roll prompt (MK.2)', () => {
  const view = {
    rules: { stats: { list: [{ id: 'perception', name: 'Perception' }] } },
    me: { rollModifiers: { perception: 14 } },
  } as unknown as Parameters<typeof rollPromptText>[0];
  it('asks for the stat with its modifier, then shows the die sent', () => {
    expect(rollPromptText(view, { id: 'r', stat: 'perception', answer: null })).toEqual({
      title: 'Roll d20 for Perception (+14)',
      answer: null,
    });
    expect(
      rollPromptText(view, { id: 'r', stat: 'perception', answer: { die: 17, how: 'typed' } })
        .answer,
    ).toBe('You rolled 17 (typed) +14 = 31. The GM has it.');
    expect(
      rollPromptText(view, { id: 'r', stat: 'perception', answer: { die: 3, how: 'app' } }).answer,
    ).toBe('You rolled 3 (app) +14 = 17. The GM has it.');
  });
});
