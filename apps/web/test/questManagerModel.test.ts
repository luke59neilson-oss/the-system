import { describe, expect, it } from 'vitest';
import type { CampaignState, Quest } from '@the-system/engine';
import {
  actionCommand,
  actionTags,
  emptyQuestDraft,
  nudgeCommand,
  parseStabilityRules,
  parseTags,
  questCreateCommand,
  questDraftOf,
  questEditCommand,
  rulesText,
  stabilityOffers,
} from '../src/gm/questManagerModel';

const quest = (id: string, extra: Partial<Quest> = {}): Quest => ({
  id,
  title: `Quest ${id}`,
  text: 'Text',
  status: 'active',
  visible: true,
  days: 30,
  startDay: 1,
  stability: { value: 100, visible: false, rules: { cleanse: -5, 'kill beast': 2 } },
  createdAt: '2026-10-24T00:00:00.000Z',
  noticeTo: null,
  ...extra,
});
const stateOf = (quests: Quest[]) =>
  ({
    quests: Object.fromEntries(quests.map((q) => [q.id, q])),
    questOrder: quests.map((q) => q.id),
  }) as unknown as CampaignState;

describe('quest manager model (M7.1)', () => {
  it('parses "tag: delta" lines into lower-case tags', () => {
    expect(parseStabilityRules('Cleanse Zone: -5\n\n kill beast : +2 ')).toEqual({
      'cleanse zone': -5,
      'kill beast': 2,
    });
    expect(parseStabilityRules('oops')).toMatch(/tag: delta/);
    expect(parseStabilityRules('idle: 0')).toMatch(/must change/);
    expect(parseStabilityRules('a: 1\nA: 2')).toMatch(/two rules/);
    expect(rulesText({ cleanse: -5, beast: 2 })).toBe('cleanse: -5\nbeast: +2');
    expect(parseStabilityRules(rulesText({ cleanse: -5, 'kill beast': 2 }))).toEqual({
      cleanse: -5,
      'kill beast': 2,
    });
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
      stability: { rules: { cleanse: -5 }, visible: false },
    });
    expect(questCreateCommand({ ...draft, stabilityVisible: true })).toMatchObject({
      stability: { rules: { cleanse: -5 }, visible: true },
    });
    expect(questCreateCommand({ ...draft, title: ' ' })).toBe('A quest needs a title');
    // A hidden quest says who gets the notice (D122); a visible one sends none.
    expect(questCreateCommand({ ...draft, visible: false, noticeTo: ['kim'] })).toMatchObject({
      visible: false,
      noticeTo: ['kim'],
    });
    expect(questCreateCommand({ ...draft, noticeTo: ['kim'] })).not.toHaveProperty('noticeTo');
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

describe('quest edits (M7.1)', () => {
  it('sends only what changed, or null when nothing did', () => {
    const q = quest('q');
    const draft = questDraftOf(q);
    expect(questEditCommand(q, draft)).toBeNull();
    expect(questEditCommand(q, { ...draft, title: ' New  name ', days: '' })).toEqual({
      type: 'quest.edit',
      questId: 'q',
      title: 'New name',
      days: null,
    });
    expect(questEditCommand(q, { ...draft, rules: 'cleanse: -4', stabilityVisible: true })).toEqual(
      {
        type: 'quest.edit',
        questId: 'q',
        stabilityVisible: true,
        stabilityRules: { cleanse: -4 },
      },
    );
    // Rules in another order are the same rules.
    expect(questEditCommand(q, { ...draft, rules: 'kill beast: 2\ncleanse: -5' })).toBeNull();
  });

  it('carries the notice list only for a hidden quest', () => {
    const q = quest('q');
    const draft = questDraftOf(q);
    expect(questEditCommand(q, { ...draft, visible: false, noticeTo: ['kim'] })).toEqual({
      type: 'quest.edit',
      questId: 'q',
      visible: false,
      noticeTo: ['kim'],
    });
    expect(questEditCommand(q, { ...draft, noticeTo: ['kim'] })).toBeNull();
    const hidden = quest('h', { visible: false, noticeTo: ['kim', 'jake'] });
    expect(
      questEditCommand(hidden, { ...questDraftOf(hidden), noticeTo: ['jake', 'kim'] }),
    ).toBeNull();
    expect(questEditCommand(hidden, { ...questDraftOf(hidden), noticeTo: null })).toEqual({
      type: 'quest.edit',
      questId: 'h',
      noticeTo: null,
    });
  });

  it('refuses to add World Stability to a quest created without it', () => {
    const plain = quest('p', { stability: null });
    const draft = questDraftOf(plain);
    expect(draft.rules).toBe('');
    expect(questEditCommand(plain, { ...draft, rules: 'cleanse: -5' })).toMatch(
      /when the quest is created/,
    );
    expect(questEditCommand(plain, { ...draft, stabilityVisible: true })).toBeNull();
    expect(questEditCommand(plain, { ...draft, title: '' })).toBe('A quest needs a title');
  });
});

describe('tagged actions and practice offers (M7.1, D67)', () => {
  it('builds the action command', () => {
    expect(actionCommand('q', 'cleanse', '2', ' zone A ')).toEqual({
      type: 'stability.applyAction',
      questId: 'q',
      tag: 'cleanse',
      count: 2,
      reason: 'zone A',
    });
    expect(actionCommand('q', '', '1', '')).toBe('Pick an action');
    expect(actionCommand('q', 'cleanse', '0', '')).toMatch(/1 or more/);
  });

  it('lists the tags of active quests with World Stability, and matches entries to them', () => {
    const state = stateOf([
      quest('a'),
      quest('b', { stability: { value: 50, visible: true, rules: { cleanse: -2, rescue: 3 } } }),
      quest('done', { status: 'completed' }),
      quest('plain', { stability: null }),
    ]);
    expect(actionTags(state)).toEqual(['cleanse', 'kill beast', 'rescue']);
    expect(stabilityOffers(state, { tags: ['Cleanse', 'other'] })).toEqual([
      { questId: 'a', title: 'Quest a', tag: 'cleanse', delta: -5 },
      { questId: 'b', title: 'Quest b', tag: 'cleanse', delta: -2 },
    ]);
    expect(stabilityOffers(state, { tags: [] })).toEqual([]);
    expect(parseTags(' Cleanse , kill   beast,, cleanse')).toEqual(['cleanse', 'kill beast']);
  });
});
