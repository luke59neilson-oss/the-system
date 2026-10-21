import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
  type Campaign,
  type Command,
  type CommandContext,
} from '../../src';

/** Deterministic context: a 1-second-step clock from a fixed epoch and sequential ids. */
export function testContext(prefix = 'e', start = Date.UTC(2026, 9, 21, 12)): CommandContext {
  let tick = 0;
  let id = 0;
  return {
    actor: { role: 'gm' },
    sessionId: 's1',
    now: () => new Date(start + 1000 * tick++).toISOString(),
    newId: () => `${prefix}${++id}`,
  };
}

export const kit = [
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic Stealth', rarity: 'inferior' },
  { name: 'Archer’s Eye', rarity: 'common' },
];

export const rawRules = () => JSON.parse(JSON.stringify(DEFAULT_RULES)) as unknown;

/** Runs commands, failing loudly on any rejection. */
export function run(
  commands: Command[],
  ctx = testContext(),
  campaign: Campaign = emptyCampaign(),
): Campaign {
  let current = campaign;
  for (const command of commands) {
    const result = execute(current, command, ctx);
    if (!result.ok) throw new Error(`${command.type} rejected: ${result.error}`);
    current = result.campaign;
  }
  return current;
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** mulberry32: small seeded PRNG for property tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
