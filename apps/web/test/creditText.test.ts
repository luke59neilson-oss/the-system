import { describe, expect, it } from 'vitest';
import type { PlayerCreditEntry } from '@the-system/engine';
import { creditText } from '../src/player/inventoryModel';

// MT.4: one line per change to the player's own Credits.
const view = { viewerId: 'jake', party: [{ id: 'mira', name: 'Mira' }] } as const;
const entry = (e: Partial<PlayerCreditEntry>): PlayerCreditEntry => ({
  id: 'e1',
  at: '2026-10-25T12:00:00.000Z',
  kind: 'grant',
  delta: 50,
  balance: 50,
  other: null,
  reason: '',
  ...e,
});

describe('creditText (MT.4)', () => {
  it('says what changed, why, and the balance after', () => {
    const v = view as unknown as Parameters<typeof creditText>[0];
    expect(creditText(v, entry({ reason: ' Bounty ' }), 'Credits')).toBe(
      '+50 Credits from the GM: Bounty · balance 50',
    );
    expect(creditText(v, entry({ kind: 'fine', delta: -5, balance: 45 }), 'Credits')).toBe(
      '−5 Credits, fined by the GM · balance 45',
    );
    expect(
      creditText(v, entry({ kind: 'gift', delta: -10, balance: 35, other: 'mira' }), 'Credits'),
    ).toBe('−10 Credits, given to Mira · balance 35');
    expect(creditText(v, entry({ kind: 'gift', delta: 7, other: null }), 'Gold')).toBe(
      '+7 Gold, a gift from the GM · balance 50',
    );
    expect(creditText(v, entry({ kind: 'trade', delta: 3, other: 'mira' }), 'Credits')).toBe(
      '+3 Credits in a trade with Mira · balance 50',
    );
    expect(creditText(v, entry({ kind: 'loot', delta: 9 }), 'Credits')).toBe(
      '+9 Credits from loot · balance 50',
    );
  });
});
