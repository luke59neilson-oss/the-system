import { describe, expect, it } from 'vitest';
import { PORTRAIT_EDGE, fitWithin } from '../src/gm/portraitUpload';

describe('fitWithin', () => {
  it('shrinks the longer side to the portrait edge and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: PORTRAIT_EDGE, height: 384 });
    expect(fitWithin(1000, 2000)).toEqual({ width: 256, height: PORTRAIT_EDGE });
  });

  it('never enlarges and never returns a zero side', () => {
    expect(fitWithin(200, 100)).toEqual({ width: 200, height: 100 });
    expect(fitWithin(10_000, 1)).toEqual({ width: PORTRAIT_EDGE, height: 1 });
    expect(fitWithin(0, 0)).toEqual({ width: 1, height: 1 });
  });
});
