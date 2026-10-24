import { describe, expect, it } from 'vitest';
import {
  emptyQuestDraft,
  nudgeCommand,
  parseStabilityRules,
  questCreateCommand,
} from '../src/gm/questManagerModel';

describe('quest manager model (M7.1)', () => {
  it('parses "tag: delta" lines into lower-case tags', () => {
    expect(parseStabilityRules('Cleanse Zone: -5\n\n kill beast : +2 ')).toEqual({
      'cleanse zone': -5,
      'kill beast': 2,
    });
    expect(parseStabilityRules('oops')).toMatch(/tag: delta/);
    expect(parseStabilityRules('idle: 0')).toMatch(/must change/);
  });

  it('builds the create command, or says what is wrong', () => {
    const draft = {
      ...emptyQuestDraft(),
      title: '  The world   is dying ',
      text: 'Find what is killing it.',
      days: '30',
      rules: 'cleanse: -5',
    };
    expect(questCreateCommand(draft)).toEqual({
      type: 'quest.create',
      title: 'The world is dying',
      text: 'Find what is killing it.',
      visible: true,
      days: 30,
      stability: { rules: { cleanse: -5 } },
    });
    expect(questCreateCommand({ ...draft, title: ' ' })).toBe('A quest needs a title');
    expect(questCreateCommand({ ...draft, days: '3.5' })).toMatch(/whole number/);
    expect(questCreateCommand({ ...draft, rules: '', days: '' })).toMatchObject({
      days: null,
      stability: null,
    });
  });
});

describe('quest nudges (M7.1)', () => {
  it('accepts a signed whole number with an optional reason', () => {
    expect(nudgeCommand('q', ' -3 ', ' fled  ')).toEqual({
      type: 'stability.nudge',
      questId: 'q',
      delta: -3,
      reason: 'fled',
    });
    expect(nudgeCommand('q', '+2', '')).toEqual({
      type: 'stability.nudge',
      questId: 'q',
      delta: 2,
    });
    expect(nudgeCommand('q', '0', '')).toMatch(/other than 0/);
    expect(nudgeCommand('q', 'x', '')).toMatch(/whole number/);
  });
});
