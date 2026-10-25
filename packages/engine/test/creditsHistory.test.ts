import { describe, expect, it } from 'vitest';
import { projectForPlayer, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// MT.4 (DESIGN §7 "Players see their own Credits history", Q65): each player
// sees their own ledger entries with the balance after, and nobody else's.

const setup: Command[] = [
  { type: 'campaign.create', name: 'C', rules: rawRules() },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'mira', name: 'Mira', className: 'Archer', classSkills: kit },
];

const moves: Command[] = [
  { type: 'holdings.adjust', characterId: 'jake', currency: 50, reason: 'Bounty on the grazer' },
  { type: 'holdings.adjust', characterId: 'mira', currency: 80, reason: 'MIRA-ONLY reward' },
  { type: 'holdings.adjust', characterId: 'jake', currency: -5, reason: 'Broke a lantern' },
  { type: 'gift.give', characterId: 'jake', to: 'mira', currency: 10 },
];

describe('Credits history for players (MT.4)', () => {
  it('a player gets their own entries, oldest first, with the balance after', () => {
    const c = run([...setup, ...moves]);
    if (!c.state) throw new Error('no state');
    const jake = projectForPlayer(c.state, 'jake').inventory.credits;
    expect(jake.map((e) => [e.kind, e.delta, e.balance, e.other, e.reason])).toEqual([
      ['grant', 50, 50, null, 'Bounty on the grazer'],
      ['fine', -5, 45, null, 'Broke a lantern'],
      ['gift', -10, 35, 'mira', ''],
    ]);
    const mira = projectForPlayer(c.state, 'mira').inventory.credits;
    expect(mira.map((e) => [e.kind, e.delta, e.balance, e.other])).toEqual([
      ['grant', 80, 80, null],
      ['gift', 10, 90, 'jake'],
    ]);
  });

  it("never carries another character's entries, reasons or balances", () => {
    const c = run([...setup, ...moves]);
    if (!c.state) throw new Error('no state');
    const view = projectForPlayer(c.state, 'jake');
    const text = JSON.stringify(view);
    expect(text).not.toContain('MIRA-ONLY');
    expect(text).not.toContain('"balance":80');
    expect(text).not.toContain('"balance":90');
    expect(view.inventory.credits.every((e) => !('characterId' in e))).toBe(true);
  });

  it('an undone grant leaves the history with the ledger', () => {
    const c = run([...setup, moves[0] as Command]);
    const grant = c.events.at(-1)?.id ?? '';
    const undone = run(
      [{ type: 'event.undo', eventId: grant }],
      testContext('u', Date.UTC(2026, 9, 22)),
      c,
    );
    if (!undone.state) throw new Error('no state');
    expect(projectForPlayer(undone.state, 'jake').inventory.credits).toEqual([]);
  });
});
