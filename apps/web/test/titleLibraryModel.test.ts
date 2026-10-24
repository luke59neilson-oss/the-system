import { describe, expect, it } from 'vitest';
import type { TitleDef } from '@the-system/engine';
import {
  describeTitleBonuses,
  emptyTitleDraft,
  holdersOf,
  libraryTitles,
  parseFlat,
  parsePercent,
  parseTitleBonuses,
  savedTitle,
  titleChangedSince,
  titleDraftOf,
  titleSaveCommand,
} from '../src/gm/titleLibraryModel';

const stats = [
  { id: 'str', name: 'Strength' },
  { id: 'vit', name: 'Vitality' },
];
const display = { displayDivisor: 10, displayDecimals: 1 };
const spread: TitleDef = {
  id: 't1',
  name: 'Rapid Spread',
  text: 'You have propagated through the Host faster than any before you.',
  bonuses: [
    { stat: 'str', percent: 0.1 },
    { stat: 'vit', percent: 0.05, flat: 5 },
  ],
};

describe('parsePercent / parseFlat', () => {
  it('reads percents as fractions and refuses junk and out-of-range values', () => {
    expect(parsePercent('')).toBeUndefined();
    expect(parsePercent(' 10 ')).toBe(0.1);
    expect(parsePercent('2.5')).toBe(0.025);
    expect(parsePercent('-50')).toBe(-0.5);
    expect(parsePercent('-99')).toBe(-0.99);
    expect(parsePercent('-100')).toBeNull();
    expect(parsePercent('10001')).toBeNull();
    expect(parsePercent('10%')).toBeNull();
    expect(parsePercent('abc')).toBeNull();
  });
  it('reads flat bonuses as whole numbers', () => {
    expect(parseFlat('')).toBeUndefined();
    expect(parseFlat('+5')).toBe(5);
    expect(parseFlat('-3')).toBe(-3);
    expect(parseFlat('1.5')).toBeNull();
  });
});

describe('titleSaveCommand', () => {
  it('defines a new title with bonuses in stat order, zeros dropped', () => {
    const draft = {
      ...emptyTitleDraft(),
      name: '  Forerunner ',
      text: ' First. ',
      percent: { vit: '5', str: '0' },
      flat: { str: '3' },
    };
    expect(titleSaveCommand(draft, null, stats)).toEqual({
      type: 'titleDef.define',
      name: 'Forerunner',
      text: 'First.',
      bonuses: [
        { stat: 'str', flat: 3 },
        { stat: 'vit', percent: 0.05 },
      ],
    });
  });
  it('refuses a blank or over-long name and an invalid bonus', () => {
    expect(titleSaveCommand({ ...emptyTitleDraft(), name: ' ' }, null, stats)).toBeNull();
    expect(
      titleSaveCommand({ ...emptyTitleDraft(), name: 'x'.repeat(81) }, null, stats),
    ).toBeNull();
    expect(
      titleSaveCommand({ ...emptyTitleDraft(), name: 'A', flat: { str: '1.5' } }, null, stats),
    ).toBeNull();
  });
  it('sends only the changed fields of an edit, and nothing when unchanged', () => {
    const draft = titleDraftOf(spread);
    expect(draft.percent).toEqual({ str: '10', vit: '5' });
    expect(draft.flat).toEqual({ vit: '5' });
    expect(titleSaveCommand(draft, spread, stats)).toBeNull();
    const edit = titleSaveCommand(
      { ...draft, percent: { ...draft.percent, str: '15' } },
      spread,
      stats,
    );
    expect(edit).toEqual({
      type: 'titleDef.edit',
      titleDefId: 't1',
      bonuses: [
        { stat: 'str', percent: 0.15 },
        { stat: 'vit', percent: 0.05, flat: 5 },
      ],
    });
    expect(edit && savedTitle(spread, edit).bonuses[0]).toEqual({ stat: 'str', percent: 0.15 });
    const renamed = titleSaveCommand({ ...draft, name: 'Rapid  Spread II' }, spread, stats);
    expect(renamed).toEqual({ type: 'titleDef.edit', titleDefId: 't1', name: 'Rapid  Spread II' });
  });
  it('round-trips awkward fractions without float noise', () => {
    const def = { ...spread, bonuses: [{ stat: 'str', percent: 0.07 }] };
    expect(titleDraftOf(def).percent.str).toBe('7');
    expect(parseTitleBonuses(titleDraftOf(def), stats)).toEqual([{ stat: 'str', percent: 0.07 }]);
  });
});

describe('library helpers', () => {
  const state = {
    titleLibrary: { t1: spread, t2: { id: 't2', name: 'Forerunner', text: '', bonuses: [] } },
    titleLibraryOrder: ['t2', 't1'],
    characterOrder: ['a', 'b'],
    characters: {
      a: { name: 'Jake', titles: ['rapid spread'] },
      b: { name: 'Kim', titles: ['Forerunner'] },
    },
  } as never;
  it('lists in order and filters by name or text', () => {
    expect(libraryTitles(state, '').map((t) => t.id)).toEqual(['t2', 't1']);
    expect(libraryTitles(state, 'host').map((t) => t.id)).toEqual(['t1']);
    expect(libraryTitles(state, 'zzz')).toEqual([]);
  });
  it('finds holders ignoring case', () => {
    expect(holdersOf(state, 'Rapid Spread')).toEqual(['Jake']);
  });
  it('detects edits made elsewhere', () => {
    expect(titleChangedSince(spread, { ...spread, text: 'x' })).toBe(true);
    expect(titleChangedSince(spread, { ...spread })).toBe(false);
  });
});

describe('describeTitleBonuses', () => {
  it('reads percents and flat sheet values', () => {
    expect(describeTitleBonuses(spread.bonuses, stats, display)).toBe(
      '+10% Strength, +5% Vitality, +0.5 Vitality',
    );
    expect(describeTitleBonuses([{ stat: 'str', percent: -0.2, flat: -10 }], stats, display)).toBe(
      '−20% Strength, −1.0 Strength',
    );
    expect(describeTitleBonuses([], stats, display)).toBe('');
  });
});
