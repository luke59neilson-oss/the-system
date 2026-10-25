import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  execute,
  parseRulesConfig,
  previewContent,
  projectForPlayer,
  replay,
  RULES_CONFIG_VERSION,
  type Campaign,
  type Command,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// MT.3 (DESIGN §7 "No hunger tracker", Q68): hunger is narrated, never
// tracked. Logs and rules written while M7.4's tracker existed must still load.

const setup = (rules: unknown = rawRules()): Command[] => [
  { type: 'campaign.create', name: 'C', rules },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
];

/** Rules as M7.4 stored them: config version 1 with a hunger block. */
const v1Rules = () => ({
  ...(rawRules() as Record<string, unknown>),
  configVersion: 1,
  hunger: { enabledByDefault: true, fadesAtGrade: 'E' },
});

/** The two M7.4 hunger events, as a stored log has them. */
function withStoredHunger(c: Campaign): unknown[] {
  const at = (n: number) => new Date(Date.UTC(2026, 9, 22, 12, 0, n)).toISOString();
  const base = { actor: { role: 'gm' }, sessionId: 's1', schemaVersion: 1 };
  return [
    ...c.events,
    {
      ...base,
      id: 'h1',
      type: 'hunger.configured',
      timestamp: at(1),
      payload: { enabled: true, steps: ['Fed', 'Peckish', 'Hungry'] },
    },
    {
      ...base,
      id: 'h2',
      type: 'hunger.levelsSet',
      timestamp: at(2),
      payload: { levels: { jake: 1 } },
    },
  ];
}

describe('no hunger tracker (MT.3)', () => {
  it('stored hunger events replay as no-ops', () => {
    const c = run(setup());
    const replayed = replay(withStoredHunger(c));
    expect(replayed.events).toHaveLength(c.events.length + 2);
    expect(replayed.state).toEqual(c.state);
    expect(replayed.state && 'hunger' in replayed.state).toBe(false);
  });

  it('no command records a hunger event', () => {
    const c = run(setup());
    for (const command of [
      { type: 'hunger.configure', enabled: true },
      { type: 'hunger.set', characterIds: ['jake'], level: 1 },
    ]) {
      const result = execute(c, command as unknown as Command, testContext('x'));
      expect(result.ok, command.type).toBe(false);
    }
  });

  it('stored rules with a hunger block load without it', () => {
    const parsed = parseRulesConfig(v1Rules());
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    expect(parsed.config.configVersion).toBe(RULES_CONFIG_VERSION);
    expect('hunger' in parsed.config).toBe(false);
    expect('hunger' in DEFAULT_RULES).toBe(false);
    // A campaign created from them (an old log's first event) opens on current rules.
    const c = run(setup(v1Rules()));
    expect(c.state?.rules.configVersion).toBe(RULES_CONFIG_VERSION);
    expect(c.state && 'hunger' in c.state.rules).toBe(false);
    // Current rules may not carry a hunger block.
    const bad = parseRulesConfig({ ...(rawRules() as object), hunger: { enabledByDefault: true } });
    expect(bad.ok).toBe(false);
  });

  it('the player projection carries no hunger', () => {
    const c = replay(withStoredHunger(run(setup(v1Rules()))));
    if (!c.state) throw new Error('no state');
    const view = projectForPlayer(c.state, 'jake');
    expect('hunger' in view).toBe(false);
    expect(JSON.stringify(view)).not.toMatch(/hunger|Peckish/iu);
  });

  it('content with a hunger block imports without tracking it', () => {
    const c = run(setup());
    const file = {
      format: 'the-system/content',
      version: 1,
      regions: [{ name: 'The Crown' }],
      hunger: { enabled: true, steps: ['Fed', 'Starving'] },
    };
    const preview = previewContent(c, file, testContext('p'));
    if (!preview.ok) throw new Error(JSON.stringify(preview.errors));
    expect(preview.entries.map((e) => e.path)).toEqual(['regions[0]']);
    expect(preview.entries.every((e) => !e.command.type.startsWith('hunger'))).toBe(true);
    expect(preview.ignored).toEqual([
      { path: 'hunger', message: expect.stringMatching(/does not track hunger/u) as string },
    ]);
    const plain = previewContent(c, { ...file, hunger: undefined }, testContext('p'));
    expect(plain.ok && plain.ignored).toEqual([]);
  });
});
