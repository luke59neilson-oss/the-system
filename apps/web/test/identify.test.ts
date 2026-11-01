import { describe, expect, it } from 'vitest';
import { OUT_OF_RANGE, identifyBody, identifyHeader, identifyResult } from '../src/player/identify';

const known = [
  {
    id: 'curse',
    label: 'The black miasma',
    inRange: true,
    grade: null,
    level: null,
    text: '[Fever]',
  },
  { id: 'drum', label: 'The Drum', inRange: true, grade: null, level: null, text: null },
];

describe('identifyResult (M3.9)', () => {
  it('shows nothing until the player chooses', () => {
    expect(identifyResult(known, null)).toEqual({ kind: 'none' });
  });
  it('shows the live entry for the chosen id (label and text follow GM edits)', () => {
    expect(identifyResult(known, { id: 'curse', label: 'old label' })).toEqual({
      kind: 'shown',
      entry: known[0],
    });
    expect(identifyResult(known, { id: 'drum', label: 'The Drum' })).toEqual({
      kind: 'shown',
      entry: known[1],
    });
  });
  it('says the entity is gone when it is no longer known', () => {
    expect(identifyResult([], { id: 'curse', label: 'The black miasma' })).toEqual({
      kind: 'gone',
      label: 'The black miasma',
    });
  });
});

describe('identifyHeader (MQ.8)', () => {
  const base = { id: 'h', label: 'Pale hunter', text: null };
  it('hides everything out of range', () => {
    expect(identifyHeader({ ...base, inRange: false, grade: null, level: null })).toBe(
      OUT_OF_RANGE,
    );
    expect(OUT_OF_RANGE).toBe('[??? – lvl ???]');
  });
  it('shows grade and level in the books’ format when the GM gave them', () => {
    expect(identifyHeader({ ...base, inRange: true, grade: 'F', level: 7 })).toBe(
      '[Pale hunter (F) – lvl 7]',
    );
    expect(identifyHeader({ ...base, inRange: true, grade: null, level: null })).toBeNull();
  });
});

describe('identifyBody (QF.62)', () => {
  const stalker = { id: 's', label: 'Canyon Stalker', inRange: true, grade: 'F', level: 7 };
  it('drops a first line that only restates the header, so a Common viewer sees no duplicate', () => {
    expect(identifyBody({ ...stalker, text: '[Canyon Stalker – lvl 7]' })).toBeNull();
    expect(
      identifyBody({
        ...stalker,
        text: '[Canyon Stalker – lvl 7] A lean hunter of the scar canyons.',
      }),
    ).toBe('A lean hunter of the scar canyons.');
    expect(
      identifyBody({
        ...stalker,
        label: 'Pale hunter',
        level: 14,
        text: '[Pale Hunter – lvl 14]\nIt hunts.',
      }),
    ).toBe('It hunts.');
  });
  it('drops the repeat for a grade id from the rules config of any length', () => {
    expect(identifyBody({ ...stalker, grade: 'SS', text: '[Canyon Stalker – lvl 7] Old.' })).toBe(
      'Old.',
    );
  });
  it('keeps text whose bracket says something else, or when there is no header', () => {
    expect(identifyBody({ ...stalker, text: '[Canyon Stalker – lvl 9] Grown.' })).toBe(
      '[Canyon Stalker – lvl 9] Grown.',
    );
    expect(identifyBody({ ...stalker, text: '[Fever] Burns.' })).toBe('[Fever] Burns.');
    expect(
      identifyBody({ ...stalker, grade: null, level: null, text: '[Canyon Stalker – lvl 7]' }),
    ).toBe('[Canyon Stalker – lvl 7]');
    expect(identifyBody({ ...stalker, text: null })).toBeNull();
  });
});
