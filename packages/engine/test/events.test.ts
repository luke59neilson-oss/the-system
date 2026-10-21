import { describe, expect, it } from 'vitest';
import {
  EVENT_SCHEMA_VERSIONS,
  EVENT_TYPES,
  EventRejectedError,
  appendEvent,
  applyEvent,
  emptyCampaign,
  execute,
  parseEvent,
  parseEventLines,
  replay,
  type Campaign,
  type Character,
  type Command,
  type DomainEvent,
} from '../src';
import { deepFreeze, kit, rawRules, run, seededRandom, testContext } from './helpers/events';

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
          pools: { hp: 40, mp: 500, stamina: -3 },
        },
      ],
      testContext('a'),
      base(),
    );
    expect(pools.state?.characters['jake']?.pools).toEqual({ hp: 40, mp: 100, stamina: 0 });
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

  it('later events re-apply against the undone state (stats then pools)', () => {
    const c = run(
      [
        { type: 'character.setStats', characterId: 'jake', stats: { vitality: 50 } },
        { type: 'character.setPools', characterId: 'jake', pools: { hp: 400 } },
      ],
      testContext('a'),
      base(),
    );
    expect(c.state?.characters['jake']?.pools['hp']).toBe(400);
    const undone = run([{ type: 'event.undo', eventId: 'a1' }], testContext('u'), c);
    expect(undone.state?.characters['jake']?.pools['hp']).toBe(100);
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
  const STEPS = 400;

  function randomCommand(rand: () => number, c: Campaign): Command {
    const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
    const ids = c.state?.characterOrder ?? [];
    const someId = () => (ids.length && rand() < 0.95 ? pick(ids) : 'ghost');
    const roll = rand();
    if (roll < 0.15) {
      return {
        type: 'character.create',
        id: rand() < 0.9 ? `c${Math.floor(rand() * 12)}` : '',
        name: pick(['Jake', 'Casper', 'Miranda', ' ', 'Neil']),
        className: pick(['Archer', 'Warrior', 'Mage']),
        classSkills: rand() < 0.9 ? kit : kit.slice(0, 1),
      };
    }
    if (roll < 0.3)
      return { type: 'character.rename', characterId: someId(), name: pick(['A', 'B', '']) };
    if (roll < 0.45) {
      return {
        type: 'character.setPools',
        characterId: someId(),
        pools: { [pick(['hp', 'mp', 'stamina', 'luck'])]: Math.floor(rand() * 600) - 50 },
      };
    }
    if (roll < 0.6) {
      return {
        type: 'character.setStats',
        characterId: someId(),
        stats: { [pick(['vitality', 'wisdom', 'endurance', 'strength'])]: Math.floor(rand() * 60) },
      };
    }
    if (roll < 0.65) {
      return { type: 'character.grantProfession', characterId: someId(), profession: 'Smith' };
    }
    const targets = c.events.map((e) => e.id);
    return { type: 'event.undo', eventId: rand() < 0.95 ? pick(targets) : 'missing' };
  }

  it(`holds over ${STEPS} random commands (seed ${SEED})`, () => {
    const rand = seededRandom(SEED);
    const ctx = testContext('p');
    let c = run([created]);
    let accepted = 0;
    let undos = 0;
    let rejected = 0;
    for (let step = 0; step < STEPS; step++) {
      const command = randomCommand(rand, c);
      const result = execute(deepFreeze(c), command, ctx);
      if (!result.ok) {
        rejected++;
        continue;
      }
      accepted++;
      if (command.type === 'event.undo') undos++;
      c = result.campaign;
      if (step % 25 === 0 || step === STEPS - 1) {
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
    expect(new Set(c.events.map((e) => e.type)).size, `seed ${SEED}`).toBeGreaterThanOrEqual(
      EVENT_TYPES.length - 1,
    );
  });
});
