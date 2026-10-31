import { describe, expect, it } from 'vitest';
import { execute, type Campaign, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// QF.40 (D31): a non-latest undo never silently loses XP. Undoing an earlier
// evolution would make later awards re-apply at the old cap, where XP is lost.

const award = (amount: number): Command => ({
  type: 'xp.award',
  track: 'class',
  amount,
  participants: [{ characterId: 'jake' }],
});
const setup = (): Command[] => [
  { type: 'campaign.create', name: 'Whale', rules: rawRules() },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  award(400), // G: class 4, the top of G
  {
    type: 'evolution.release',
    characterId: 'jake',
    options: [{ className: 'Hunter' }],
    rerateApproved: true,
    override: true,
  },
  { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' },
  award(900), // F: 300 per level → class 7
];

const idOf = (c: Campaign, type: string) => c.events.find((e) => e.type === type)!.id;
const jake = (c: Campaign) => c.state!.characters['jake']!;

describe('undo never silently loses XP (QF.40)', () => {
  it('refuses to undo an evolution that later awards depend on, naming the loss', () => {
    const ctx = testContext();
    const c = run(setup(), ctx);
    expect(jake(c).grade).toBe('F');
    expect(jake(c).classLevel).toBe(7);
    const r = execute(c, { type: 'event.undo', eventId: idOf(c, 'evolution.chosen') }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Jake would lose 900 XP (class 7 → 4)');
      expect(r.error).toContain('Undo those awards first');
    }
  });

  it('allows the same undo once the later award is undone first', () => {
    const ctx = testContext();
    const c = run(setup(), ctx);
    const later = c.events.filter((e) => e.type === 'xp.awarded').at(-1)!.id;
    const undone = run(
      [
        { type: 'event.undo', eventId: later },
        { type: 'event.undo', eventId: idOf(c, 'evolution.chosen') },
      ],
      ctx,
      c,
    );
    expect(jake(undone).grade).toBe('G');
    expect(jake(undone).classLevel).toBe(4);
  });

  it('allows a non-latest undo that loses nothing', () => {
    const ctx = testContext();
    // An earlier event unrelated to progression, with a later award.
    const c = run(
      [
        { type: 'campaign.create', name: 'Whale', rules: rawRules() },
        {
          type: 'character.create',
          id: 'jake',
          name: 'Jake',
          className: 'Archer',
          classSkills: kit,
        },
        { type: 'system.broadcast', text: 'Welcome', characterIds: ['jake'] },
        award(100),
      ],
      ctx,
    );
    const r = execute(c, { type: 'event.undo', eventId: idOf(c, 'system.broadcast') }, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(jake(r.campaign).classLevel).toBe(1);
  });

  it('allows undoing an earlier award when a later one already lost XP at the cap', () => {
    const ctx = testContext();
    // 400 reaches the G top; the next 300 is all lost. Undoing the first award
    // lets the second count (300 → class 3), so nothing more is lost.
    const c = run(
      [
        { type: 'campaign.create', name: 'Whale', rules: rawRules() },
        {
          type: 'character.create',
          id: 'jake',
          name: 'Jake',
          className: 'Archer',
          classSkills: kit,
        },
        award(400),
        award(300),
      ],
      ctx,
    );
    const first = c.events.find((e) => e.type === 'xp.awarded')!.id;
    const r = execute(c, { type: 'event.undo', eventId: first }, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(jake(r.campaign).classLevel).toBe(3);
  });
});
