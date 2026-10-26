import { describe, expect, it } from 'vitest';
import type { CampaignState } from '@the-system/engine';
import { LOADING_TEXT, loadingCommand, settleEnding } from '../src/gm/loadingScreen';

// MC.4 (DESIGN §11 "Loading screen"): a pinned System broadcast while content generates.
const at = '2026-10-26T06:00:00.000Z';
const state = (broadcasts: CampaignState['broadcasts']) => ({ broadcasts }) as CampaignState;

describe('loading screen (MC.4)', () => {
  it('is a pinned broadcast to everyone; blank text sends nothing', () => {
    expect(loadingCommand(` ${LOADING_TEXT} `)).toEqual({
      type: 'system.broadcast',
      text: LOADING_TEXT,
      characterIds: null,
      display: { mode: 'pinned' },
    });
    expect(loadingCommand('  ')).toBeNull();
  });

  it('settles screens to take down, waiting for one whose banner has not arrived', () => {
    const pin = { mode: 'pinned' } as const;
    const s = state([
      { id: 'a', at, text: LOADING_TEXT, characterIds: null, display: pin },
      { id: 'b', at, text: 'Weaving', characterIds: null, display: pin, removed: true },
      { id: 'c', at, text: LOADING_TEXT, characterIds: null, display: pin },
    ]);
    const ending = [
      { text: LOADING_TEXT, since: 0 },
      { text: LOADING_TEXT, since: 0 },
      { text: 'Weaving', since: 1 },
      { text: 'Not yet', since: 3 },
    ];
    // Two screens with the same text claim one banner each, oldest first; an
    // already removed banner needs nothing; a missing one waits.
    expect(settleEnding(s, ending, new Set())).toEqual({
      removals: ['a', 'c'],
      left: [{ text: 'Not yet', since: 3 }],
    });
    // A banner whose removal is already sent is not removed twice.
    expect(settleEnding(s, [{ text: LOADING_TEXT, since: 0 }], new Set(['a']))).toEqual({
      removals: ['c'],
      left: [],
    });
  });
});
