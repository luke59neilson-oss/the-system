import { describe, expect, it } from 'vitest';
import {
  buildSessionLog,
  execute,
  projectForPlayer,
  renderSessionLog,
  replay,
  sessionEventRange,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

/** Play sessions (M4.3): start/end events, numbering, envelope stamping, report ranges. */

const ctx: CommandContext = { ...testContext('q'), sessionId: null };

function base(): Campaign {
  return run(
    [
      { type: 'campaign.create', name: 'S', rules: rawRules() },
      {
        type: 'character.create',
        id: 'jake',
        name: 'Jake',
        className: 'Archer',
        classSkills: kit,
      } as Command,
    ],
    ctx,
  );
}

function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const r = execute(c, command, context);
  if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
  return r.campaign;
}

function err(c: Campaign, command: Command, context: CommandContext = ctx): string {
  const r = execute(c, command, context);
  if (r.ok) throw new Error(`${command.type} was accepted`);
  return r.error;
}

const last = (c: Campaign) => c.events[c.events.length - 1];
const mark = { type: 'skill.awardMark', characterId: 'jake', skill: 'Basic Archery' } as Command;

describe('play sessions', () => {
  it('numbers sessions, records days and times, and allows one running at a time', () => {
    let c = ok(base(), { type: 'session.start', sessionId: 'a' });
    expect(c.state?.currentSession).toBe('a');
    expect(err(c, { type: 'session.start' })).toMatch('already running');
    c = ok(c, { type: 'campaign.advanceDay', days: 3 });
    c = ok(c, { type: 'session.end' });
    expect(err(c, { type: 'session.end' })).toBe('No session is running');
    c = ok(c, { type: 'session.start' });
    const [one, two] = c.state?.sessions ?? [];
    expect(one).toMatchObject({ id: 'a', number: 1, startDay: 1, endDay: 4 });
    expect(one?.endedAt).toBe(c.events[4]?.timestamp);
    expect(two).toMatchObject({ number: 2, startDay: 4, endedAt: null, endDay: null });
    expect(c.state?.currentSession).toBe(two?.id);
    expect(err(c, { type: 'session.start', sessionId: 'a' })).toMatch('already running');
    c = ok(c, { type: 'session.end' });
    expect(err(c, { type: 'session.start', sessionId: 'a' })).toMatch('already exists');
    expect(replay(JSON.parse(JSON.stringify(c.events)) as unknown[]).state).toEqual(c.state);
  });

  it('stamps events with the running session, and a session start and end with its own id', () => {
    let c = ok(base(), { type: 'campaign.advanceDay' });
    expect(last(c)?.sessionId).toBeNull();
    c = ok(c, { type: 'session.start', sessionId: 'a' });
    expect(last(c)?.sessionId).toBe('a');
    c = ok(c, { type: 'campaign.advanceDay' }, { ...ctx, sessionId: 'stale' });
    expect(last(c)?.sessionId).toBe('a');
    c = ok(c, { type: 'session.end' });
    expect(last(c)).toMatchObject({ type: 'session.ended', sessionId: 'a' });
    c = ok(c, { type: 'campaign.advanceDay' });
    expect(last(c)?.sessionId).toBeNull();
  });

  it('gives marks the running session: one per skill per session', () => {
    let c = base();
    expect(err(c, mark)).toBe('A mark needs a play session');
    c = ok(c, { type: 'session.start', sessionId: 'a' });
    c = ok(c, mark);
    expect(err(c, mark)).toMatch('already earned its mark this session');
    c = ok(c, { type: 'session.end' });
    c = ok(c, { type: 'session.start', sessionId: 'b' });
    c = ok(c, mark);
    const skill = c.state?.characters['jake']?.skills.find((s) => s.name === 'Basic Archery');
    expect(skill?.markSessions).toEqual(['a', 'b']);
  });

  it('is GM-only and never reaches players', () => {
    const c = base();
    const player = { ...ctx, actor: { role: 'player' as const, characterId: 'jake' } };
    expect(err(c, { type: 'session.start' }, player)).toMatch('Not allowed');
    const started = ok(c, { type: 'session.start', sessionId: 'secret-session' });
    expect(err(started, { type: 'session.end' }, player)).toMatch('Not allowed');
    const view = JSON.stringify(projectForPlayer(started.state!, 'jake'));
    expect(view).not.toContain('secret-session');
    expect(view).not.toContain('currentSession');
  });

  it('undoing an end reopens the session; a start cannot be undone while its end counts', () => {
    let c = ok(base(), { type: 'session.start', sessionId: 'a' });
    const startId = last(c)?.id ?? '';
    c = ok(c, { type: 'session.end' });
    const endId = last(c)?.id ?? '';
    expect(err(c, { type: 'event.undo', eventId: startId })).toMatch('depends on it');
    c = ok(c, { type: 'event.undo', eventId: endId });
    expect(c.state?.currentSession).toBe('a');
    expect(c.state?.sessions[0]?.endedAt).toBeNull();
    c = ok(c, { type: 'event.undo', eventId: startId });
    expect(c.state?.sessions).toEqual([]);
    expect(c.state?.currentSession).toBeNull();
    // The number is free again.
    c = ok(c, { type: 'session.start', sessionId: 'b' });
    expect(c.state?.sessions[0]).toMatchObject({ id: 'b', number: 1 });
  });
});

describe('session reports', () => {
  it('finds a session’s range, skipping undone starts and ends', () => {
    let c = ok(base(), { type: 'campaign.advanceDay' });
    expect(sessionEventRange(c, 'a')).toBeNull();
    c = ok(c, { type: 'session.start', sessionId: 'a' });
    const from = c.events.length - 1;
    expect(sessionEventRange(c, 'a')).toEqual({ fromSeq: from, toSeq: null });
    c = ok(c, { type: 'session.end' });
    expect(sessionEventRange(c, 'a')).toEqual({ fromSeq: from, toSeq: from + 2 });
    c = ok(c, { type: 'event.undo', eventId: last(c)?.id ?? '' });
    expect(sessionEventRange(c, 'a')).toEqual({ fromSeq: from, toSeq: null });
    c = ok(c, { type: 'session.end' });
    expect(sessionEventRange(c, 'a')).toEqual({ fromSeq: from, toSeq: c.events.length });
  });

  it('covers only the session’s events, and says whether it runs or ended', () => {
    let c = ok(base(), { type: 'system.broadcast', text: 'Before', characterIds: null });
    c = ok(c, { type: 'session.start', sessionId: 'a' });
    c = ok(c, { type: 'system.broadcast', text: 'During', characterIds: null });
    c = ok(c, { type: 'campaign.advanceDay', days: 2 });
    const running = sessionEventRange(c, 'a');
    const meta = { startedAt: 'x', writtenAt: '2026-10-22T19:00:00.000Z' };
    const s = () => c.state!.sessions[0]!;
    let text = renderSessionLog(buildSessionLog(c, running!.fromSeq), { ...meta, session: s() });
    expect(text).toMatch(/^# Session 1 log \(running\): S$/m);
    expect(text).toContain('- Session still running');
    expect(text).toContain('- In-game days: 1–3');
    expect(text).toContain('Session 1 started (day 1)');
    c = ok(c, { type: 'session.end' });
    c = ok(c, { type: 'system.broadcast', text: 'After', characterIds: null });
    const ended = sessionEventRange(c, 'a')!;
    const log = buildSessionLog(c, ended.fromSeq, undefined, ended.toSeq ?? undefined);
    expect(log.toSeq).toBe(ended.toSeq);
    text = renderSessionLog(log, { ...meta, session: s() });
    expect(text).toMatch(/^# Session 1 report: S$/m);
    expect(text).toContain(`- Session ended: ${s().endedAt}`);
    expect(text).toContain('Session 1 ended (day 3)');
    expect(text).toContain('During');
    expect(text).not.toContain('Before');
    expect(text).not.toContain('After');
    // A session that never changed day says one day.
    let d = ok(base(), { type: 'session.start', sessionId: 'z' });
    d = ok(d, { type: 'session.end' });
    const z = sessionEventRange(d, 'z')!;
    expect(
      renderSessionLog(buildSessionLog(d, z.fromSeq, undefined, z.toSeq ?? undefined), {
        ...meta,
        session: d.state!.sessions[0]!,
      }),
    ).toContain('- In-game day: 1\n');
  });
});
