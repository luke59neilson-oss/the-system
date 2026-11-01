import { describe, expect, it } from 'vitest';
import { execute, projectForPlayer, replay, type Campaign, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// MK.2 (DESIGN §7 "Dice"): the GM asks a player's phone for a d20; the player
// answers with a die thrown at the table or one the app rolls.

const d20Rules = () => {
  const r = rawRules() as { resolution: Record<string, unknown> };
  r.resolution['rolls'] = 'd20';
  return r;
};

const setup: Command[] = [
  { type: 'campaign.create', name: 'C', rules: d20Rules() },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'mira', name: 'Mira', className: 'Archer', classSkills: kit },
];

let calls = 0;
const asPlayer = (c: Campaign, command: Command, characterId: string, random?: () => number) =>
  execute(c, command, {
    ...testContext(`p${++calls}x`),
    actor: { role: 'player', characterId },
    ...(random ? { random } : {}),
  });

const okOf = (r: ReturnType<typeof execute>): Campaign => {
  if (!r.ok) throw new Error(r.error);
  return r.campaign;
};

const request: Command = {
  type: 'roll.request',
  characterId: 'jake',
  stat: 'perception',
  requestId: 'r1',
};

describe('d20 roll requests (MK.2)', () => {
  it('reaches only the asked player, with the stat and no answer yet', () => {
    const c = run([...setup, request]);
    expect(c.state!.rollRequests?.['jake']).toMatchObject({ id: 'r1', stat: 'perception' });
    const jake = projectForPlayer(c.state!, 'jake');
    expect(jake.rollRequest).toEqual({ id: 'r1', stat: 'perception', answer: null });
    expect(jake.me.rollModifiers?.['perception']).toBe(0);
    expect(projectForPlayer(c.state!, 'mira').rollRequest).toBeNull();
    expect(JSON.stringify(projectForPlayer(c.state!, 'mira'))).not.toContain('r1');
  });

  it('takes a typed die from the player, marked typed', () => {
    const c = okOf(
      asPlayer(
        run([...setup, request]),
        { type: 'roll.answer', characterId: 'jake', requestId: 'r1', die: 17 },
        'jake',
      ),
    );
    expect(c.state!.rollRequests?.['jake']?.answer).toEqual({ die: 17, how: 'typed' });
    expect(projectForPlayer(c.state!, 'jake').rollRequest?.answer).toEqual({
      die: 17,
      how: 'typed',
    });
  });

  it('rolls with the injected random source when no die is typed, marked app', () => {
    const c = okOf(
      asPlayer(
        run([...setup, request]),
        { type: 'roll.answer', characterId: 'jake', requestId: 'r1' },
        'jake',
        () => 0.5,
      ),
    );
    expect(c.state!.rollRequests?.['jake']?.answer).toEqual({ die: 11, how: 'app' });
    // The rolled die is in the event, so replay gives the same answer.
    expect(replay(c.events).state!.rollRequests?.['jake']?.answer).toEqual({ die: 11, how: 'app' });
  });

  it('refuses a die outside 1–20, another player, a stale request and a second answer', () => {
    const c = run([...setup, request]);
    const answer = (die: number | undefined, as = 'jake', requestId = 'r1') =>
      asPlayer(c, { type: 'roll.answer', characterId: 'jake', requestId, die }, as, () => 0.1);
    for (const bad of [0, 21, 2.5]) {
      const r = answer(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/1 to 20/);
    }
    expect(answer(5, 'mira').ok).toBe(false);
    const stale = answer(5, 'jake', 'old');
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error).toMatch(/closed/);
    const once = okOf(answer(5));
    const twice = asPlayer(
      once,
      { type: 'roll.answer', characterId: 'jake', requestId: 'r1', die: 6 },
      'jake',
    );
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error).toMatch(/already been answered/);
  });

  it('lets the GM answer for a player, replace a request and clear it; players cannot ask', () => {
    let c = run([...setup, request]);
    c = okOf(
      execute(
        c,
        { type: 'roll.answer', characterId: 'jake', requestId: 'r1', die: 3 },
        testContext('g'),
      ),
    );
    expect(c.state!.rollRequests?.['jake']?.answer).toEqual({ die: 3, how: 'typed' });
    c = run(
      [{ type: 'roll.request', characterId: 'jake', stat: 'agility', requestId: 'r2' }],
      testContext('h'),
      c,
    );
    expect(c.state!.rollRequests?.['jake']).toMatchObject({
      id: 'r2',
      stat: 'agility',
      answer: null,
    });
    c = run([{ type: 'roll.clear', characterId: 'jake', requestId: 'r2' }], testContext('i'), c);
    expect(c.state!.rollRequests?.['jake']).toBeUndefined();
    expect(projectForPlayer(c.state!, 'jake').rollRequest).toBeNull();
    const asked = asPlayer(
      c,
      { type: 'roll.request', characterId: 'jake', stat: 'perception' },
      'jake',
    );
    expect(asked.ok).toBe(false);
  });

  it('carries the contest modifier to its player, and nothing when there is none (QF.71)', () => {
    const c = run([...setup, { ...request, modifier: -5 } as Command]);
    expect(projectForPlayer(c.state!, 'jake').rollRequest?.modifier).toBe(-5);
    const plain = run([...setup, request]);
    expect(projectForPlayer(plain.state!, 'jake').rollRequest).not.toHaveProperty('modifier');
  });

  it('refuses an unknown stat or character', () => {
    const base = run(setup);
    expect(
      execute(base, { type: 'roll.request', characterId: 'jake', stat: 'luck' }, testContext('x'))
        .ok,
    ).toBe(false);
    expect(
      execute(
        base,
        { type: 'roll.request', characterId: 'nobody', stat: 'agility' },
        testContext('x'),
      ).ok,
    ).toBe(false);
  });
  it('refuses a request while rolls are app odds (review M3)', () => {
    const base = run([
      { type: 'campaign.create', name: 'C', rules: rawRules() },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
    ]);
    const r = execute(base, request, testContext('x'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/d20/);
  });

  it('a switch to app odds closes open requests; the phone stops asking (review M3)', () => {
    let c = run([...setup, request]);
    expect(projectForPlayer(c.state!, 'jake').rollRequest).not.toBeNull();
    c = run([{ type: 'rules.set', rules: rawRules() }], testContext('o'), c);
    expect(c.state!.rollRequests).toEqual({});
    expect(projectForPlayer(c.state!, 'jake').rollRequest).toBeNull();
    expect(replay(c.events).state!.rollRequests).toEqual({});
    // Back on d20, nothing old reappears.
    c = run([{ type: 'rules.set', rules: d20Rules() }], testContext('p'), c);
    expect(projectForPlayer(c.state!, 'jake').rollRequest).toBeNull();
  });
});
