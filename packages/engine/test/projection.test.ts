import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_FIELD_VISIBILITY,
  CHARACTER_FIELD_VISIBILITY,
  defaultRules,
  ProjectionError,
  execute,
  identifyRarity,
  poolPercent,
  projectForPlayer,
  projectRules,
  resolveIdentify,
  type Campaign,
  type CampaignState,
  type Command,
} from '../src';
import { kit, randomCommand, rawRules, run, seededRandom, testContext } from './helpers/events';

const RULES = defaultRules();
const created: Command = { type: 'campaign.create', name: 'Whale', rules: rawRules() };
const make = (id: string, name: string): Command => ({
  type: 'character.create',
  id,
  name,
  className: 'Archer',
  classSkills: kit,
});

function party(): CampaignState {
  const c = run([
    created,
    make('jake', 'Jake'),
    make('casper', 'Casper'),
    make('miranda', 'Miranda'),
    { type: 'character.setPools', characterId: 'casper', pools: { hp: 37 } },
    {
      type: 'xp.award',
      track: 'class',
      amount: 300,
      participants: [{ characterId: 'jake' }],
    },
  ]);
  if (!c.state) throw new Error('no state');
  return c.state;
}

describe('player projection', () => {
  it('gives the viewer their own sheet in full', () => {
    const state = party();
    const view = projectForPlayer(state, 'jake');
    const jake = state.characters.jake;
    expect(view.viewerId).toBe('jake');
    expect(view.campaignName).toBe('Whale');
    expect(view.me.stats).toEqual(jake?.stats);
    expect(view.me.skills).toEqual(jake?.skills);
    expect(view.me.freePointBatches).toEqual(jake?.freePointBatches);
    expect(view.me.classLevel).toBe(3);
    expect(view.me.raceLevel).toBe(3);
    expect(view.me.pools).toEqual([
      { id: 'hp', current: 100, max: 110 },
      { id: 'mp', current: 100, max: 110 },
      { id: 'stamina', current: 100, max: 120 },
    ]);
  });

  it('limits other characters to name, race/class, levels and pool bars, in creation order', () => {
    const view = projectForPlayer(party(), 'jake');
    expect(view.party.map((m) => m.id)).toEqual(['casper', 'miranda']);
    expect(view.party[0]).toEqual({
      id: 'casper',
      name: 'Casper',
      race: 'Human',
      className: 'Archer',
      profession: null,
      classLevel: 0,
      professionLevel: 0,
      raceLevel: 0,
      grade: 'G',
      pools: [
        { id: 'hp', percent: 37 },
        { id: 'mp', percent: 100 },
        { id: 'stamina', percent: 100 },
      ],
    });
  });

  it('copies no field it does not list (allowlist)', () => {
    const state = party();
    const jake = state.characters.jake as unknown as Record<string, unknown>;
    const tampered = {
      ...state,
      gmSecret: 'x',
      characters: { ...state.characters, jake: { ...jake, gmNotes: 'secret' } },
    } as unknown as CampaignState;
    const view = projectForPlayer(tampered, 'casper');
    expect(JSON.stringify(view)).not.toContain('secret');
    expect(Object.keys(view).sort()).toEqual(['campaignName', 'me', 'party', 'rules', 'viewerId']);
  });

  it('classifies every character and campaign field', () => {
    const state = party();
    expect(Object.keys(CHARACTER_FIELD_VISIBILITY).sort()).toEqual(
      Object.keys(state.characters.jake ?? {}).sort(),
    );
    expect(Object.keys(CAMPAIGN_FIELD_VISIBILITY).sort()).toEqual(Object.keys(state).sort());
    const view = projectForPlayer(state, 'jake');
    const partyFields = Object.entries(CHARACTER_FIELD_VISIBILITY)
      .filter(([, v]) => v === 'party')
      .map(([k]) => k);
    expect(Object.keys(view.party[0] ?? {}).sort()).toEqual(
      [...partyFields, 'raceLevel', 'pools'].sort(),
    );
    const ownFields = Object.entries(CHARACTER_FIELD_VISIBILITY)
      .filter(([, v]) => v !== 'gm')
      .map(([k]) => k);
    expect(Object.keys(view.me).sort()).toEqual([...ownFields, 'raceLevel'].sort());
  });

  it('sends players only the display rules', () => {
    const rules = projectRules(RULES);
    expect(Object.keys(rules).sort()).toEqual([
      'currencyName',
      'equipmentSlots',
      'grades',
      'pools',
      'rarities',
      'stats',
    ]);
    const json = JSON.stringify(rules);
    for (const hidden of ['stability', 'evolutionGate', 'multiplier', 'gradeGapMultiplier'])
      expect(json).not.toContain(hidden);
    expect(rules.grades).toHaveLength(RULES.grades.length);
  });

  it('rejects an unknown viewer instead of falling back', () => {
    expect(() => projectForPlayer(party(), 'ghost')).toThrow(ProjectionError);
    expect(() => projectForPlayer(party(), '__proto__')).toThrow(ProjectionError);
  });
});

describe('poolPercent', () => {
  it.each([
    [0, 100, 0],
    [100, 100, 100],
    [1, 1000, 1],
    [999, 1000, 99],
    [37, 100, 37],
    [5, 0, 0],
    [-3, 100, 0],
    [150, 100, 100],
  ])('%i of %i → %i%%', (current, max, percent) => {
    expect(poolPercent(current, max)).toBe(percent);
  });
});

describe('Identify', () => {
  const tiers = [
    { minRarity: 'common', text: '[Malignant Miasma]' },
    { minRarity: 'rare', text: "[The Host's Response]" },
    { minRarity: 'uncommon', text: '[Fever]' },
  ];

  it('resolves to the best tier the viewer unlocks (DESIGN §8 example)', () => {
    expect(resolveIdentify(RULES, tiers, 'inferior')).toBeNull();
    expect(resolveIdentify(RULES, tiers, 'common')).toBe('[Malignant Miasma]');
    expect(resolveIdentify(RULES, tiers, 'uncommon')).toBe('[Fever]');
    expect(resolveIdentify(RULES, tiers, 'rare')).toBe("[The Host's Response]");
    expect(resolveIdentify(RULES, tiers, 'mythical')).toBe("[The Host's Response]");
  });

  it('never unlocks for a missing skill, an unknown viewer rarity, or an unknown tier rarity', () => {
    expect(resolveIdentify(RULES, tiers, null)).toBeNull();
    expect(resolveIdentify(RULES, tiers, 'shiny')).toBeNull();
    expect(resolveIdentify(RULES, [{ minRarity: 'shiny', text: 'x' }], 'mythical')).toBe(null);
    expect(resolveIdentify(RULES, [], 'common')).toBeNull();
  });

  it("reads the viewer's Identify rarity from their race skill", () => {
    const jake = party().characters.jake;
    if (!jake) throw new Error('missing');
    expect(identifyRarity(RULES, jake)).toBe('common');
    expect(
      identifyRarity(RULES, { skills: jake.skills.filter((s) => s.kind !== 'race') }),
    ).toBeNull();
    const upgraded = jake.skills.map((s) =>
      s.kind === 'race' ? { ...s, name: 'IDENTIFY', rarity: 'rare' } : s,
    );
    expect(identifyRarity(RULES, { skills: upgraded })).toBe('rare');
  });
});

describe('canary: GM-only and other players’ data never reach a player', () => {
  const SEED = 20261022;
  const STATES = 1000;
  const GM = 'CANARY-GM';

  /** Unique 9-digit sentinel numbers, matched as whole numbers in the JSON. */
  let next = 0;
  const sentinel = () => 700_000_000 + ++next * 7;

  interface Seeded {
    state: CampaignState;
    /** Canaries that only the owning character's player may receive. */
    owner: Map<string, { strings: string[]; numbers: number[] }>;
    /** GM-only sentinel numbers. */
    gm: number[];
  }

  function seed(state: CampaignState): Seeded {
    const s = JSON.parse(JSON.stringify(state)) as Record<string, unknown> & CampaignState;
    const rules = s.rules as unknown as Record<string, Record<string, unknown>>;
    const gm: number[] = [];
    const gmNum = () => {
      const n = sentinel();
      gm.push(n);
      return n;
    };
    // GM-only rule settings and unknown keys at every level of the rules.
    rules.gmSecret = { note: `${GM}-rules` };
    (rules.stability as Record<string, unknown>).initial = gmNum();
    (rules.stability as Record<string, unknown>).gmNote = `${GM}-stability`;
    (rules.tracks as Record<string, unknown>).evolutionGate = `${GM}-gate`;
    (rules.campaign as Record<string, unknown>).plannedSessions = gmNum();
    (rules.character as Record<string, unknown>).defaultRace = `${GM}-race`;
    for (const list of [
      s.rules.grades,
      s.rules.pools,
      s.rules.stats.list,
      s.rules.skills.rarities,
      s.rules.economy.equipmentSlots,
    ]) {
      for (const item of list as unknown as Record<string, unknown>[]) item.gmNote = `${GM}-item`;
    }
    for (const grade of s.rules.grades as unknown as Record<string, unknown>[]) {
      grade.gradeGapMultiplier = gmNum();
      grade.classSpreadPerLevel = gmNum();
    }
    (s as Record<string, unknown>).gmNotes = [`${GM}-campaign`];
    const owner = new Map<string, { strings: string[]; numbers: number[] }>();
    for (const [id, raw] of Object.entries(s.characters)) {
      const c = raw as unknown as Record<string, unknown>;
      const strings = [`OWNER-${id}-title`, `OWNER-${id}-skill`, `OWNER-${id}-nick`];
      const numbers: number[] = [];
      const num = () => {
        const n = sentinel();
        numbers.push(n);
        return n;
      };
      c.gmNotes = `${GM}-character`;
      c.titles = [strings[0]];
      c.skills = (c.skills as Record<string, unknown>[]).map((skill, i) => ({
        ...skill,
        name: i === 0 ? strings[1] : skill.name,
        nickname: i === 0 ? strings[2] : skill.nickname,
        gmNote: `${GM}-skill`,
      }));
      for (const key of ['stats', 'classWeights', 'classSpreadTotals', 'pools'] as const) {
        const record = c[key] as Record<string, number>;
        for (const statId of Object.keys(record)) record[statId] = num();
      }
      c.xp = { class: num(), profession: num(), gmNote: `${GM}-xp` };
      c.freePointBatches = (c.freePointBatches as Record<string, unknown>[]).map((b) => ({
        ...b,
        points: num(),
        gmNote: `${GM}-batch`,
      }));
      owner.set(id, { strings, numbers });
    }
    return { state: s, owner, gm };
  }

  /** Every whole number in the JSON (sentinels are integers). */
  const numbersIn = (json: string) => new Set((json.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));

  it(`holds across ${STATES} random states for every viewer (seed ${SEED})`, () => {
    const rand = seededRandom(SEED);
    const ctx = testContext('k');
    let c: Campaign = run([created, make('c1', 'One'), make('c2', 'Two')], ctx);
    let projections = 0;
    let multiParty = 0;
    for (let step = 0; step < STATES; step++) {
      const result = execute(c, randomCommand(rand, c), ctx);
      if (result.ok) c = result.campaign;
      const state = c.state;
      if (!state) throw new Error(`seed ${SEED}, step ${step}: no state`);
      const { state: seeded, owner, gm } = seed(state);
      if (state.characterOrder.length > 1) multiParty++;
      // Collect problems and assert once per state: millions of expect() calls are slow.
      const problems: string[] = [];
      for (const viewer of state.characterOrder) {
        const json = JSON.stringify(projectForPlayer(seeded, viewer));
        const nums = numbersIn(json);
        projections++;
        if (json.includes(GM)) problems.push(`${viewer}: GM canary leaked`);
        for (const n of gm) if (nums.has(n)) problems.push(`${viewer}: GM number ${n}`);
        for (const [id, canaries] of owner) {
          const mine = id === viewer;
          for (const s of canaries.strings) {
            if (json.includes(s) !== mine) problems.push(`${viewer}: ${s} present=${!mine}`);
          }
          if (mine) {
            // Non-vacuous: the viewer's own stats do arrive.
            if (!nums.has(canaries.numbers[0] as number))
              problems.push(`${viewer}: own stats missing`);
          } else {
            for (const n of canaries.numbers)
              if (nums.has(n)) problems.push(`${viewer}: ${id}'s ${n}`);
          }
        }
      }
      expect(problems, `seed ${SEED}, step ${step}`).toEqual([]);
    }
    expect(projections, `seed ${SEED}`).toBeGreaterThan(STATES * 2);
    expect(multiParty, `seed ${SEED}`).toBeGreaterThan(STATES * 0.9);
    expect(c.state?.characterOrder.length ?? 0, `seed ${SEED}`).toBeGreaterThan(3);
  });
});
