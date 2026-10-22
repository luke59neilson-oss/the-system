import { describe, expect, it } from 'vitest';
import { identifyResult } from '../src/player/identify';

const known = [
  { id: 'curse', label: 'The black miasma', text: '[Fever]' },
  { id: 'drum', label: 'The Drum', text: null },
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
