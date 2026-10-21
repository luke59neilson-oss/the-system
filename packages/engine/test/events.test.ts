import { describe, expect, it } from 'vitest';
import {
  EVENT_SCHEMA_VERSIONS,
  EVENT_TYPES,
  EventRejectedError,
  PLAYER_COMMANDS,
  appendEvent,
  authorize,
  applyEvent,
  emptyCampaign,
  execute,
  parseEvent,
  parseEventLines,
  replay,
  type Campaign,
  type Character,
  type Command,
  type CommandContext,
  type DomainEvent,
} from '../src';
import {
  deepFreeze,
  kit,
  randomCommand,
  rawRules,
  run,
  seededRandom,
  testContext,
} from './helpers/events';

const created: Command = { type: 'campaign.create', name: 'Whale', rules: rawRules() };
const jake: Command = {
  type: 'character.create',
  id: 'jake',
  name: 'Jake',
  className: 'Archer',
  classSkills: kit,
};
const base = () => run([created, jake]);

const reject = (campaign: Campaign, command: Command, ctx = testContext('x')) => {
  const result = execute(campaign, command, ctx);
  expect(result.ok).toBe(false);
  return result.ok ? '' : result.error;
};

const last = (c: Campaign) => c.events[c.events.length - 1] as DomainEvent;

const rawEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  type: 'character.renamed',
  timestamp: '2026-10-21T12:00:00.000Z',
  actor: { role: 'gm' },
  sessionId: null,
  schemaVersion: 1,
  payload: { characterId: 'jake', name: 'J' },
  ...overrides,
});

describe('event envelope', () => {
  it('stamps id, timestamp, actor, sessionId and schemaVersion from the context', () => {
    const c = base();
    expect(c.events.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(last(c)).toMatchObject({
      type: 'character.created',
      timestamp: '2026-10-21T12:00:01.000Z',
      actor: { role: 'gm' },
      sessionId: 's1',
      schemaVersion: EVENT_SCHEMA_VERSIONS['character.created'],
    });
  });

  it('generates a character id when the command has none', () => {
    const c = run([created, { ...jake, id: undefined }]);
    expect(c.state?.characterOrder).toEqual(['e2']);
  });

  it.each([
    [{ id: '' }, 'id'],
    [{ timestamp: 'yesterday' }, 'timestamp'],
    [{ timestamp: '2026-10-21T12:00:00+02:00' }, 'timestamp'],
    [{ actor: { role: 'player' } }, 'actor'],
    [{ actor: { role: 'god' } }, 'actor'],
    [{ schemaVersion: 0 }, 'schemaVersion'],
    [{ extra: true }, 'extra'],
  ])('rejects a bad envelope %j', (overrides, field) => {
    expect(() => parseEvent(rawEvent(overrides))).toThrow(new RegExp(`Bad event: .*${field}`));
  });

  it('rejects unknown types and bad payloads with readable reasons', () => {
    expect(() => parseEvent(rawEvent({ type: 'character.deleted' }))).toThrow(
      'unknown type "character.deleted"',
    );
    expect(() => parseEvent(rawEvent({ payload: { characterId: 'jake', name: '  ' } }))).toThrow(
      /bad character.renamed payload: name: must not be blank/,
    );
    expect(() => parseEvent(rawEvent({ payload: { characterId: 'jake' } }))).toThrow(/name/);
    expect(() => parseEvent(null)).toThrow(EventRejectedError);
  });

  it('trims names in payloads', () => {
    const event = parseEvent(rawEvent({ payload: { characterId: 'jake', name: '  Jay ' } }));
    expect(event.payload).toEqual({ characterId: 'jake', name: 'Jay' });
  });

  it('upcasts old payload versions in order, then validates', () => {
    const versions = { ...EVENT_SCHEMA_VERSIONS, 'character.renamed': 3 };
    const upcasters = {
      'character.renamed': {
        1: (p: unknown) => {
          const { title, ...rest } = p as { title: string };
          return { ...rest, label: title };
        },
        2: (p: unknown) => {
          const { label, ...rest } = p as { label: string };
          return { ...rest, name: label };
        },
      },
    };
    const old = rawEvent({ payload: { characterId: 'jake', title: 'Old Jake' } });
    const event = parseEvent(old, upcasters, versions);
    expect(event.schemaVersion).toBe(3);
    expect(event.payload).toEqual({ characterId: 'jake', name: 'Old Jake' });
  });

  it('upcasts through replay', () => {
    const versions = { ...EVENT_SCHEMA_VERSIONS, 'character.renamed': 2 };
    const upcasters = {
      'character.renamed': {
        1: (p: unknown) => {
          const { title, ...rest } = p as { title: string };
          return { ...rest, name: title };
        },
      },
    };
    const raw = JSON.parse(JSON.stringify(base().events)) as unknown[];
    raw.push(rawEvent({ payload: { characterId: 'jake', title: 'Hunter' } }));
    const c = replay(raw, { upcasters, versions });
    expect(c.state?.characters['jake']?.name).toBe('Hunter');
  });

  it('rejects missing upcasters, failing upcasters and versions from the future', () => {
    const versions = { ...EVENT_SCHEMA_VERSIONS, 'character.renamed': 2 };
    expect(() => parseEvent(rawEvent(), {}, versions)).toThrow(
      'no upcaster for character.renamed v1 → v2',
    );
    const throwing = {
      'character.renamed': {
        1: () => {
          throw new Error('boom');
        },
      },
    };
    expect(() => parseEvent(rawEvent(), throwing, versions)).toThrow(/v1 failed: boom/);
    expect(() => parseEvent(rawEvent({ schemaVersion: 9 }))).toThrow(/newer than this app/);
  });
});

describe('commands and the reducer', () => {
  it('creates a campaign with parsed rules and a character with Identify', () => {
    const state = base().state;
    expect(state?.name).toBe('Whale');
    expect(state?.rules.configVersion).toBe(1);
    expect(state?.characters['jake']?.skills.map((s) => s.name)).toContain('Identify');
  });

  it('rejects a second campaign, events before the campaign, and invalid rules', () => {
    expect(reject(base(), created)).toMatch('already exists');
    expect(reject(emptyCampaign(), jake)).toMatch('must start with campaign.created');
    expect(reject(emptyCampaign(), { ...created, rules: { configVersion: 1 } })).toMatch(
      'invalid rules',
    );
  });

  it('rejects duplicate characters and character rule violations', () => {
    expect(reject(base(), jake)).toMatch('character "jake" already exists');
    expect(reject(base(), { ...jake, id: 'b', classSkills: kit.slice(0, 2) })).toMatch(
      'exactly 3 skills',
    );
  });

  it('renames, grants professions only from E-grade, sets pools and stats', () => {
    const c = run(
      [{ type: 'character.rename', characterId: 'jake', name: 'Jay' }],
      testContext('a'),
      base(),
    );
    expect(c.state?.characters['jake']?.name).toBe('Jay');
    expect(
      reject(c, { type: 'character.grantProfession', characterId: 'jake', profession: 'Smith' }),
    ).toMatch('Professions unlock at E-grade');
    const pools = run(
      [
        {
          type: 'character.setPools',
          characterId: 'jake',
          pools: { hp: 40, stamina: 0 },
        },
      ],
      testContext('a'),
      base(),
    );
    expect(pools.state?.characters['jake']?.pools).toEqual({ hp: 40, mp: 100, stamina: 0 });
    expect(
      reject(base(), { type: 'character.setPools', characterId: 'jake', pools: { mp: 101 } }),
    ).toMatch('mp must be between 0 and 100');
    expect(
      reject(base(), { type: 'character.setPools', characterId: 'jake', pools: { hp: -1 } }),
    ).toMatch('hp must be between 0 and 100');
    const stats = run(
      [{ type: 'character.setStats', characterId: 'jake', stats: { vitality: 5 } }],
      testContext('a'),
      base(),
    );
    expect(stats.state?.characters['jake']?.stats['vitality']).toBe(5);
    expect(stats.state?.characters['jake']?.pools['hp']).toBe(50);
  });

  it('grants a profession once the character is at E-grade', () => {
    const c = base();
    const state = c.state;
    if (!state) throw new Error('no state');
    const atE = {
      ...state,
      characters: {
        jake: { ...(state.characters['jake'] as Character), grade: 'E', classLevel: 20 },
      },
    };
    const event = parseEvent(
      rawEvent({
        type: 'character.professionGranted',
        payload: { characterId: 'jake', profession: 'Smith' },
      }),
    );
    const next = applyEvent(atE, event);
    expect(next.characters['jake']).toMatchObject({ profession: 'Smith', professionLevel: 20 });
  });

  it('rejects unknown characters, pools and stats', () => {
    const c = base();
    expect(reject(c, { type: 'character.rename', characterId: 'nobody', name: 'X' })).toMatch(
      'unknown character "nobody"',
    );
    expect(reject(c, { type: 'character.rename', characterId: 'toString', name: 'X' })).toMatch(
      'unknown character',
    );
    expect(
      reject(c, { type: 'character.setPools', characterId: 'jake', pools: { luck: 1 } }),
    ).toMatch('unknown pool "luck"');
    expect(
      reject(c, { type: 'character.setStats', characterId: 'jake', stats: { luck: 1 } }),
    ).toMatch('unknown stat "luck"');
    expect(
      reject(c, { type: 'character.setStats', characterId: 'jake', stats: { vitality: -1 } }),
    ).toMatch('stats');
    expect(
      reject(c, { type: 'character.setStats', characterId: 'jake', stats: { vitality: 1.5 } }),
    ).toMatch('stats');
  });

  it('rejects a duplicate event id and leaves the campaign untouched', () => {
    const c = base();
    expect(() => appendEvent(c, c.events[1] as DomainEvent)).toThrow('duplicate event id');
    expect(c.events).toHaveLength(2);
  });

  it('does not apply event.undone in the reducer', () => {
    const undo = parseEvent(rawEvent({ type: 'event.undone', payload: { eventId: 'e2' } }));
    expect(() => applyEvent(base().state, undo)).toThrow('applied by the event log');
  });

  it('never mutates the previous state', () => {
    const c = deepFreeze(base());
    const snapshot = JSON.stringify(c);
    run(
      [
        { type: 'character.rename', characterId: 'jake', name: 'Jay' },
        { type: 'character.setStats', characterId: 'jake', stats: { vitality: 20 } },
        { type: 'character.setPools', characterId: 'jake', pools: { hp: 1 } },
        { type: 'event.undo', eventId: 'm1' },
      ],
      testContext('m'),
      c,
    );
    expect(JSON.stringify(c)).toBe(snapshot);
  });
});

describe('system.broadcast', () => {
  it('records a trimmed message to everyone or to listed characters in state.broadcasts', () => {
    const before = base();
    const all = run(
      [{ type: 'system.broadcast', text: '  The world is dying.  ' }],
      testContext('a'),
      before,
    );
    expect(last(all)).toMatchObject({
      type: 'system.broadcast',
      payload: { text: 'The world is dying.', characterIds: null },
    });
    expect(all.state).toEqual({
      ...before.state,
      broadcasts: [
        {
          id: last(all).id,
          at: last(all).timestamp,
          text: 'The world is dying.',
          characterIds: null,
        },
      ],
    });
    const one = run(
      [{ type: 'system.broadcast', text: 'Only you', characterIds: ['jake'] }],
      testContext('a'),
      before,
    );
    expect(last(one).payload).toEqual({ text: 'Only you', characterIds: ['jake'] });
  });

  it('rejects blank or overlong text, unknown or repeated recipients, an empty list, and players', () => {
    const c = base();
    expect(reject(c, { type: 'system.broadcast', text: '   ' })).toMatch('must not be blank');
    expect(reject(c, { type: 'system.broadcast', text: 'x'.repeat(2001) })).toMatch('2000');
    expect(reject(c, { type: 'system.broadcast', text: 'a', characterIds: ['ghost'] })).toMatch(
      'unknown character "ghost"',
    );
    expect(
      reject(c, { type: 'system.broadcast', text: 'a', characterIds: ['jake', 'jake'] }),
    ).toMatch('listed twice');
    expect(reject(c, { type: 'system.broadcast', text: 'a', characterIds: [] })).toMatch(
      'characterIds',
    );
    const player: CommandContext = {
      ...testContext('p'),
      actor: { role: 'player', characterId: 'jake' },
    };
    const result = execute(
      c,
      { type: 'system.broadcast', text: 'a', characterIds: ['jake'] },
      player,
    );
    expect(result.ok).toBe(false);
  });

  it('cannot broadcast to everyone before any character exists', () => {
    const c = run([{ type: 'campaign.create', name: 'W', rules: rawRules() }]);
    expect(reject(c, { type: 'system.broadcast', text: 'Hello?' })).toMatch('no one to broadcast');
  });

  it('pins a recipient: undoing their creation is refused while the broadcast stands', () => {
    const c = run(
      [
        { ...jake, id: 'kim', name: 'Kim' },
        { type: 'system.broadcast', text: 'Kim!', characterIds: ['kim'] },
      ],
      testContext('a'),
      base(),
    );
    expect(reject(c, { type: 'event.undo', eventId: 'a1' })).toMatch('cannot undo a1');
  });
});

describe('undo', () => {
  const undoLatest = (c: Campaign) =>
    run([{ type: 'event.undo', eventId: last(c).id }], testContext('u'), c);

  const cases: [string, Command][] = [
    ['character.created', { ...jake, id: 'kim', name: 'Kim' }],
    ['character.renamed', { type: 'character.rename', characterId: 'jake', name: 'Jay' }],
    ['character.poolsSet', { type: 'character.setPools', characterId: 'jake', pools: { hp: 3 } }],
    [
      'character.statsSet',
      { type: 'character.setStats', characterId: 'jake', stats: { vitality: 30 } },
    ],
    [
      'xp.awarded',
      {
        type: 'xp.award',
        track: 'class',
        amount: 450,
        enemyLevel: 3,
        participants: [{ characterId: 'jake' }],
      },
    ],
  ];

  it.each(cases)('undoing the latest %s restores the previous state', (_type, command) => {
    const before = base();
    const after = run([command], testContext('a'), before);
    expect(after.state).not.toEqual(before.state);
    const undone = undoLatest(after);
    expect(undone.state).toEqual(before.state);
    expect(undone.events).toHaveLength(after.events.length + 1);
    expect(last(undone)).toMatchObject({
      type: 'event.undone',
      payload: { eventId: last(after).id },
    });
    expect(undone.undone).toEqual({ [last(after).id]: last(undone).id });
  });

  it('undoing a broadcast removes it from state', () => {
    const before = base();
    const after = run(
      [{ type: 'system.broadcast', text: 'Hi', characterIds: null }],
      testContext('a'),
      before,
    );
    expect(after.state?.broadcasts).toHaveLength(1);
    const undone = undoLatest(after);
    expect(undone.state).toEqual(before.state);
    expect(undone.undone).toEqual({ [last(after).id]: last(undone).id });
  });

  it('undoing the latest character.professionGranted removes the profession', () => {
    // No event reaches E-grade until evolutions (M1.10), so start from a state
    // placed at E-grade; undo then refolds the real log without the grant.
    const c = base();
    const state = c.state;
    if (!state) throw new Error('no state');
    const jakeState = state.characters['jake'];
    if (!jakeState) throw new Error('no jake');
    const atE: Campaign = {
      ...c,
      state: { ...state, characters: { jake: { ...jakeState, grade: 'E', classLevel: 20 } } },
    };
    const granted = run(
      [{ type: 'character.grantProfession', characterId: 'jake', profession: 'Smith' }],
      testContext('a'),
      atE,
    );
    expect(granted.state?.characters['jake']?.profession).toBe('Smith');
    const undone = undoLatest(granted);
    expect(undone.state?.characters['jake']?.profession).toBeNull();
    expect(undone.state).toEqual(c.state);
  });

  it('allows undoing a non-latest event when later events still apply', () => {
    const c = run(
      [
        { type: 'character.rename', characterId: 'jake', name: 'Jay' },
        { type: 'character.setPools', characterId: 'jake', pools: { hp: 7 } },
      ],
      testContext('a'),
      base(),
    );
    const undone = run([{ type: 'event.undo', eventId: 'a1' }], testContext('u'), c);
    expect(undone.state?.characters['jake']).toMatchObject({ name: 'Jake', pools: { hp: 7 } });
  });

  it('rejects an undo that would change what a later event meant (stats then pools)', () => {
    const c = run(
      [
        { type: 'character.setStats', characterId: 'jake', stats: { vitality: 50 } },
        { type: 'character.setPools', characterId: 'jake', pools: { hp: 400 } },
      ],
      testContext('a'),
      base(),
    );
    expect(c.state?.characters['jake']?.pools['hp']).toBe(400);
    expect(reject(c, { type: 'event.undo', eventId: 'a1' })).toMatch(
      /cannot undo a1 .*hp must be between 0 and 100/,
    );
  });

  it('lowering a stat clamps current pools to the new maximum', () => {
    const c = run(
      [{ type: 'character.setStats', characterId: 'jake', stats: { vitality: 4 } }],
      testContext('a'),
      base(),
    );
    expect(c.state?.characters['jake']?.pools['hp']).toBe(40);
  });

  it('a character id can be reused once its creation is undone', () => {
    const c = run(
      [
        { ...jake, id: 'kim', name: 'Kim' },
        { type: 'event.undo', eventId: 'a1' },
        { ...jake, id: 'kim', name: 'Kim Two' },
      ],
      testContext('a'),
      base(),
    );
    expect(c.state?.characterOrder).toEqual(['jake', 'kim']);
    expect(c.state?.characters['kim']?.name).toBe('Kim Two');
    expect(replay(JSON.parse(JSON.stringify(c.events)) as unknown[])).toEqual(c);
  });

  it('rejects undoing a non-latest event when a later event depends on it', () => {
    const c = run(
      [
        { ...jake, id: 'kim', name: 'Kim' },
        { type: 'character.rename', characterId: 'kim', name: 'Kimberly' },
      ],
      testContext('a'),
      base(),
    );
    const error = reject(c, { type: 'event.undo', eventId: 'a1' });
    expect(error).toMatch('cannot undo a1 (character.created) because a later event depends on it');
    expect(error).toMatch('unknown character "kim"');
  });

  it('allows the dependent undo once the later event is undone first', () => {
    const c = run(
      [
        { ...jake, id: 'kim', name: 'Kim' },
        { type: 'character.rename', characterId: 'kim', name: 'Kimberly' },
        { type: 'event.undo', eventId: 'a2' },
        { type: 'event.undo', eventId: 'a1' },
      ],
      testContext('a'),
      base(),
    );
    expect(c.state).toEqual(base().state);
  });

  it('rejects undoing an undo, the campaign, an undone event, and unknown events', () => {
    const c = run(
      [
        { type: 'character.rename', characterId: 'jake', name: 'Jay' },
        { type: 'event.undo', eventId: 'a1' },
      ],
      testContext('a'),
      base(),
    );
    expect(reject(c, { type: 'event.undo', eventId: 'a2' })).toMatch('an undo cannot be undone');
    expect(reject(c, { type: 'event.undo', eventId: 'e1' })).toMatch('campaign creation cannot');
    expect(reject(c, { type: 'event.undo', eventId: 'a1' })).toMatch('already undone');
    expect(reject(c, { type: 'event.undo', eventId: 'zz' })).toMatch('no earlier event "zz"');
  });

  it('replay accepts a hand-edited undo order that appends would refuse, with the same end state (D28)', () => {
    const c = run(
      [
        { ...jake, id: 'kim', name: 'Kim' },
        { type: 'character.rename', characterId: 'kim', name: 'Kimberly' },
      ],
      testContext('a'),
      base(),
    );
    const raw = JSON.parse(JSON.stringify(c.events)) as unknown[];
    const undo = (id: string, target: string) =>
      rawEvent({ id, type: 'event.undone', payload: { eventId: target } });
    // Appending u1 first is rejected (kim's rename depends on kim)...
    expect(reject(c, { type: 'event.undo', eventId: 'a1' })).toMatch('cannot undo a1');
    // ...but replay of that order folds only what still counts.
    const replayed = replay([...raw, undo('u1', 'a1'), undo('u2', 'a2')]);
    expect(replayed.state).toEqual(base().state);
  });

  it('rejects in replay the same undo targets the log rejects', () => {
    const raw = JSON.parse(JSON.stringify(base().events)) as unknown[];
    const undo = (id: string, target: string) =>
      rawEvent({ id, type: 'event.undone', payload: { eventId: target } });
    expect(() => replay([...raw, undo('u1', 'e1')])).toThrow('campaign creation cannot');
    expect(() => replay([...raw, undo('u1', 'later'), rawEvent({ id: 'later' })])).toThrow(
      'no earlier event',
    );
    expect(() => replay([...raw, undo('u1', 'e2'), undo('u2', 'e2')])).toThrow('already undone');
    expect(() => replay([...raw, undo('u1', 'e2'), undo('u2', 'u1')])).toThrow('cannot be undone');
  });
});

describe('command boundary', () => {
  it('returns an error instead of throwing on malformed commands', () => {
    const ctx = testContext('x');
    for (const bad of [
      null,
      undefined,
      42,
      {},
      { type: 'bogus' },
      { type: 'character.setPools' },
    ]) {
      const result = execute(base(), bad as unknown as Command, ctx);
      expect(result.ok, JSON.stringify(bad)).toBe(false);
    }
    expect(execute(base(), { type: 'bogus' } as unknown as Command, ctx)).toEqual({
      ok: false,
      error: 'Bad command "bogus"',
    });
  });

  it('lets only the GM or the system issue the current commands', () => {
    const player = { ...testContext('p'), actor: { role: 'player' as const, characterId: 'jake' } };
    const rename: Command = { type: 'character.rename', characterId: 'jake', name: 'Jay' };
    expect(execute(base(), rename, player)).toEqual({
      ok: false,
      error: 'Not allowed: only the GM can character.rename',
    });
    expect(execute(base(), { type: 'event.undo', eventId: 'e2' }, player).ok).toBe(false);
    const system = { ...testContext('s'), actor: { role: 'system' as const } };
    expect(execute(base(), rename, system).ok).toBe(true);
  });

  it('limits players to listed commands on their own character', () => {
    const rename: Command = { type: 'character.rename', characterId: 'jake', name: 'Jay' };
    const allowed = new Set(['character.rename'] as const);
    const me = { role: 'player' as const, characterId: 'jake' };
    expect(authorize(rename, me, allowed)).toBeNull();
    expect(authorize(rename, { role: 'player', characterId: 'kim' }, allowed)).toBe(
      'players may only act on their own character',
    );
    expect(authorize({ type: 'event.undo', eventId: 'e2' }, me, new Set(['event.undo']))).toBe(
      'players may only act on their own character',
    );
    const noId = { role: 'player' } as unknown as typeof me;
    expect(
      authorize({ ...rename, characterId: undefined } as unknown as Command, noId, allowed),
    ).toBe('players may only act on their own character');
    expect(authorize(rename, { role: 'gm' })).toBeNull();
  });

  it('rejects "__proto__" keys that schema records would silently drop', () => {
    const pools = JSON.parse('{"__proto__":{"a":1}}') as Record<string, number>;
    expect(reject(base(), { type: 'character.setPools', characterId: 'jake', pools })).toMatch(
      '"__proto__" is not allowed',
    );
  });

  it('detaches stored events from the caller objects', () => {
    const rules = rawRules() as { campaign: { plannedSessions: number } };
    const c = run([{ type: 'campaign.create', name: 'W', rules }]);
    rules.campaign.plannedSessions = 1;
    const stored = (c.events[0] as DomainEvent & { type: 'campaign.created' }).payload.rules;
    expect((stored as typeof rules).campaign.plannedSessions).not.toBe(1);
    expect(() => parseEvent(rawEvent({ payload: { characterId: 'jake', name: 1n } }))).toThrow(
      'not plain JSON data',
    );
  });
});

describe('log-level upcasters', () => {
  it('can rename a type and split one stored event into several', () => {
    const raw = JSON.parse(JSON.stringify(base().events)) as unknown[];
    raw.push(
      rawEvent({
        id: 'old1',
        type: 'character.relabelled',
        payload: { characterId: 'jake', name: 'Jay' },
      }),
      rawEvent({
        id: 'old2',
        type: 'character.bulkEdit',
        payload: { characterId: 'jake', name: 'Jay B', hp: 5 },
      }),
    );
    const renameType = (e: unknown) => {
      const ev = e as { type: string };
      return [ev.type === 'character.relabelled' ? { ...ev, type: 'character.renamed' } : ev];
    };
    const split = (e: unknown) => {
      const ev = e as {
        id: string;
        type: string;
        payload: { characterId: string; name: string; hp: number };
      };
      if (ev.type !== 'character.bulkEdit') return [ev];
      const { characterId, name, hp } = ev.payload;
      return [
        { ...ev, type: 'character.renamed', payload: { characterId, name } },
        {
          ...ev,
          id: `${ev.id}.2`,
          type: 'character.poolsSet',
          payload: { characterId, pools: { hp } },
        },
      ];
    };
    const c = replay(raw, { rawUpcasters: [renameType, split] });
    expect(c.state?.characters['jake']).toMatchObject({ name: 'Jay B', pools: { hp: 5 } });
    expect(c.events.map((e) => e.id)).toEqual(['e1', 'e2', 'old1', 'old2', 'old2.2']);
    expect(() => replay(raw, { rawUpcasters: [() => []] })).toThrow('a log upcaster dropped it');
    // Undo targets still resolve through a split, and the upcaster is idempotent.
    const undo = rawEvent({ id: 'u1', type: 'event.undone', payload: { eventId: 'old2' } });
    const withUndo = replay([...raw, undo], { rawUpcasters: [renameType, split, split] });
    expect(withUndo.undone).toEqual({ old2: 'u1' });
    expect(withUndo.state?.characters['jake']?.name).toBe('Jay');
  });

  it('rejects an upcaster that changes the first id, and never lets it mutate the caller log', () => {
    const raw = JSON.parse(JSON.stringify(base().events)) as unknown[];
    const before = JSON.stringify(raw);
    expect(() => replay(raw, { rawUpcasters: [(e) => [{ ...(e as object), id: 'new' }]] })).toThrow(
      'must keep the original id',
    );
    const mutating = (e: unknown) => {
      (e as { sessionId: string }).sessionId = 'hacked';
      return [e];
    };
    expect(replay(raw, { rawUpcasters: [mutating] }).events[0]?.sessionId).toBe('hacked');
    expect(JSON.stringify(raw)).toBe(before);
  });
});

describe('replay', () => {
  it('rebuilds the same campaign from a JSON round trip of the log', () => {
    const c = run(
      [
        { type: 'character.rename', characterId: 'jake', name: 'Jay' },
        { type: 'event.undo', eventId: 'a1' },
      ],
      testContext('a'),
      base(),
    );
    const replayed = replay(JSON.parse(JSON.stringify(c.events)) as unknown[]);
    expect(replayed).toEqual(c);
  });

  it('rejects duplicate ids, logs not starting with campaign.created and bad events', () => {
    const raw = JSON.parse(JSON.stringify(base().events)) as unknown[];
    expect(() => replay([...raw, raw[1]])).toThrow('duplicate event id');
    expect(() => replay(raw.slice(1))).toThrow('must start with campaign.created');
    expect(() => replay([...raw, { nope: true }])).toThrow(EventRejectedError);
    expect(replay([])).toEqual(emptyCampaign());
  });

  it('parses JSONL, skipping blank lines and naming bad lines', () => {
    expect(parseEventLines('{"a":1}\n\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
    expect(() => parseEventLines('{"a":1}\n{oops')).toThrow('Line 2: not valid JSON');
  });
});

describe('property: replay equals incremental state', () => {
  const SEED = 20261021;
  const STEPS = 1200;

  it(`holds over ${STEPS} random commands (seed ${SEED})`, () => {
    const rand = seededRandom(SEED);
    const ctx = testContext('p');
    let c = run([created]);
    let accepted = 0;
    let undos = 0;
    let rejected = 0;
    let nonLatest = 0;
    let lockedRejections = 0;
    let playerAccepted = 0;
    const acceptedByType: Record<string, number> = {};
    let dependent = 0;
    for (let step = 0; step < STEPS; step++) {
      const command = randomCommand(rand, c);
      const asPlayer =
        (command.type === 'event.undo' ||
          (PLAYER_COMMANDS.has(command.type) &&
            'characterId' in command &&
            typeof command.characterId === 'string')) &&
        rand() < 0.5;
      const actorCtx = asPlayer
        ? {
            ...ctx,
            actor: {
              role: 'player' as const,
              characterId:
                'characterId' in command && typeof command.characterId === 'string'
                  ? command.characterId
                  : 'c1',
            },
          }
        : ctx;
      const result = execute(deepFreeze(c), command, actorCtx);
      if (!result.ok) {
        rejected++;
        if (result.error.includes('already assigned and locked')) lockedRejections++;
        if (command.type === 'event.undo' && result.error.includes('depends on it')) dependent++;
        continue;
      }
      accepted++;
      acceptedByType[command.type] = (acceptedByType[command.type] ?? 0) + 1;
      if (asPlayer) playerAccepted++;
      if (command.type === 'event.undo') {
        undos++;
        const latest = [...c.events].reverse().find((e) => e.type !== 'event.undone');
        if (latest?.id !== command.eventId) nonLatest++;
      }
      c = result.campaign;
      {
        const replayed = replay(JSON.parse(JSON.stringify(c.events)) as unknown[]);
        expect(replayed.state, `seed ${SEED}, step ${step}`).toEqual(c.state);
        expect(replayed.undone, `seed ${SEED}, step ${step}`).toEqual(c.undone);
      }
    }
    const replayed = replay(JSON.parse(JSON.stringify(c.events)) as unknown[]);
    expect(replayed, `seed ${SEED}`).toEqual(c);
    // The run must exercise every path, or the property proves little.
    expect(accepted, `seed ${SEED}`).toBeGreaterThan(100);
    expect(undos, `seed ${SEED}`).toBeGreaterThan(10);
    expect(rejected, `seed ${SEED}`).toBeGreaterThan(20);
    expect(nonLatest, `seed ${SEED}: accepted non-latest undos`).toBeGreaterThan(5);
    expect(dependent, `seed ${SEED}: undos refused for a dependency`).toBeGreaterThan(0);
    for (const type of [
      'freePoints.assign',
      'freePoints.override',
      'xp.award',
      'event.undo',
      'item.define',
      'holdings.adjust',
      'item.equip',
      'trade.propose',
    ]) {
      expect(acceptedByType[type] ?? 0, `seed ${SEED}: accepted ${type}`).toBeGreaterThan(2);
    }
    for (const type of [
      'item.edit',
      'gift.give',
      'item.unequip',
      'trade.accept',
      'trade.decline',
      'trade.cancel',
    ]) {
      expect(acceptedByType[type] ?? 0, `seed ${SEED}: accepted ${type}`).toBeGreaterThan(0);
    }
    expect(lockedRejections, `seed ${SEED}: locked-batch rejections`).toBeGreaterThan(0);
    expect(playerAccepted, `seed ${SEED}: accepted player assignments`).toBeGreaterThan(0);
    expect(
      new Set(c.events.map((e) => e.type)).size,
      `seed ${SEED}: ${[...new Set(c.events.map((e) => e.type))].join(',')}`,
    ).toBeGreaterThanOrEqual(EVENT_TYPES.length - 1);
    // Every step replays the whole log (quadratic); slower under coverage.
  }, 60_000);
});
