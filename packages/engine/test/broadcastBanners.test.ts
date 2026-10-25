import { describe, expect, it } from 'vitest';
import { execute, projectForPlayer, replay, type Campaign, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// MT.6 (Q60, DESIGN §7 Broadcasts): a broadcast can also show as a banner for
// a set time or pinned until the GM removes it; sending stays immediate.

const ctx = testContext('b');
const start = (): Campaign =>
  run(
    [
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
      { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
    ],
    ctx,
  );
const ok = (c: Campaign, command: Command): Campaign => {
  const r = execute(c, command, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.campaign;
};
const err = (c: Campaign, command: Command): string => {
  const r = execute(c, command, ctx);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error;
};
const lastId = (c: Campaign) => c.events[c.events.length - 1]!.id;

describe('broadcast banners (MT.6)', () => {
  it('a timed or pinned broadcast reaches its players with its display', () => {
    let c = ok(start(), {
      type: 'system.broadcast',
      text: 'The Host stirs.',
      display: { mode: 'timed', seconds: 30 },
    });
    c = ok(c, {
      type: 'system.broadcast',
      text: 'Kim only, pinned.',
      characterIds: ['kim'],
      display: { mode: 'pinned' },
    });
    c = ok(c, { type: 'system.broadcast', text: 'List only.' });
    const jake = projectForPlayer(c.state!, 'jake').messages;
    expect(jake.map((m) => [m.text, m.display ?? null])).toEqual([
      ['The Host stirs.', { mode: 'timed', seconds: 30 }],
      ['List only.', null],
    ]);
    const kim = projectForPlayer(c.state!, 'kim').messages;
    expect(kim[1]).toMatchObject({ text: 'Kim only, pinned.', display: { mode: 'pinned' } });
    expect(JSON.stringify(projectForPlayer(c.state!, 'jake'))).not.toContain('Kim only');
  });

  it('the GM removes a banner; the message stays; undo brings the banner back', () => {
    let c = ok(start(), { type: 'system.broadcast', text: 'Pinned.', display: { mode: 'pinned' } });
    const id = lastId(c);
    c = ok(c, { type: 'broadcast.remove', id });
    const msg = projectForPlayer(c.state!, 'jake').messages[0]!;
    expect(msg).toMatchObject({ text: 'Pinned.', removed: true });
    expect(err(c, { type: 'broadcast.remove', id })).toMatch(/already removed/);
    const undone = ok(c, { type: 'event.undo', eventId: lastId(c) });
    expect(projectForPlayer(undone.state!, 'jake').messages[0]!.removed).toBeUndefined();
    expect(replay(c.events).state).toEqual(c.state);
  });

  it('refuses a bad display, a removal of a list-only message, and players', () => {
    const c = ok(start(), { type: 'system.broadcast', text: 'Plain.' });
    expect(err(c, { type: 'broadcast.remove', id: lastId(c) })).toMatch(/no banner/);
    expect(err(c, { type: 'broadcast.remove', id: 'nope' })).toMatch(/no broadcast nope/);
    expect(
      err(c, { type: 'system.broadcast', text: 'x', display: { mode: 'timed', seconds: 2 } }),
    ).toMatch(/seconds/);
    const player = execute(
      c,
      { type: 'broadcast.remove', id: lastId(c) },
      { ...ctx, actor: { role: 'player', characterId: 'jake' } },
    );
    expect(player.ok).toBe(false);
  });
});
