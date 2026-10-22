import { describe, expect, it } from 'vitest';
import type { PlayerRules } from '@the-system/engine';
import {
  closedReason,
  offerKindLabel,
  offerLabel,
  pendingSelections,
  pendingText,
  settleNotice,
  type Selection,
} from '../src/player/selection';

const rules = {
  rarities: [
    { id: 'common', name: 'Common' },
    { id: 'rare', name: 'Rare' },
  ],
} as unknown as PlayerRules;

const option = (name: string, rarity = 'rare', kind: 'class' | 'profession' = 'class') => ({
  name,
  rarity,
  kind,
  description: '',
});

const menu = (level: number, chosen: string | null, offerId = `e${level}`): Selection => ({
  level,
  options: [option('A'), option('B'), option('C')],
  chosen,
  offerId,
  passedOver: [],
});

describe('skill selection (M3.6)', () => {
  it('lists only unchosen menus, lowest level first', () => {
    const list = [menu(20, null), menu(5, 'A'), menu(10, null)];
    expect(pendingSelections(list).map((s) => s.level)).toEqual([10, 20]);
    expect(pendingSelections([])).toEqual([]);
    expect(pendingText(2)).toBe('2 waiting');
  });

  it('labels offers in the System bracket form', () => {
    expect(offerLabel(rules, option('Arcane Shot'))).toBe('[Arcane Shot (Rare)]');
    expect(offerLabel(rules, option('Odd', 'unknown'))).toBe('[Odd (unknown)]');
    expect(offerKindLabel('class')).toBe('Class skill');
    expect(offerKindLabel('profession')).toBe('Profession skill');
  });

  it('tells a re-offered menu from a settled one', () => {
    const pending = [menu(10, null, 'e7')];
    expect(closedReason(pending, 10, 'e7')).toBeNull();
    expect(closedReason(pending, 10, 'e3')).toBe('changed');
    expect(closedReason(pending, 20, 'e9')).toBe('gone');
    expect(closedReason([], 10, 'e7')).toBe('gone');
  });

  it('words a refusal that lands after the dialog closed', () => {
    expect(settleNotice(20, 'Connection lost')).toBe(
      'Connection lost. Check your skills once you are back: the level 20 choice may already be saved.',
    );
    expect(settleNotice(20, 'Not connected to the System')).toContain('may already be saved');
    expect(settleNotice(20, 'the level 20 menu was offered again')).toBe(
      'Your level 20 skill choice was not saved: The level 20 menu was offered again',
    );
    expect(settleNotice(5, undefined)).toBe('Your level 5 skill choice was not saved: Refused');
  });
});
