import { describe, expect, it } from 'vitest';
import {
  buildSessionLog,
  execute,
  notificationsBetween,
  projectForPlayer,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// M4.7: System broadcasts scheduled for a later in-game day.

const setup: Command[] = [
  { type: 'campaign.create', name: 'Schedules', rules: rawRules() },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
];
const ctx = testContext('t');
const base = () => run(setup, ctx);
const step = (c: Campaign, command: Command, context: CommandContext = ctx) => {
  const r = execute(c, command, context);
  if (!r.ok) throw new Error(r.error);
  return r.campaign;
};
const reject = (c: Campaign, command: Command, context: CommandContext = ctx) => {
  const r = execute(c, command, context);
  return r.ok ? 'accepted' : r.error;
};
const schedule = (id: string, day: number, characterIds: string[] | null = null): Command => ({
  type: 'broadcast.schedule',
  id,
  text: `  ${id} text  `,
  characterIds,
  day,
});

describe('broadcast.schedule (M4.7)', () => {
  it('holds a trimmed message until its day, then sends it like a broadcast', () => {
    let c = step(base(), schedule('dawn', 3));
    c = step(c, schedule('whisper', 2, ['kim']));
    expect(c.state!.scheduledBroadcasts.map((b) => [b.id, b.text, b.day])).toEqual([
      ['dawn', 'dawn text', 3],
      ['whisper', 'whisper text', 2],
    ]);
    expect(c.state!.broadcasts).toEqual([]);
    c = step(c, { type: 'campaign.advanceDay' });
    expect(c.state!.broadcasts.map((b) => b.id)).toEqual(['whisper']);
    expect(c.state!.broadcasts[0]!.at).toBe(c.events.at(-1)!.timestamp);
    expect(c.state!.scheduledBroadcasts.map((b) => b.id)).toEqual(['dawn']);
    c = step(c, { type: 'campaign.advanceDay' });
    expect(c.state!.broadcasts.map((b) => b.id)).toEqual(['whisper', 'dawn']);
    expect(c.state!.scheduledBroadcasts).toEqual([]);
  });

  it('a jump of several days sends every due message, earliest day first', () => {
    let c = step(base(), schedule('late', 4));
    c = step(c, schedule('early', 2));
    c = step(c, schedule('far', 9));
    c = step(c, { type: 'campaign.advanceDay', days: 5 });
    expect(c.state!.broadcasts.map((b) => b.id)).toEqual(['early', 'late']);
    expect(c.state!.scheduledBroadcasts.map((b) => b.id)).toEqual(['far']);
  });

  it('can be cancelled; undoing the day takes the sent message back to the schedule', () => {
    let c = step(base(), schedule('a', 2));
    c = step(c, schedule('b', 2));
    c = step(c, { type: 'broadcast.unschedule', id: 'a' });
    expect(c.state!.scheduledBroadcasts.map((b) => b.id)).toEqual(['b']);
    c = step(c, { type: 'campaign.advanceDay' });
    expect(c.state!.broadcasts.map((b) => b.id)).toEqual(['b']);
    c = step(c, { type: 'event.undo', eventId: c.events.at(-1)!.id });
    expect(c.state!.broadcasts).toEqual([]);
    expect(c.state!.scheduledBroadcasts.map((b) => b.id)).toEqual(['b']);
    expect(c.state!.day).toBe(1);
  });

  it('refuses today or earlier, duplicates, unknown or repeated recipients, blanks, and players', () => {
    const c = step(base(), schedule('a', 2));
    expect(reject(c, schedule('x', 1))).toMatch('day');
    const later = step(c, { type: 'campaign.advanceDay' });
    expect(reject(later, schedule('x', 2))).toMatch('day 2 has already begun; send it now instead');
    expect(reject(c, schedule('a', 3))).toMatch('already exists');
    expect(reject(c, schedule('x', 3, ['ghost']))).toMatch('unknown character "ghost"');
    expect(reject(c, schedule('x', 3, ['jake', 'jake']))).toMatch('listed twice');
    expect(reject(c, { ...schedule('x', 3), text: '  ' } as Command)).toMatch('must not be blank');
    expect(reject(c, { type: 'broadcast.unschedule', id: 'nope' })).toMatch(
      'no scheduled broadcast',
    );
    const player: CommandContext = { ...ctx, actor: { role: 'player', characterId: 'jake' } };
    expect(reject(c, schedule('x', 3, ['jake']), player)).not.toBe('accepted');
    expect(reject(c, { type: 'broadcast.unschedule', id: 'a' }, player)).not.toBe('accepted');
    const empty = run([{ type: 'campaign.create', name: 'W', rules: rawRules() }], ctx);
    expect(reject(empty, schedule('x', 2))).toMatch('no one to broadcast');
  });

  it('players see nothing of a schedule until it is sent, then only their own', () => {
    let c = step(base(), schedule('secret-ambush', 2, ['kim']));
    const before = JSON.stringify(projectForPlayer(c.state!, 'kim'));
    expect(before).not.toContain('secret-ambush');
    expect(JSON.stringify(projectForPlayer(c.state!, 'jake'))).not.toContain('secret-ambush');
    const prev = c.state;
    c = step(c, { type: 'campaign.advanceDay' });
    expect(projectForPlayer(c.state!, 'kim').messages.map((m) => m.text)).toEqual([
      'secret-ambush text',
    ]);
    expect(projectForPlayer(c.state!, 'jake').messages).toEqual([]);
    expect(notificationsBetween(prev, c.state, c.events.at(-1))).toEqual([
      { kind: 'broadcast', characterId: 'kim', text: 'secret-ambush text' },
    ]);
  });

  it('sends a message for everyone to every character when it fires', () => {
    let c = step(base(), schedule('all', 2));
    const prev = c.state;
    c = step(c, { type: 'campaign.advanceDay' });
    expect(notificationsBetween(prev, c.state, c.events.at(-1)).map((n) => n.characterId)).toEqual([
      'jake',
      'kim',
    ]);
  });

  it('the session log notes the schedule, the cancellation and the send', () => {
    let c = step(base(), schedule('a', 2, ['kim']));
    c = step(c, schedule('b', 3));
    c = step(c, { type: 'broadcast.unschedule', id: 'b' });
    c = step(c, { type: 'campaign.advanceDay' });
    const text = buildSessionLog(c, 0)
      .entries.map((e) => e.text)
      .join('\n');
    expect(text).toContain('System message scheduled for day 2 to Kim: a text');
    expect(text).toContain('Scheduled System message cancelled: b text');
    expect(text).toContain('Scheduled System message to Kim: a text');
  });
});
