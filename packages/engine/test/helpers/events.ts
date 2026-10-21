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
  if (rand() < 0.1) {
    return rand() < 0.5 ? randomClockCommand(rand, c, pick) : randomQuestCommand(rand, c, pick);
  }
  if (rand() < 0.35) return randomEconomyCommand(rand, c, pick, someId);
  if (rand() < 0.15) return randomNotesCommand(rand, c, pick, someId);
  if (rand() < 0.12) return randomSkillCommand(rand, c, pick, someId);
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
  if (roll < 0.62) {
    return {
      type: 'title.award',
      characterId: someId(),
      title: pick(['Forerunner', 'Rapid Spread', 'forerunner', ' ']),
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

/** Economy commands (M1.7): item library, GM adjustments, gifts, equipment, trades. */
function randomEconomyCommand(
  rand: () => number,
  c: Campaign,
  pick: <T>(items: readonly T[]) => T,
  someId: () => string,
): Command {
  const itemIds = c.state?.itemOrder ?? [];
  const someItem = () => (itemIds.length && rand() < 0.95 ? pick(itemIds) : 'nothing');
  const party = () => (rand() < 0.2 ? null : someId());
  const bundle = () => ({
    currency: rand() < 0.5 ? Math.floor(rand() * 40) : 0,
    items: rand() < 0.6 ? { [someItem()]: 1 + Math.floor(rand() * 3) } : {},
  });
  const tradeIds = c.state?.tradeOrder ?? [];
  const roll = rand();
  if (roll < 0.1) {
    return {
      type: 'item.define',
      id: `i${Math.floor(rand() * 6)}`,
      name: pick(['Ring of Haste', 'Bow', ' ', 'Cloak', 'Bracer']),
      rarity: pick(['common', 'rare', 'epic', 'common', 'divine', 'nope']),
      slot: pick(['ring', 'mainHand', 'cloak', null, 'tail']),
      bonuses:
        rand() < 0.6
          ? [{ stat: pick(['agility', 'luck', 'strength']), flat: 5, percent: 0.1 }]
          : [],
    };
  }
  if (roll < 0.14) {
    return {
      type: 'item.edit',
      itemId: someItem(),
      rarity: pick(['uncommon', 'epic', 'nope']),
      ...(rand() < 0.3 ? { slot: pick(['ring', 'cloak', null]) } : {}),
    };
  }
  if (roll < 0.3) {
    return {
      type: 'holdings.adjust',
      characterId: someId(),
      currency: Math.floor(rand() * 200) - 40,
      items: rand() < 0.7 ? { [someItem()]: rand() < 0.8 ? 1 + Math.floor(rand() * 3) : -1 } : {},
    };
  }
  if (roll < 0.38) return { type: 'gift.give', characterId: party(), to: party(), ...bundle() };
  if (roll < 0.56) {
    // Mostly something the character holds, in its own slot type.
    const characterId = someId();
    const held = Object.keys(c.state?.holdings[characterId]?.inventory ?? {});
    const itemId = held.length && rand() < 0.8 ? pick(held) : someItem();
    const slot = c.state?.items[itemId]?.slot ?? null;
    return {
      type: 'item.equip',
      characterId,
      itemId,
      slot: slot !== null && rand() < 0.8 ? slot : pick(['ring', 'mainHand', 'cloak', 'tail']),
      index: rand() < 0.8 ? 0 : Math.floor(rand() * 3),
    };
  }
  if (roll < 0.7) {
    const characterId = someId();
    const worn = Object.keys(c.state?.holdings[characterId]?.equipped ?? {});
    const [slot, index] =
      worn.length && rand() < 0.8
        ? (pick(worn).split(':') as [string, string])
        : [pick(['ring', 'mainHand', 'cloak']), rand() < 0.8 ? '0' : '1'];
    return { type: 'item.unequip', characterId, slot, index: Number(index) };
  }
  if (roll < 0.8 || tradeIds.length === 0) {
    return {
      type: 'trade.propose',
      characterId: party(),
      to: party(),
      give: bundle(),
      get: bundle(),
    };
  }
  // Mostly open trades, answered by the right party.
  const open = tradeIds.filter((id) => c.state?.trades[id]?.status === 'open');
  const trade = c.state?.trades[pick(open.length && rand() < 0.8 ? open : tradeIds)];
  const type = pick(['trade.accept', 'trade.accept', 'trade.decline', 'trade.cancel'] as const);
  const by = type === 'trade.cancel' ? (trade?.from ?? null) : (trade?.to ?? null);
  return {
    type,
    tradeId: trade?.id ?? 'none',
    characterId: rand() < 0.9 ? by : someId(),
  };
}

/** Practice log and notes commands (M1.8). */
function randomNotesCommand(
  rand: () => number,
  c: Campaign,
  pick: <T>(items: readonly T[]) => T,
  someId: () => string,
): Command {
  const roll = rand();
  if (roll < 0.4) {
    const characterId = someId();
    const own = c.state?.characters[characterId]?.skills.map((s) => s.name) ?? [];
    const skills = own.filter(() => rand() < 0.5);
    return {
      type: 'practice.log',
      characterId,
      action: pick(['Volley', 'Ambush', ' ', 'Sneak past']),
      skills: rand() < 0.1 ? ['Fireball'] : skills,
      stat: rand() < 0.4 ? pick(['agility', 'perception', 'luck']) : null,
      ...(rand() < 0.2 ? { source: pick(['gm', 'player', 'montage'] as const) } : {}),
    };
  }
  const noteIds = c.state?.noteOrder ?? [];
  const author = () => (rand() < 0.4 ? null : someId());
  if (roll < 0.7 || noteIds.length === 0) {
    return {
      type: 'note.create',
      noteId: `n${Math.floor(rand() * 10)}`,
      characterId: author(),
      kind: pick(['journal', 'party', 'gm'] as const),
      title: pick(['Day 1', '', 'Casper']),
      body: pick(['Text', '', 'More text']),
      ...(rand() < 0.5 ? { shareable: rand() < 0.5 } : {}),
    };
  }
  const note = c.state?.notes[pick(noteIds)];
  const by = rand() < 0.8 ? (note?.author ?? null) : author();
  if (roll < 0.9) {
    return {
      type: 'note.edit',
      noteId: note?.id ?? 'none',
      characterId: by,
      ...(rand() < 0.5 ? { body: pick(['Edited', '']) } : {}),
      ...(rand() < 0.5 ? { shareable: rand() < 0.5 } : {}),
    };
  }
  return { type: 'note.delete', noteId: note?.id ?? 'none', characterId: by };
}

/** Skill commands (M1.9): nicknames, Unique, marks, upgrades, merges. */
function randomSkillCommand(
  rand: () => number,
  c: Campaign,
  pick: <T>(items: readonly T[]) => T,
  someId: () => string,
): Command {
  const roll = rand();
  // Marks and upgrades focus on one skill so upgrades are reachable.
  const focus = roll >= 0.25 && roll < 0.95 && rand() < 0.7;
  const first = c.state?.characterOrder[0];
  const characterId = focus && first !== undefined ? first : someId();
  const names = c.state?.characters[characterId]?.skills.map((s) => s.name) ?? [];
  const someSkill = () =>
    names.length && rand() < 0.95 ? (focus ? (names[0] as string) : pick(names)) : 'Fireball';
  if (roll < 0.15) {
    return {
      type: 'skill.nickname',
      characterId,
      skill: someSkill(),
      nickname: pick(['Jake Juice', null, '', 'Zap']),
    };
  }
  if (roll < 0.25) {
    return { type: 'skill.setUnique', characterId, skill: someSkill(), unique: rand() < 0.5 };
  }
  if (roll < 0.75) {
    return {
      type: 'skill.awardMark',
      characterId,
      skill: someSkill(),
      session: `s${Math.floor(rand() * 8)}`,
    };
  }
  if (roll < 0.95) return { type: 'skill.upgrade', characterId, skill: someSkill() };
  return {
    type: 'skill.merge',
    characterId,
    skills: [someSkill(), someSkill()],
    name: pick(['Merged', 'Shadow Shot']),
  };
}

function randomClockCommand(
  rand: () => number,
  c: Campaign,
  pick: <T>(items: readonly T[]) => T,
): Command {
  const ids = c.state?.clockOrder ?? [];
  const someClock = () => (ids.length && rand() < 0.9 ? pick(ids) : 'no-clock');
  const roll = rand();
  if (roll < 0.3) {
    return {
      type: 'clock.create',
      clockId: `k${Math.floor(rand() * 6)}`,
      name: pick(['Climb', 'Escape', ' ']),
      segments: pick([4, 6, 8, 0]),
    };
  }
  if (roll < 0.9) {
    return {
      type: 'clock.tick',
      clockId: someClock(),
      result: rand() < 0.75 ? 'success' : 'failure',
      amount: pick([1, 1, 2, 3]),
    };
  }
  return { type: 'clock.remove', clockId: someClock() };
}

function randomQuestCommand(
  rand: () => number,
  c: Campaign,
  pick: <T>(items: readonly T[]) => T,
): Command {
  const ids = c.state?.questOrder ?? [];
  const someQuest = () => (ids.length && rand() < 0.9 ? pick(ids) : 'no-quest');
  const roll = rand();
  if (roll < 0.15) {
    return {
      type: 'quest.create',
      questId: `q${Math.floor(rand() * 4)}`,
      title: pick(['The world is dying', 'Find the survivors', ' ']),
      visible: rand() < 0.5,
      days: pick([30, null, 0]),
      stability:
        rand() < 0.7 ? { initial: pick([null, 50, 120]), rules: { cleanse: -5, heal: 3 } } : null,
    };
  }
  if (roll < 0.4) {
    return {
      type: 'quest.edit',
      questId: someQuest(),
      visible: pick([true, false]),
      stabilityVisible: rand() < 0.3 ? pick([true, false]) : undefined,
    };
  }
  if (roll < 0.55) {
    return {
      type: 'quest.setStatus',
      questId: someQuest(),
      status: pick(['completed', 'failed', 'completed', 'active'] as const),
    };
  }
  if (roll < 0.8) {
    return {
      type: 'stability.applyAction',
      questId: someQuest(),
      tag: pick(['cleanse', 'heal', 'dance']),
      count: pick([1, 2, 30]),
    };
  }
  if (roll < 0.9)
    return { type: 'stability.nudge', questId: someQuest(), delta: pick([-10, 5, 0]) };
  return { type: 'campaign.advanceDay', days: pick([1, 3, 0]) };
}
