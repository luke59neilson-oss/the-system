import { describe, expect, it } from 'vitest';
import { listenPollNeeded } from '../src/gm/listenModel';

// QF.31: the Listening panel polls only while its view can change on its own.
describe('listening poll (QF.31)', () => {
  it('polls while the mic is on, whatever the model', () => {
    expect(listenPollNeeded(true, null)).toBe(true);
    expect(listenPollNeeded(true, { state: 'ready' })).toBe(true);
  });

  it('polls while the speech model downloads or loads', () => {
    expect(listenPollNeeded(false, { state: 'downloading', received: 1, bytes: 9 })).toBe(true);
    expect(listenPollNeeded(false, { state: 'loading' })).toBe(true);
  });

  it('is quiet when idle: mic off and the model missing, ready, failed or absent', () => {
    expect(listenPollNeeded(false, null)).toBe(false);
    expect(listenPollNeeded(false, { state: 'missing', bytes: 9 })).toBe(false);
    expect(listenPollNeeded(false, { state: 'ready' })).toBe(false);
    expect(listenPollNeeded(false, { state: 'failed', error: 'x', bytes: 9 })).toBe(false);
  });
});
