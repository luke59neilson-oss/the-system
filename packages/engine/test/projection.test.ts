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
import {
  kit,
  legacyBonusRules,
  randomCommand,
  rawRules,
  run,
  seededRandom,
  testContext,
} from './helpers/events';

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
  it('reports mark progress from the rules: next step, ceiling banking, ladder top (M3.5)', () => {
    const state = party();
    const jake = state.characters.jake;
    if (!jake) throw new Error('no jake');
    const at = (rarity: string, marks = 0) =>
      projectForPlayer(
        {
          ...state,
          characters: {
            ...state.characters,
            jake: {
              ...jake,
              skills: [{ ...(jake.skills[0] as (typeof jake.skills)[0]), rarity, marks }],
            },
          },
        },
        'jake',
      ).me.skills[0];
    expect(at('uncommon', 2)).toMatchObject({
      marksNeeded: 6,
      nextRarity: 'rare',
      atCeiling: false,
    });
    // G-grade's ceiling is Rare: marks bank there.
    expect(at('rare', 9)).toMatchObject({ marksNeeded: 8, nextRarity: 'epic', atCeiling: true });
    // Mythical has no mark upgrade (Divine is reserved).
    expect(at('mythical')).toMatchObject({ marksNeeded: null, nextRarity: null, atCeiling: true });
  });

  it('gives the viewer their own sheet in full', () => {
    const state = party();
    const view = projectForPlayer(state, 'jake');
    const jake = state.characters.jake;
    expect(view.viewerId).toBe('jake');
    expect(view.campaignName).toBe('Whale');
    expect(view.me.stats).toEqual(jake?.stats);
    expect(view.me.skills).toEqual(
      jake?.skills.map((s) => ({
        ...s,
        effects: null,
        marksNeeded: s.rarity === 'inferior' ? 3 : 4,
        nextRarity: s.rarity === 'inferior' ? 'common' : 'uncommon',
        atCeiling: false,
      })),
    );
    expect(view.me.freePointBatches).toEqual(jake?.freePointBatches);
    expect(view.me.classLevel).toBe(3);
    expect(view.me.raceLevel).toBe(3);
    // Full pools stay full as level-ups raise the maxima (MQ.2, D100).
    expect(view.me.pools).toEqual([
      { id: 'hp', current: 110, max: 110 },
      { id: 'mp', current: 110, max: 110 },
      { id: 'stamina', current: 120, max: 120 },
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
      portrait: null,
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
    expect(Object.keys(view).sort()).toEqual([
      'campaignName',
      'day',
      'hiddenQuests',
      'identify',
      'inventory',
      'me',
      'messages',
      'montages',
      'notes',
      'party',
      'practice',
      'quests',
      'rules',
      'viewerId',
    ]);
  });

  it('classifies every character and campaign field', () => {
    const state = party();
    // Optional fields appear only when set (MQ.15's clamped-pool marks).
    const optional = ['clampedPools'];
    expect(Object.keys(CHARACTER_FIELD_VISIBILITY).sort()).toEqual(
      [...Object.keys(state.characters.jake ?? {}), ...optional].sort(),
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
    // Derived: race level, effective stats (base + equipped items, D81) and
    // the count of earned selections still to choose (MQ.1, D103).
    expect(Object.keys(view.me).sort()).toEqual(
      [...ownFields, 'raceLevel', 'effectiveStats', 'itemCappedStats', 'selectionsDue'].sort(),
    );
  });

  it('sends players only the display rules', () => {
    const rules = projectRules(RULES);
    expect(Object.keys(rules).sort()).toEqual([
      'currencyName',
      'equipmentSlots',
      'grades',
      'marks',
      'pools',
      'rarities',
      'stats',
    ]);
    // Mark costs are already on each owned skill (marksNeeded); nothing else rides along.
    expect(Object.keys(rules.marks).sort()).toEqual(['carryOver', 'order', 'upgrades']);
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

describe('notes (M3.10)', () => {
  const ctx = testContext('n');
  const as = (characterId: string) => ({
    ...ctx,
    actor: { role: 'player' as const, characterId },
  });
  function withNotes(): CampaignState {
    let c = run([created, make('jake', 'Jake'), make('casper', 'Casper')], ctx);
    const step = (command: Command, context = ctx) => {
      const r = execute(c, command, context);
      if (!r.ok) throw new Error(r.error);
      c = r.campaign;
    };
    const note = (noteId: string, characterId: string | null, kind: 'journal' | 'party' | 'gm') =>
      ({
        type: 'note.create',
        noteId,
        characterId,
        kind,
        title: noteId,
        body: `${noteId} body`,
      }) as const;
    step(note('jake-private', 'jake', 'journal'), as('jake'));
    step({ ...note('jake-shared', 'jake', 'journal'), shareable: true }, as('jake'));
    step(note('casper-private', 'casper', 'journal'), as('casper'));
    step({ ...note('casper-shared', 'casper', 'journal'), shareable: true }, as('casper'));
    step(note('casper-party', 'casper', 'party'), as('casper'));
    step({ ...note('gm-party', null, 'party'), tags: ['quest:tutorial'] });
    step(note('gm-secret', null, 'gm'));
    if (!c.state) throw new Error('no state');
    return c.state;
  }

  it('sends the own journal (shared or not) and every party note, in creation order', () => {
    const view = projectForPlayer(withNotes(), 'jake');
    expect(view.notes.map((n) => n.id)).toEqual([
      'jake-private',
      'jake-shared',
      'casper-party',
      'gm-party',
    ]);
    expect(view.notes.find((n) => n.id === 'gm-party')).toEqual({
      id: 'gm-party',
      kind: 'party',
      author: null,
      title: 'gm-party',
      body: 'gm-party body',
      tags: ['quest:tutorial'],
      shareable: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(JSON.stringify(view)).not.toContain('gm-secret');
    expect(JSON.stringify(view)).not.toContain('casper-shared');
  });

  it('leaves unshared journal entries out of the GM View-as panes', () => {
    const state = withNotes();
    expect(projectForPlayer(state, 'jake', { viewAs: true }).notes.map((n) => n.id)).toEqual([
      'jake-shared',
      'casper-party',
      'gm-party',
    ]);
    // Everything else in a pane is the player's view.
    expect({ ...projectForPlayer(state, 'jake', { viewAs: true }), notes: [] }).toEqual({
      ...projectForPlayer(state, 'jake'),
      notes: [],
    });
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
      // M1.10: menus and released evolutions are the owner's alone.
      strings.push(`OWNER-${id}-menu`, `OWNER-${id}-evo`);
      c.selections = [
        {
          level: 5,
          offerId: 'o',
          chosen: null,
          options: [{ name: `OWNER-${id}-menu`, rarity: 'rare', kind: 'class', description: '' }],
        },
      ];
      c.evolution = {
        toGrade: 'F',
        releaseId: 'r',
        professions: [],
        options: [
          {
            id: 'o1',
            className: `OWNER-${id}-evo`,
            description: '',
            transforms: [],
            classWeights: null,
            statBonus: { strength: 5 },
          },
        ],
      };
      owner.set(id, { strings, numbers });
    }
    // Broadcasts: a whisper per character (owner-only text) and a GM-only extra key.
    const ids = Object.keys(s.characters);
    const whispers = ids.map((id) => {
      const text = `OWNER-${id}-whisper`;
      owner.get(id)?.strings.push(text);
      return {
        id: `w-${id}`,
        at: '2026-10-21T12:00:00.000Z',
        text,
        characterIds: [id],
        gmNote: `${GM}-broadcast`,
      };
    });
    (s as Record<string, unknown>).broadcasts = [
      ...s.broadcasts.map((b) => ({ ...b, gmNote: `${GM}-broadcast` })),
      ...whispers,
    ];
    // Economy (M3.7): each player gets only their own holdings, their own
    // trades and the definitions of the items those mention. The rest of the
    // library, other players' holdings and trades, and unknown keys stay hidden.
    const econ = s as Record<string, unknown>;
    const ownedItems: Record<string, unknown> = {};
    for (const id of ids) {
      ownedItems[`own-${id}`] = {
        id: `own-${id}`,
        name: `OWNER-${id}-item`,
        rarity: 'rare',
        description: `OWNER-${id}-itemdesc`,
        slot: 'ring',
        bonuses: [],
        gmNote: `${GM}-itemnote`,
      };
    }
    econ.items = {
      ...s.items,
      ...ownedItems,
      secret: {
        id: 'secret',
        name: `${GM}-item`,
        rarity: 'rare',
        description: `${GM}-desc`,
        slot: null,
        bonuses: [],
      },
    };
    econ.itemOrder = [...s.itemOrder, `${GM}-order`];
    econ.holdings = Object.fromEntries(
      ids.map((id) => {
        const mine = owner.get(id);
        const currency = sentinel();
        const count = sentinel();
        mine?.numbers.push(currency, count);
        mine?.strings.push(`OWNER-${id}-item`, `OWNER-${id}-itemdesc`);
        return [
          id,
          {
            currency,
            inventory: { [`own-${id}`]: count },
            equipped: { 'ring:0': `own-${id}` },
            gmNote: `${GM}-holdings`,
          },
        ];
      }),
    );
    const first = ids[0] ?? null;
    const second = ids[1] ?? null;
    const tradeCurrency = sentinel();
    if (first !== null) owner.get(first)?.numbers.push(tradeCurrency);
    // QF.2: trades carry item bundles. The first character holds a swap item
    // and offers it to the GM and to the second character; both parties see
    // its definition (checked below), nobody else does, and the GM-only
    // `secret` item (held by no one, in no trade) reaches no player.
    (econ.items as Record<string, unknown>).swap = {
      id: 'swap',
      name: 'TRADE-swap',
      rarity: 'rare',
      description: 'TRADE-swapdesc',
      slot: null,
      bonuses: [],
      gmNote: `${GM}-swapnote`,
    };
    if (first !== null) {
      const h = (econ.holdings as Record<string, { inventory: Record<string, number> }>)[first];
      if (h) h.inventory.swap = 1;
    }
    econ.trades = {
      ...(second !== null
        ? {
            t2: {
              id: 't2',
              from: first,
              to: second,
              give: { currency: 0, items: { swap: 1 } },
              get: { currency: 0, items: {} },
              status: 'open',
              proposedAt: '2026-10-21T12:00:00.000Z',
              closedAt: null,
            },
          }
        : {}),
      t: {
        id: 't',
        from: first,
        to: null,
        give: { currency: tradeCurrency, items: { swap: 1 } },
        get: { currency: 0, items: {} },
        status: 'open',
        proposedAt: '2026-10-21T12:00:00.000Z',
        closedAt: null,
        gmNote: `${GM}-trade`,
      },
    };
    econ.tradeOrder = [...(second !== null ? ['t2'] : []), 't', `${GM}-tradeorder`];
    // Practice (M3.11): own entries only, without tags or unknown keys.
    econ.practice = ids.map((id) => {
      owner.get(id)?.strings.push(`OWNER-${id}-practice`);
      return {
        id: `pr-${id}`,
        at: '2026-10-21T12:00:00.000Z',
        sessionId: null,
        characterId: id,
        action: `OWNER-${id}-practice`,
        skills: [],
        stat: null,
        tags: [`${GM}-practicetag`],
        source: 'montage',
        gmNote: `${GM}-practice`,
      };
    });
    // Montages (M3.11): open offers to the viewer, by label, with the own
    // focus only; never the clock, the other participants or closed ones.
    const montages: Record<string, unknown> = {
      closed: {
        id: 'closed',
        clockId: `${GM}-clock-id`,
        label: `${GM}-closed-montage`,
        characterIds: ids,
        focuses: {},
        status: 'closed',
        offeredAt: '2026-10-21T12:00:00.000Z',
      },
    };
    for (const id of ids) {
      owner.get(id)?.strings.push(`OWNER-${id}-montage`);
      montages[`m-${id}`] = {
        id: `m-${id}`,
        clockId: `${GM}-clock-id`,
        label: `OWNER-${id}-montage`,
        characterIds: [id],
        focuses: { [id]: `pr-${id}` },
        status: 'open',
        offeredAt: '2026-10-21T12:00:00.000Z',
        gmNote: `${GM}-montage`,
      };
    }
    econ.montages = montages;
    econ.montageOrder = ['closed', ...ids.map((id) => `m-${id}`), `${GM}-montageorder`];
    // Notes (M3.10): own journal (shared or not) and party notes only; never
    // GM notes, another player's journal, or unknown keys on a note.
    const note = (
      id: string,
      kind: string,
      author: string | null,
      text: string,
      shared: boolean,
    ) => ({
      id,
      kind,
      author,
      title: `${text}-title`,
      body: `${text}-body`,
      tags: [`${text}-tag`],
      shareable: shared,
      createdAt: '2026-10-21T12:00:00.000Z',
      updatedAt: '2026-10-21T12:00:00.000Z',
      gmNote: `${GM}-noteextra`,
    });
    const notes: Record<string, unknown> = {
      gm: note('gm', 'gm', null, `${GM}-gmnote`, false),
      party: note('party', 'party', null, 'PARTY-note', true),
    };
    for (const id of ids) {
      owner.get(id)?.strings.push(`OWNER-${id}-journal`, `OWNER-${id}-shared`);
      notes[`j-${id}`] = note(`j-${id}`, 'journal', id, `OWNER-${id}-journal`, false);
      notes[`s-${id}`] = note(`s-${id}`, 'journal', id, `OWNER-${id}-shared`, true);
    }
    econ.notes = notes;
    econ.noteOrder = [
      'gm',
      'party',
      ...ids.flatMap((id) => [`j-${id}`, `s-${id}`]),
      `${GM}-noteorder`,
    ];
    // Clocks (M1.11) are GM-only; hidden quests, hidden gauges and tag rules too (M1.12).
    econ.clocks = {
      k: { id: 'k', name: `${GM}-clock`, segments: gmNum(), filled: 0, failures: 0 },
    };
    econ.clockOrder = [`${GM}-clockorder`];
    econ.quests = {
      hidden: {
        id: 'hidden',
        title: `${GM}-hidden-quest`,
        text: `${GM}-hidden-text`,
        status: 'active',
        visible: false,
        days: gmNum(),
        startDay: 1,
        stability: { value: gmNum(), visible: true, rules: { [`${GM}-tag`]: gmNum() } },
        // MQ.7: the notice list names who is told; players get only a count.
        noticeTo: [...ids, `${GM}-noticeto`],
      },
      shown: {
        id: 'shown',
        title: 'The world is dying',
        text: 'Find what is killing it.',
        status: 'active',
        visible: true,
        days: 30,
        startDay: 1,
        stability: { value: gmNum(), visible: false, rules: { [`${GM}-tag2`]: gmNum() } },
        gmNote: `${GM}-quest`,
      },
    };
    econ.questOrder = ['hidden', 'shown'];
    // Identify (M3.9): each player sees only entities they know, by label, at
    // their own tier; never the GM name, deeper tiers, or who else knows it.
    const top = s.rules.skills.rarities.at(-1)?.id ?? 'legendary';
    const entities: Record<string, unknown> = {
      hidden: {
        id: 'hidden',
        name: `${GM}-entity-name`,
        label: `${GM}-entity-label`,
        tiers: [{ minRarity: 'inferior', text: `${GM}-entity-tier` }],
        knownBy: [],
        createdAt: '2026-10-21T12:00:00.000Z',
        grade: null,
        level: null,
      },
    };
    for (const id of ids) {
      owner.get(id)?.strings.push(`OWNER-${id}-entity`, `OWNER-${id}-tier`);
      entities[`e-${id}`] = {
        id: `e-${id}`,
        name: `${GM}-entity-name`,
        label: `OWNER-${id}-entity`,
        tiers: [
          { minRarity: 'inferior', text: `OWNER-${id}-tier` },
          { minRarity: top, text: `${GM}-deep-tier` },
        ],
        knownBy: [id],
        createdAt: '2026-10-21T12:00:00.000Z',
        gmNote: `${GM}-entity`,
        grade: null,
        level: null,
      };
      // MQ.8: a known target of the top grade is out of range: label only.
      owner.get(id)?.strings.push(`OWNER-${id}-far`);
      entities[`far-${id}`] = {
        id: `far-${id}`,
        name: `${GM}-far-name`,
        label: `OWNER-${id}-far`,
        tiers: [{ minRarity: 'inferior', text: `${GM}-far-tier` }],
        knownBy: [id],
        createdAt: '2026-10-21T12:00:00.000Z',
        grade: s.rules.grades.at(-1)?.id ?? 'A',
        level: gmNum(),
      };
    }
    econ.entities = entities;
    econ.entityOrder = [
      'hidden',
      ...ids.flatMap((id) => [`e-${id}`, `far-${id}`]),
      `${GM}-entityorder`,
    ];
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
        // QF.2: an item in a trade reaches exactly the trade's parties.
        const party = viewer === state.characterOrder[0] || viewer === state.characterOrder[1];
        for (const field of ['TRADE-swap', 'TRADE-swapdesc']) {
          if (json.includes(field) !== party)
            problems.push(`${viewer}: ${field} expected=${party}`);
        }
        // MQ.7: the hidden quest reaches each player as a bare count.
        if (!json.includes('"hiddenQuests":1')) problems.push(`${viewer}: hidden-quest count`);
        // Non-vacuous: party notes reach every player, in full.
        for (const part of ['title', 'body', 'tag']) {
          if (!json.includes(`PARTY-note-${part}`))
            problems.push(`${viewer}: party ${part} missing`);
        }
        for (const n of gm) if (nums.has(n)) problems.push(`${viewer}: GM number ${n}`);
        for (const [id, canaries] of owner) {
          const mine = id === viewer;
          for (const s of canaries.strings) {
            if (json.includes(s) !== mine) problems.push(`${viewer}: ${s} present=${!mine}`);
          }
          if (mine) {
            // Non-vacuous: every one of the viewer's own values arrives.
            for (const n of canaries.numbers)
              if (!nums.has(n)) problems.push(`${viewer}: own ${n} missing`);
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
  }, 60_000);
});

describe('effective stats on the player sheet (M3.7, D81)', () => {
  it('shows effective stats and pool maxima; party bars use the same maxima', () => {
    const c = run(
      [
        // M1.6 bonus rules: +10 on base 10 would pass MQ.14's item cap.
        { type: 'campaign.create', name: 'Eff', rules: legacyBonusRules() },
        {
          type: 'character.create',
          id: 'jake',
          name: 'Jake',
          className: 'Archer',
          classSkills: kit,
        },
        { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
        {
          type: 'item.define',
          id: 'amulet',
          name: 'Amulet',
          rarity: 'rare',
          slot: 'necklace',
          bonuses: [{ stat: 'vitality', flat: 10 }],
        },
        { type: 'gift.give', characterId: null, to: 'jake', items: { amulet: 1 } },
        // Not full, so the rising maximum leaves it as it is (MQ.2, D100).
        { type: 'character.setPools', characterId: 'jake', pools: { hp: 90 } },
        { type: 'item.equip', characterId: 'jake', itemId: 'amulet', slot: 'necklace' },
      ],
      testContext('eff'),
    );
    const state = c.state ?? (null as never);
    const me = projectForPlayer(state, 'jake').me;
    expect(me.stats['vitality']).toBe(10);
    expect(me.effectiveStats['vitality']).toBe(20);
    expect(me.pools.find((p) => p.id === 'hp')).toEqual({ id: 'hp', current: 90, max: 200 });
    const bar = projectForPlayer(state, 'kim').party.find((m) => m.id === 'jake');
    expect(bar?.pools.find((p) => p.id === 'hp')?.percent).toBe(45);
  });
});
