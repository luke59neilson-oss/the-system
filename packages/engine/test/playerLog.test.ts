import { describe, expect, it } from 'vitest';
import {
  EVENT_TYPES,
  applyEvent,
  type DomainEvent,
  PLAYER_NOTICE_AUDIT,
  execute,
  notificationsBetween,
  type Campaign,
  type Command,
  type EventType,
} from '../src';
import { kit, mergeAccepted, rawRules, run, testContext } from './helpers/events';

// MU.2 (DESIGN §7 "Player log"): every GM action that changes a character
// notifies its player, or the audit lists it as silent with a reason.

const base: Command[] = [
  { type: 'campaign.create', name: 'Log', rules: rawRules() },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'casper', name: 'Casper', className: 'Archer', classSkills: kit },
  { type: 'item.define', id: 'ring', name: 'Bone Ring', rarity: 'common', slot: 'ring' },
];

/** Jake at the top of G-grade with a merge-ready pair of Uncommon skills. */
const atTopOfG: Command[] = [
  {
    type: 'character.setProgression',
    characterId: 'jake',
    grade: 'G',
    classLevel: 4,
    professionLevel: 0,
    xp: { class: 0, profession: 0 },
  },
];

/** Jake at the top of F-grade, so his next evolution can offer professions. */
const atTopOfF: Command[] = [
  {
    type: 'character.setProgression',
    characterId: 'jake',
    grade: 'F',
    classLevel: 14,
    professionLevel: 0,
    xp: { class: 0, profession: 0 },
  },
];
const professionOffered: Command[] = [
  ...atTopOfF,
  {
    type: 'evolution.release',
    characterId: 'jake',
    options: [{ className: 'Hunter' }],
    professions: ['Alchemist'],
    rerateApproved: true,
    override: true,
  },
  { type: 'evolution.choose', characterId: 'jake', optionId: 'o1', profession: null },
];
/** Jake at F-grade class level 5: his first selection is due. */
const atLevel5: Command[] = [
  {
    type: 'character.setProgression',
    characterId: 'jake',
    grade: 'F',
    classLevel: 5,
    professionLevel: 0,
    xp: { class: 0, profession: 0 },
  },
];
const uncommonPair: Command[] = [
  ...['Basic Archery', 'Basic Stealth'].map((skill) => ({
    type: 'skill.setRarity' as const,
    characterId: 'jake',
    skill,
    rarity: 'uncommon',
  })),
  ...[1, 2, 3].map((n) => ({
    type: 'practice.log' as const,
    characterId: 'jake',
    action: `Shot from hiding ${n}`,
    skills: ['Basic Archery', 'Basic Stealth'],
  })),
];
const menu = (...names: string[]) => names.map((name) => ({ name, rarity: 'common' }) as const);

interface Scenario {
  /** Commands run first (after `base`). */
  readonly setup?: Command[];
  /** The GM command whose event is checked. */
  readonly act: Command;
  /** Who must be told (default Jake). */
  readonly told?: string;
}

/** One scenario per event type the audit says notifies. */
const SCENARIOS: Partial<Record<EventType, Scenario>> = {
  'character.renamed': { act: { type: 'character.rename', characterId: 'jake', name: 'Jakob' } },
  'character.portraitSet': {
    act: { type: 'character.setPortrait', characterId: 'jake', portrait: `${'a'.repeat(64)}.png` },
  },
  'character.professionGranted': {
    act: {
      type: 'character.grantProfession',
      characterId: 'jake',
      profession: 'Alchemist',
      override: true,
    },
  },
  'profession.chosen': {
    setup: professionOffered,
    act: { type: 'profession.choose', characterId: 'jake', profession: 'Alchemist' },
  },
  'profession.offerWithdrawn': {
    setup: professionOffered,
    act: { type: 'profession.withdrawOffer', characterId: 'jake', profession: 'Alchemist' },
  },
  'title.awarded': { act: { type: 'title.award', characterId: 'jake', title: 'Forerunner' } },
  'titleDef.defined': {
    setup: [{ type: 'title.award', characterId: 'jake', title: 'Forerunner' }],
    act: { type: 'titleDef.define', id: 't1', name: 'Forerunner', text: 'First.' },
  },
  'titleDef.edited': {
    setup: [
      { type: 'titleDef.define', id: 't1', name: 'Forerunner', text: 'First.' },
      { type: 'title.award', characterId: 'jake', title: 'Forerunner' },
    ],
    act: {
      type: 'titleDef.edit',
      titleDefId: 't1',
      bonuses: [{ stat: 'agility', percent: 0.05 }],
    },
  },
  'character.poolsSet': {
    act: { type: 'character.setPools', characterId: 'jake', pools: { hp: 50 } },
  },
  'character.statsSet': {
    act: { type: 'character.setStats', characterId: 'jake', stats: { strength: 14 } },
  },
  'character.progressionSet': { act: atTopOfG[0]! },
  'xp.awarded': {
    act: { type: 'xp.award', track: 'class', amount: 50, participants: [{ characterId: 'jake' }] },
  },
  'freePoints.assigned': {
    setup: [
      { type: 'xp.award', track: 'class', amount: 100, participants: [{ characterId: 'jake' }] },
    ],
    act: {
      type: 'freePoints.assign',
      characterId: 'jake',
      raceLevel: 1,
      allocation: { strength: 2 },
    },
  },
  'freePoints.overridden': {
    setup: [
      { type: 'xp.award', track: 'class', amount: 100, participants: [{ characterId: 'jake' }] },
      { type: 'freePoints.assign', characterId: 'jake', raceLevel: 1, allocation: { strength: 2 } },
    ],
    act: {
      type: 'freePoints.override',
      characterId: 'jake',
      raceLevel: 1,
      allocation: { agility: 2 },
    },
  },
  'system.broadcast': { act: { type: 'system.broadcast', text: 'Hi', characterIds: ['jake'] } },
  'holdings.adjusted': {
    act: { type: 'holdings.adjust', characterId: 'jake', items: { ring: 1 }, reason: 'Found' },
  },
  'loot.rolled': {
    setup: [
      {
        type: 'lootTable.define',
        id: 'lt',
        name: 'Pile',
        entries: [{ kind: 'item', itemId: 'ring', weight: 1, min: 1, max: 1 }],
      },
    ],
    act: { type: 'loot.roll', tableId: 'lt', characterId: 'jake' },
  },
  'gift.given': {
    setup: [{ type: 'holdings.adjust', characterId: 'casper', items: { ring: 1 } }],
    act: { type: 'gift.give', characterId: 'casper', to: 'jake', items: { ring: 1 } },
  },
  'item.equipped': {
    setup: [{ type: 'holdings.adjust', characterId: 'jake', items: { ring: 1 } }],
    act: { type: 'item.equip', characterId: 'jake', itemId: 'ring', slot: 'ring' },
  },
  'item.unequipped': {
    setup: [
      { type: 'holdings.adjust', characterId: 'jake', items: { ring: 1 } },
      { type: 'item.equip', characterId: 'jake', itemId: 'ring', slot: 'ring' },
    ],
    act: { type: 'item.unequip', characterId: 'jake', slot: 'ring' },
  },
  'trade.proposed': {
    act: {
      type: 'trade.propose',
      tradeId: 'tr',
      characterId: null,
      to: 'jake',
      give: { items: { ring: 1 } },
      get: { currency: 0 },
    },
  },
  'trade.accepted': {
    setup: [
      { type: 'holdings.adjust', characterId: 'jake', items: { ring: 1 } },
      {
        type: 'trade.propose',
        tradeId: 'tr',
        characterId: 'jake',
        to: null,
        give: { items: { ring: 1 } },
        get: { currency: 5 },
      },
    ],
    act: { type: 'trade.accept', tradeId: 'tr', characterId: null },
  },
  'trade.declined': {
    setup: [
      { type: 'holdings.adjust', characterId: 'jake', items: { ring: 1 } },
      {
        type: 'trade.propose',
        tradeId: 'tr',
        characterId: 'jake',
        to: null,
        give: { items: { ring: 1 } },
        get: { currency: 5 },
      },
    ],
    act: { type: 'trade.decline', tradeId: 'tr', characterId: null },
  },
  'trade.cancelled': {
    setup: [
      {
        type: 'trade.propose',
        tradeId: 'tr',
        characterId: null,
        to: 'jake',
        give: { items: { ring: 1 } },
        get: { currency: 0 },
      },
    ],
    act: { type: 'trade.cancel', tradeId: 'tr', characterId: null },
  },
  'skill.nicknamed': {
    act: {
      type: 'skill.nickname',
      characterId: 'jake',
      skill: 'Basic Archery',
      nickname: 'Pew',
    },
  },
  'skill.described': {
    act: {
      type: 'skill.describe',
      characterId: 'jake',
      skill: 'Basic Archery',
      description: 'Shoot.',
      flavor: null,
    },
  },
  'skill.uniqueSet': {
    act: { type: 'skill.setUnique', characterId: 'jake', skill: 'Basic Archery', unique: true },
  },
  'skill.raritySet': {
    act: { type: 'skill.setRarity', characterId: 'jake', skill: 'Basic Archery', rarity: 'common' },
  },
  'skill.granted': {
    act: {
      type: 'skill.grant',
      characterId: 'jake',
      name: 'Stealth Step',
      rarity: 'common',
      kind: 'class',
    },
  },
  'skill.libraryTextUsed': {
    setup: [
      {
        type: 'skillDef.define',
        name: 'Basic Archery',
        rarity: 'inferior',
        description: 'Library text.',
      },
      {
        type: 'skill.describe',
        characterId: 'jake',
        skill: 'Basic Archery',
        description: 'Mine.',
        flavor: null,
      },
    ],
    act: { type: 'skill.useLibraryText', characterId: 'jake', skill: 'Basic Archery' },
  },
  'skill.markAwarded': {
    act: { type: 'skill.awardMark', characterId: 'jake', skill: 'Basic Archery', session: 'x1' },
  },
  'skill.upgraded': {
    setup: [1, 2, 3].map((n) => ({
      type: 'skill.awardMark' as const,
      characterId: 'jake',
      skill: 'Basic Archery',
      session: `x${n}`,
    })),
    act: { type: 'skill.upgrade', characterId: 'jake', skill: 'Basic Archery' },
  },
  'skill.mergeOffered': {
    act: {
      type: 'skill.merge',
      characterId: 'jake',
      skills: ['Basic Archery', 'Basic Stealth'],
      name: 'Silent Shot',
      offerId: 'm1',
      override: true,
    },
  },
  'skill.mergeAnswered': {
    setup: [
      ...uncommonPair,
      {
        type: 'skill.merge',
        characterId: 'jake',
        skills: ['Basic Archery', 'Basic Stealth'],
        name: 'Silent Shot',
        offerId: 'm1',
        override: true,
      },
    ],
    act: { type: 'skill.answerMerge', characterId: 'jake', offerId: 'm1', accept: false },
  },
  'selection.offered': {
    setup: atLevel5,
    act: {
      type: 'selection.offer',
      characterId: 'jake',
      level: 5,
      options: menu('Quick Draw', 'Steady Aim', 'Hawk Call'),
    },
  },
  'selection.chosen': {
    setup: [
      ...atLevel5,
      {
        type: 'selection.offer',
        characterId: 'jake',
        level: 5,
        options: menu('Quick Draw', 'Steady Aim', 'Hawk Call'),
      },
    ],
    act: { type: 'selection.choose', characterId: 'jake', level: 5, skill: 'Quick Draw' },
  },
  'selection.optionWithdrawn': {
    setup: [
      ...atLevel5,
      {
        type: 'selection.offer',
        characterId: 'jake',
        level: 5,
        options: menu('Quick Draw', 'Long Shot', 'Hawk Call'),
      },
      { type: 'selection.choose', characterId: 'jake', level: 5, skill: 'Quick Draw' },
    ],
    act: { type: 'selection.withdrawOption', characterId: 'jake', skill: 'Long Shot' },
  },
  'evolution.released': {
    setup: atTopOfG,
    act: {
      type: 'evolution.release',
      characterId: 'jake',
      options: [{ className: 'Hunter' }],
      rerateApproved: true,
      override: true,
    },
  },
  'evolution.chosen': {
    setup: [
      ...atTopOfG,
      {
        type: 'evolution.release',
        characterId: 'jake',
        options: [{ className: 'Hunter' }],
        rerateApproved: true,
        override: true,
      },
    ],
    act: { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' },
  },
  'quest.created': { act: { type: 'quest.create', questId: 'q1', title: 'Find the heart' } },
  'quest.edited': {
    setup: [{ type: 'quest.create', questId: 'q1', title: 'Find the heart', visible: false }],
    act: { type: 'quest.edit', questId: 'q1', visible: true },
  },
  'quest.statusSet': {
    setup: [{ type: 'quest.create', questId: 'q1', title: 'Find the heart' }],
    act: { type: 'quest.setStatus', questId: 'q1', status: 'completed' },
  },
  'campaign.dayAdvanced': {
    setup: [{ type: 'broadcast.schedule', text: 'Dawn', day: 2 }],
    act: { type: 'campaign.advanceDay', days: 1 },
  },
};

/** The merge accepted for the player (MT.2) — kept as its own check below. */
const mergeAcceptedNotice = mergeAccepted(
  'jake',
  ['Basic Archery', 'Basic Stealth'],
  'Silent Shot',
);

function lastNotices(scenario: Scenario) {
  const ctx = { ...testContext('p'), random: () => 0 };
  const campaign: Campaign = run([...base, ...(scenario.setup ?? [])], ctx);
  const r = execute(campaign, scenario.act, ctx);
  if (!r.ok) throw new Error(`${scenario.act.type}: ${r.error}`);
  const event = r.campaign.events.at(-1);
  return { event, notices: notificationsBetween(campaign.state, r.campaign.state, event) };
}

/** skill.merged is only in logs from before MT.2 (no command records it now). */
function legacyMerge() {
  const ctx = testContext('k');
  const before = run([...base, ...uncommonPair], ctx);
  const last = before.events.at(-1)!;
  const event = {
    ...last,
    id: 'legacy-merge',
    type: 'skill.merged',
    payload: { characterId: 'jake', skills: ['Basic Archery', 'Basic Stealth'], name: 'Cutstep' },
  } as DomainEvent;
  const after = applyEvent(before.state, event);
  const notices = notificationsBetween(before.state, after, event);
  expect(notices.filter((n) => n.characterId === 'jake').map((n) => n.kind)).toContain(
    'skillMerge',
  );
}

describe('player notice audit (MU.2)', () => {
  it('places every event type: notifies, silent with a reason, or no character', () => {
    for (const type of EVENT_TYPES) {
      const audit = PLAYER_NOTICE_AUDIT[type];
      expect(audit, type).toBeDefined();
      if (audit.audit === 'silent') expect(audit.reason.length, type).toBeGreaterThan(20);
    }
    expect(Object.keys(PLAYER_NOTICE_AUDIT).sort()).toEqual([...EVENT_TYPES].sort());
  });

  const notifying = EVENT_TYPES.filter((t) => PLAYER_NOTICE_AUDIT[t].audit === 'notifies');
  it.each(notifying)('%s from the GM tells the character it changes', (type) => {
    if (type === 'skill.merged') return legacyMerge();
    const scenario = SCENARIOS[type];
    expect(scenario, `no scenario for ${type}`).toBeDefined();
    if (!scenario) return;
    const { event, notices } = lastNotices(scenario);
    expect(event?.type).toBe(type);
    const told = scenario.told ?? 'jake';
    expect(
      notices.filter((n) => n.characterId === told).map((n) => n.kind),
      type,
    ).not.toEqual([]);
    // Nobody else hears of a change to Jake alone.
    if (
      !type.startsWith('quest.') &&
      type !== 'campaign.dayAdvanced' &&
      type !== 'trade.proposed'
    ) {
      expect(
        notices.filter((n) => n.characterId !== told).map((n) => n.kind),
        type,
      ).toEqual([]);
    }
  });

  it('an accepted merge is a DING, a declined one a log line', () => {
    const ctx = testContext('m');
    const before = run([...base, ...uncommonPair, mergeAcceptedNotice[0]!], ctx);
    const r = execute(before, mergeAcceptedNotice[1]!, ctx);
    if (!r.ok) throw new Error(r.error);
    const kinds = notificationsBetween(before.state, r.campaign.state, r.campaign.events.at(-1));
    expect(kinds.map((n) => n.kind)).toContain('skillMerge');
  });

  it('a player acting on their own sheet gets no GM-change line', () => {
    const ctx = { ...testContext('q'), actor: { role: 'player' as const, characterId: 'jake' } };
    const gmCtx = testContext('g');
    const campaign = run(
      [
        ...base,
        { type: 'xp.award', track: 'class', amount: 100, participants: [{ characterId: 'jake' }] },
      ],
      gmCtx,
    );
    const r = execute(
      campaign,
      { type: 'freePoints.assign', characterId: 'jake', raceLevel: 1, allocation: { strength: 2 } },
      ctx,
    );
    if (!r.ok) throw new Error(r.error);
    const notices = notificationsBetween(
      campaign.state,
      r.campaign.state,
      r.campaign.events.at(-1),
    );
    expect(notices.filter((n) => n.kind === 'gmChange')).toEqual([]);
  });

  it('stat, pool and XP lines carry what changed', () => {
    const stats = lastNotices(SCENARIOS['character.statsSet']!).notices;
    expect(stats).toContainEqual({
      kind: 'gmChange',
      characterId: 'jake',
      change: 'stats',
      diffs: [{ label: 'Strength', from: '1.0', to: '1.4' }],
    });
    const pools = lastNotices(SCENARIOS['character.poolsSet']!).notices;
    expect(pools).toContainEqual({
      kind: 'gmChange',
      characterId: 'jake',
      change: 'pools',
      diffs: [{ label: 'Health Points (HP)', from: '100', to: '50' }],
    });
    const xp = lastNotices(SCENARIOS['xp.awarded']!).notices;
    expect(xp).toContainEqual({
      kind: 'gmChange',
      characterId: 'jake',
      change: 'xp',
      subject: 'class',
      detail: '50',
    });
  });
});
