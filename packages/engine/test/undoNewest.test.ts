import { describe, expect, it } from 'vitest';
import { replay, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// QF.54: undoing the newest event reuses the state it was applied to instead
// of refolding the whole log; the result is exactly what a refold gives.

const setup = (): Command[] => [
  { type: 'campaign.create', name: 'Whale', rules: rawRules() },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'xp.award', track: 'class', amount: 250, participants: [{ characterId: 'jake' }] },
  { type: 'system.broadcast', text: 'to undo', characterIds: null },
];

describe('undo of the newest event (QF.54)', () => {
  it('gives the state before that event, the same as a full replay', () => {
    const ctx = testContext();
    const c = run(setup(), ctx);
    const before = run(setup().slice(0, 3), testContext());
    const last = c.events.at(-1)!;
    const undone = run([{ type: 'event.undo', eventId: last.id }], ctx, c);
    expect(undone.undone[last.id]).toBe(undone.events.at(-1)!.id);
    expect(undone.state).toEqual(before.state);
    expect(undone.state).toEqual(replay(undone.events).state);
  });

  it('reuses the state the newest event was applied to (no refold)', () => {
    const ctx = testContext();
    const three = run(setup().slice(0, 3), ctx);
    const four = run(setup().slice(3), ctx, three);
    const u = run([{ type: 'event.undo', eventId: four.events.at(-1)!.id }], ctx, four);
    expect(u.state).toBe(three.state);
  });

  it('undoes the next newest one too (refold), still matching a replay', () => {
    const ctx = testContext();
    const c = run(setup(), ctx);
    const [award, broadcast] = [c.events.at(-2)!, c.events.at(-1)!];
    const u = run(
      [
        { type: 'event.undo', eventId: broadcast.id },
        { type: 'event.undo', eventId: award.id },
      ],
      ctx,
      c,
    );
    expect(u.state!.characters['jake']!.classLevel).toBe(0);
    expect(u.state).toEqual(replay(u.events).state);
  });

  it('a replayed log (no recorded state) still undoes its newest event', () => {
    const ctx = testContext();
    const c = run(setup(), ctx);
    const loaded = replay(c.events);
    const u = run([{ type: 'event.undo', eventId: loaded.events.at(-1)!.id }], ctx, loaded);
    expect(u.state).toEqual(run(setup().slice(0, 3), testContext()).state);
  });
});
