import { describe, expect, it } from 'vitest';
import type { CampaignState } from '@the-system/engine';
import {
  LOADING_TEXT,
  clearLoadingCommand,
  loadingBannerId,
  loadingCommand,
} from '../src/gm/loadingScreen';

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

  it('finds the banner just sent, not an older or removed one', () => {
    const s = state([
      { id: 'old', at, text: LOADING_TEXT, characterIds: null, display: { mode: 'pinned' } },
      { id: 'list', at, text: LOADING_TEXT, characterIds: null },
      { id: 'new', at, text: LOADING_TEXT, characterIds: null, display: { mode: 'pinned' } },
    ]);
    expect(loadingBannerId(s, LOADING_TEXT, 1)).toBe('new');
    expect(loadingBannerId(s, 'other', 0)).toBeNull();
    const gone = state([
      {
        id: 'new',
        at,
        text: LOADING_TEXT,
        characterIds: null,
        display: { mode: 'pinned' },
        removed: true,
      },
    ]);
    expect(loadingBannerId(gone, LOADING_TEXT, 0)).toBeNull();
  });

  it('clears a live banner once; a removed or unknown one needs nothing', () => {
    const live = state([
      { id: 'b', at, text: LOADING_TEXT, characterIds: null, display: { mode: 'pinned' } },
    ]);
    expect(clearLoadingCommand(live, 'b')).toEqual({ type: 'broadcast.remove', id: 'b' });
    expect(clearLoadingCommand(live, 'x')).toBeNull();
    const removed = state([{ ...live.broadcasts[0]!, removed: true }]);
    expect(clearLoadingCommand(removed, 'b')).toBeNull();
  });
});
