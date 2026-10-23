import { describe, expect, it } from 'vitest';
import type { CampaignState, LedgerEntry } from '@the-system/engine';
import { notificationText } from '../src/format';
import { matchesFilter } from '../src/player/history';
import {
  balances,
  currencyCommands,
  ledgerRows,
  parseAmount,
  signed,
} from '../src/gm/currencyModel';

const character = (name: string) => ({ name }) as unknown as CampaignState['characters'][string];
const holdings = (currency: number) => ({ currency, inventory: {}, equipped: {} });

const state = {
  characterOrder: ['jake', 'kim', 'gone'],
  characters: { jake: character('Jake'), kim: character('Kim') },
  holdings: { jake: holdings(30) },
  rules: { economy: { currencyName: 'Credits' } },
} as unknown as CampaignState;

const entry = (e: Partial<LedgerEntry>): LedgerEntry => ({
  id: 'e1',
  at: '2026-10-23T12:00:00.000Z',
  characterId: 'jake',
  delta: 10,
  balance: 10,
  kind: 'grant',
  other: null,
  reason: '',
  ...e,
});

describe('currency model (M6.3)', () => {
  it('parses positive whole amounts only', () => {
    expect(parseAmount(' 25 ')).toBe(25);
    for (const raw of ['', '0', '-5', '2.5', '1e3', 'ten', '1000000001']) {
      expect(parseAmount(raw), raw).toBeNull();
    }
  });

  it('lists balances in character order, skipping missing characters', () => {
    expect(balances(state)).toEqual([
      { id: 'jake', name: 'Jake', balance: 30 },
      { id: 'kim', name: 'Kim', balance: 0 },
    ]);
  });

  it('builds one signed adjust per chosen character with the trimmed reason', () => {
    expect(currencyCommands(state, ['kim', 'jake'], '15', 1, '  Bounty  ')).toEqual({
      commands: [
        { type: 'holdings.adjust', characterId: 'jake', currency: 15, reason: 'Bounty' },
        { type: 'holdings.adjust', characterId: 'kim', currency: 15, reason: 'Bounty' },
      ],
    });
    expect(currencyCommands(state, ['jake'], '30', -1, '')).toEqual({
      commands: [{ type: 'holdings.adjust', characterId: 'jake', currency: -30, reason: '' }],
    });
  });

  it('refuses no one, a bad amount, or a fine above anyone’s balance (all or none)', () => {
    expect(currencyCommands(state, [], '5', 1, '')).toEqual({ problem: 'Choose who it is for' });
    expect(currencyCommands(state, ['gone'], '5', 1, '')).toEqual({
      problem: 'Choose who it is for',
    });
    expect(currencyCommands(state, ['jake'], 'x', 1, '')).toEqual({
      problem: 'Enter a whole number above 0',
    });
    expect(currencyCommands(state, ['jake', 'kim'], '10', -1, '')).toEqual({
      problem: 'Not enough Credits: Kim has 0',
    });
  });

  it('describes ledger rows newest first with the other party or the reason', () => {
    const s = {
      ...state,
      ledger: [
        entry({ id: 'a', reason: 'Bounty' }),
        entry({ id: 'b', kind: 'gift', delta: -5, balance: 5, other: 'kim' }),
        entry({ id: 'c', characterId: 'kim', kind: 'trade', delta: 4, balance: 4, other: null }),
        entry({ id: 'd', characterId: 'kim', kind: 'loot', delta: 3, balance: 7 }),
        entry({ id: 'e', characterId: 'ghost', kind: 'fine', delta: -1, balance: 0 }),
      ],
    } as unknown as CampaignState;
    const rows = ledgerRows(s, null);
    expect(rows.map((r) => [r.name, r.kind, r.delta, r.balance, r.detail])).toEqual([
      ['Removed character', 'Fine', '−1', 0, ''],
      ['Kim', 'Loot', '+3', 7, 'from a loot roll'],
      ['Kim', 'Trade', '+4', 4, 'from the GM'],
      ['Jake', 'Gift', '−5', 5, 'to Kim'],
      ['Jake', 'Grant', '+10', 10, 'Bounty'],
    ]);
    expect(ledgerRows(s, 'kim').map((r) => r.key)).toEqual(['d:kim', 'c:kim']);
    expect(signed(12)).toBe('+12');
  });

  it('words the player notice and files it under Items', () => {
    const base = { kind: 'currency' as const, characterId: 'jake', currencyName: 'Credits' };
    expect(notificationText({ ...base, amount: 50, reason: 'Bounty' })).toBe(
      'You received 50 Credits from the GM: Bounty',
    );
    expect(notificationText({ ...base, amount: -20, reason: ' ' })).toBe(
      'Fined 20 Credits by the GM',
    );
    expect(matchesFilter({ ...base, amount: 1, reason: '' }, 'items')).toBe(true);
  });
});
