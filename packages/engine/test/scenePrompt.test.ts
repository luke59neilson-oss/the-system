import { describe, expect, it } from 'vitest';
import { execute, projectForPlayer, replay, type Campaign, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// MT.9 (Q63): "End scene" asks each player what they practised.

const setup: Command[] = [
  { type: 'campaign.create', name: 'C', rules: rawRules() },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'mira', name: 'Mira', className: 'Archer', classSkills: kit },
];

const asPlayer = (c: Campaign, command: Command, characterId: string) =>
  execute(c, command, { ...testContext('p'), actor: { role: 'player', characterId } });

describe('end-of-scene prompt (MT.9)', () => {
  it('asks the whole party by default; each player answers for themselves', () => {
    const c = run([...setup, { type: 'scene.end', sceneId: 'sc1' }]);
    expect(c.state!.scenePrompt).toMatchObject({ id: 'sc1', pending: ['jake', 'mira'] });
    const other = asPlayer(
      c,
      { type: 'scene.answer', sceneId: 'sc1', characterId: 'mira' },
      'jake',
    );
    expect(other.ok).toBe(false);
    const own = asPlayer(c, { type: 'scene.answer', sceneId: 'sc1', characterId: 'jake' }, 'jake');
    if (!own.ok) throw new Error(own.error);
    expect(own.campaign.state!.scenePrompt?.pending).toEqual(['mira']);
    expect(projectForPlayer(own.campaign.state!, 'jake').scenePrompt).toBeNull();
    expect(projectForPlayer(own.campaign.state!, 'mira').scenePrompt).toEqual({ id: 'sc1' });
    expect(JSON.stringify(projectForPlayer(own.campaign.state!, 'mira'))).not.toContain('pending');
    const done = run(
      [{ type: 'scene.answer', sceneId: 'sc1', characterId: 'mira' }],
      testContext('g'),
      own.campaign,
    );
    expect(done.state!.scenePrompt).toBeNull();
  });

  const ctx = testContext('t');
  const gm = (c: Campaign, command: Command) => execute(c, command, ctx);
  const ok = (c: Campaign, command: Command): Campaign => {
    const r = gm(c, command);
    if (!r.ok) throw new Error(r.error);
    return r.campaign;
  };
  const err = (c: Campaign, command: Command): string => {
    const r = gm(c, command);
    expect(r.ok).toBe(false);
    return r.ok ? '' : r.error;
  };
  const lastId = (c: Campaign) => c.events[c.events.length - 1]!.id;
  const base = () => run(setup, ctx);

  it('refuses a stale scene id, a second answer and an unknown character', () => {
    let c = ok(base(), { type: 'scene.end', sceneId: 'sc1' });
    c = ok(c, { type: 'scene.end', sceneId: 'sc2' });
    expect(c.state!.scenePrompt).toMatchObject({ id: 'sc2', pending: ['jake', 'mira'] });
    expect(err(c, { type: 'scene.answer', sceneId: 'sc1', characterId: 'jake' })).toMatch(
      /scene prompt is closed/,
    );
    c = ok(c, { type: 'scene.answer', sceneId: 'sc2', characterId: 'jake' });
    expect(err(c, { type: 'scene.answer', sceneId: 'sc2', characterId: 'jake' })).toMatch(
      /already answered/,
    );
    expect(err(c, { type: 'scene.answer', sceneId: 'sc2', characterId: 'nobody' })).toMatch(
      /unknown character "nobody"/,
    );
    expect(err(c, { type: 'scene.end', sceneId: 'sc2' })).toMatch(/scene "sc2" already exists/);
    expect(err(base(), { type: 'scene.answer', sceneId: 'sc1', characterId: 'jake' })).toMatch(
      /scene prompt is closed/,
    );
  });

  it('asks only the named characters, in party order; refuses empty or unknown lists', () => {
    const c = ok(base(), { type: 'scene.end', sceneId: 'sc1', characterIds: ['mira'] });
    expect(c.state!.scenePrompt?.pending).toEqual(['mira']);
    expect(projectForPlayer(c.state!, 'jake').scenePrompt).toBeNull();
    const both = ok(base(), { type: 'scene.end', characterIds: ['mira', 'jake', 'mira'] });
    expect(both.state!.scenePrompt?.pending).toEqual(['jake', 'mira']);
    expect(err(base(), { type: 'scene.end', characterIds: [] })).toMatch(/needs a character/);
    expect(err(base(), { type: 'scene.end', characterIds: ['ghost'] })).toMatch(
      /unknown character "ghost"/,
    );
  });

  it('undoes an end and an answer; replay gives the same state', () => {
    const ended = ok(base(), { type: 'scene.end', sceneId: 'sc1' });
    const undoneEnd = ok(ended, { type: 'event.undo', eventId: lastId(ended) });
    expect(undoneEnd.state!.scenePrompt ?? null).toBeNull();
    const answered = ok(ended, { type: 'scene.answer', sceneId: 'sc1', characterId: 'jake' });
    const undoneAnswer = ok(answered, { type: 'event.undo', eventId: lastId(answered) });
    expect(undoneAnswer.state!.scenePrompt?.pending).toEqual(['jake', 'mira']);
    expect(projectForPlayer(undoneAnswer.state!, 'jake').scenePrompt).toEqual({ id: 'sc1' });
    expect(replay(undoneAnswer.events).state).toEqual(undoneAnswer.state);
    expect(replay(undoneEnd.events).state).toEqual(undoneEnd.state);
  });

  it('refuses a stored player answer for another character on replay', () => {
    const ended = ok(base(), { type: 'scene.end', sceneId: 'sc1' });
    const own = asPlayer(
      ended,
      { type: 'scene.answer', sceneId: 'sc1', characterId: 'jake' },
      'jake',
    );
    if (!own.ok) throw new Error(own.error);
    const forged = own.campaign.events.map((e, i, all) =>
      i === all.length - 1 ? { ...e, payload: { ...e.payload, characterId: 'mira' } } : e,
    );
    expect(() => replay(forged)).toThrow(/only act on their own character/);
    expect(replay(own.campaign.events).state).toEqual(own.campaign.state);
  });

  // QF.48 (D287): End session closes the open prompt; an answer after it is
  // refused, so it can never be stored with no session.
  describe('End session closes the scene prompt (QF.48)', () => {
    const played = () =>
      run([
        ...setup,
        { type: 'session.start', sessionId: 's1' },
        { type: 'scene.end', sceneId: 'sc1' },
        { type: 'session.end' },
      ]);

    it('closes it and refuses a later answer', () => {
      const c = played();
      expect(c.state!.scenePrompt).toBeNull();
      expect(projectForPlayer(c.state!, 'jake')).toMatchObject({
        scenePrompt: null,
        sessionRunning: false,
      });
      const late = asPlayer(
        c,
        { type: 'scene.answer', sceneId: 'sc1', characterId: 'jake' },
        'jake',
      );
      expect(late.ok).toBe(false);
      expect(late.ok ? '' : late.error).toMatch(/the scene is over/);
      expect(c.events.find((e) => e.type === 'session.ended')?.schemaVersion).toBe(2);
    });

    it('a v1 session.ended (before QF.48) replays with the prompt left open', () => {
      type Raw = { type: string; schemaVersion: number; payload: Record<string, unknown> };
      const events = (JSON.parse(JSON.stringify(played().events)) as Raw[]).map((e) =>
        e.type === 'session.ended' ? { ...e, schemaVersion: 1 } : e,
      );
      expect(replay(events).state!.scenePrompt).toMatchObject({ id: 'sc1' });
      expect(
        replay(
          events.map((e) => ({
            ...e,
            schemaVersion: e.type === 'session.ended' ? 2 : e.schemaVersion,
          })),
        ).state!.scenePrompt,
      ).toBeNull();
    });
  });
});
