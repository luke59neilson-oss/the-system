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

/** A random, often invalid, command over the current campaign (property tests; deterministic per rand). */
export function randomCommand(rand: () => number, c: Campaign): Command {
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
  if (roll >= 0.25 && roll < 0.3) {
    return {
      type: 'system.broadcast',
      text: pick(['The world is dying.', ' ', 'Day 3 begins.']),
      characterIds: rand() < 0.4 ? null : [someId(), ...(rand() < 0.1 ? [someId()] : [])],
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
  if (roll >= 0.8 && roll < 0.92) {
    const character = c.state?.characters[someId()];
    const batches = character?.freePointBatches ?? [];
    const batch = batches.length ? pick(batches) : { raceLevel: 1, points: 2 };
    const allocation: Record<string, number> = {};
    const extra = rand() < 0.05 ? 1 : 0;
    allocation[rand() < 0.1 ? 'luck' : pick(['strength', 'agility', 'vitality'])] =
      batch.points + extra;
    return rand() < 0.5
      ? {
          type: 'freePoints.assign',
          characterId: character?.id ?? 'ghost',
          raceLevel: batch.raceLevel,
          allocation,
        }
      : {
          type: 'freePoints.override',
          characterId: character?.id ?? 'ghost',
          raceLevel: batch.raceLevel,
          allocation: rand() < 0.3 ? null : allocation,
        };
  }
  if (roll < 0.8) {
    const count = 1 + Math.floor(rand() * 3);
    const manual = rand() < 0.3;
    const amount = Math.floor(rand() * 900);
    return {
      type: 'xp.award',
      track: rand() < 0.9 ? 'class' : 'profession',
      amount,
      enemyLevel: rand() < 0.3 ? Math.floor(rand() * 10) : null,
      participants: Array.from({ length: count }, (_, i) => ({
        characterId: someId(),
        ...(manual ? { share: i === 0 ? amount : 0 } : { weight: 1 + Math.floor(rand() * 3) }),
      })),
    };
  }
  const targets = c.events.map((e) => e.id);
  return { type: 'event.undo', eventId: rand() < 0.95 ? pick(targets) : 'missing' };
}
