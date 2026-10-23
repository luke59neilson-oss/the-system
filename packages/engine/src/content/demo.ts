import { poolMax, trackCap, type Character } from '../character';
import { emptyCampaign, execute, type Campaign, type Command, type DomainEvent } from '../events';
import { dueSelections, evolutionTarget } from '../evolution';
import { xpForLevels, type XpTrack } from '../progression';
import { DEFAULT_RULES, type RulesConfig } from '../rules';
import { marksToUpgrade } from '../skills';
import { STARTER_CLASSES, starterClassSkills } from './starters';

/** Demo System text for the starting race skill (real campaigns: the skill library, M4.1). */
const IDENTIFY_TEXT = {
  description:
    'Reveals what the System knows about a creature, item or place. How much it shows depends on your level and theirs.',
  flavor: 'Knowledge is the first weapon.',
};

/**
 * The demo campaign (ROADMAP MS.4, M1.15): a ready-made party for trying the
 * app out, kept in its own campaign so it never mixes into a real one (D53).
 * It is built from ordinary GM commands, so it is exactly what a GM could have
 * typed: XP awards, menus offered and picked, evolutions released and chosen,
 * free points assigned by override, titles, items and a World Stability quest.
 * Each character keeps something for its player to try: the newest free-point
 * batch is left unassigned, and the two evolved-furthest characters have a
 * skill menu waiting.
 */
export const DEMO_CAMPAIGN_NAME = 'Demo: The Whale (practice campaign)';

export interface DemoCharacter {
  readonly id: string;
  readonly name: string;
  /** Grade the demo evolves the character into. */
  readonly grade: string;
  readonly classLevel: number;
  /** Profession (from the E-grade evolution) and its level; null before E. */
  readonly profession: { readonly name: string; readonly level: number } | null;
  /** Class name after each evolution, from F upward. */
  readonly classNames: readonly string[];
  readonly titles: readonly string[];
  /** Player nickname on the first class skill (DESIGN §6 "Jake Juice"), if any. */
  readonly nickname?: string;
}

export const DEMO_CHARACTERS: readonly DemoCharacter[] = [
  {
    id: 'demo-jake',
    name: 'Jake',
    grade: 'D',
    classLevel: 52,
    profession: { name: 'Alchemist', level: 50 },
    classNames: ['Ranger', 'Storm Ranger', 'Tempest Warden'],
    titles: ['Forerunner', 'Rapid Spread'],
    nickname: 'Old Faithful',
  },
  {
    id: 'demo-miranda',
    name: 'Miranda',
    grade: 'E',
    classLevel: 22,
    profession: { name: 'Cook', level: 18 },
    classNames: ['Ranger', 'Storm Ranger'],
    titles: ['Rapid Spread'],
  },
  {
    id: 'demo-casper',
    name: 'Casper',
    grade: 'F',
    classLevel: 7,
    profession: null,
    classNames: ['Ranger'],
    titles: [],
  },
  {
    id: 'demo-sultan',
    name: 'Sultan',
    grade: 'G',
    classLevel: 0,
    profession: null,
    classNames: [],
    titles: [],
  },
];

export const DEMO_BROADCASTS: readonly string[] = [
  'The world is dying. Find what is killing it. Delve to the heart of the world and purge the infection. Time remaining: 26 days.',
  'Welcome to the demo campaign. Nothing here touches your real campaign.',
];

export const DEMO_QUEST_ID = 'demo-quest';

/** Demo Identify entities (M3.9); tier names from DESIGN §8. */
export const DEMO_ENTITIES: readonly {
  readonly entityId: string;
  readonly name: string;
  readonly label: string;
  readonly tiers: readonly { readonly minRarity: string; readonly text: string }[];
  readonly knownBy: 'all' | readonly string[];
}[] = [
  {
    entityId: 'demo-curse',
    name: 'Curse energy (the Host’s immune response)',
    label: 'The black miasma',
    tiers: [
      {
        minRarity: 'common',
        text: '[Malignant Miasma]\nA corrupting energy seeping from the walls of this world.',
      },
      {
        minRarity: 'uncommon',
        text: '[Fever]\nThe world runs hotter wherever you gather. Something here is fighting back.',
      },
      {
        minRarity: 'rare',
        text: '[The Host’s Response]\nThis is no curse. The world is defending itself — from you.',
      },
    ],
    knownBy: 'all',
  },
  {
    entityId: 'demo-pale-hunter',
    name: 'Pale hunter (immune cell)',
    label: 'Pale hunter',
    tiers: [
      { minRarity: 'common', text: '[Pale Hunter – lvl 14]' },
      {
        minRarity: 'uncommon',
        text: '[Pale Hunter – lvl 14]\nIt does not hunt for food. It hunts whatever does not belong.',
      },
    ],
    knownBy: ['demo-casper'],
  },
  {
    entityId: 'demo-drum',
    name: 'The Drum (the whale’s heart)',
    label: 'The Drum',
    tiers: [{ minRarity: 'common', text: '[The Heart of the World]' }],
    knownBy: [],
  },
];
export const DEMO_QUEST_TITLE = 'The world is dying';

/** Characters whose newest selection menu is left for the player to pick. */
const MENU_LEFT_OPEN = new Set(['demo-jake', 'demo-miranda']);

const ADJECTIVES = [
  'Arcing',
  'Silent',
  'Keen',
  'Twin',
  'Piercing',
  'Steady',
  'Splitting',
  'Shadowed',
  'Hunter’s',
  'Gale',
  'Venom',
  'Quiet',
];
const NOUNS = ['Shot', 'Step', 'Senses', 'Mark', 'Arrow', 'Breath', 'Roll', 'Volley', 'Snare'];
/** Skill transformed at each evolution: the first class skill, renamed per grade. */
const ARCHERY_BY_GRADE: Readonly<Record<string, { name: string; rarity: string }>> = {
  F: { name: 'Archery', rarity: 'common' },
  E: { name: 'Advanced Archery', rarity: 'uncommon' },
  D: { name: 'Expert Archery', rarity: 'rare' },
};

export const DEMO_ITEMS: readonly Command[] = [
  {
    type: 'item.define',
    id: 'demo-ring-haste',
    name: 'Ring of Haste',
    rarity: 'rare',
    slot: 'ring',
    description: 'A band of pale bone that hums when you run.',
    bonuses: [{ stat: 'agility', flat: 5 }],
  },
  {
    type: 'item.define',
    id: 'demo-bow',
    name: 'Whalebone Longbow',
    rarity: 'uncommon',
    slot: 'mainHand',
    description: 'Carved from a rib the size of a tree.',
    bonuses: [{ stat: 'perception', flat: 3 }],
  },
  {
    type: 'item.define',
    id: 'demo-potion',
    name: 'Healing Potion',
    rarity: 'common',
    description: 'Restores a little health. Tastes of salt.',
  },
];

/** The demo's montage (M3.11) and the GM-only clock it runs on. */
export const DEMO_CLOCK_ID = 'demo-clock-marsh';
export const DEMO_MONTAGE_ID = 'demo-montage-marsh';

/** The demo's notes (M3.10), in creation order. `author` null = the GM. */
export const DEMO_NOTES: readonly {
  author: string | null;
  kind: 'journal' | 'party' | 'gm';
  title: string;
  body: string;
  tags: string[];
  shareable: boolean;
}[] = [
  {
    author: 'demo-jake',
    kind: 'journal',
    title: 'Something is watching',
    body: 'Third night in the forest. The **Drum** again, closer.\n\n- It stops when I draw the bow\n- Nobody else hears it\n\nNot telling the others yet.',
    tags: ['npc:the Drum', 'region:forest'],
    shareable: false,
  },
  {
    author: 'demo-jake',
    kind: 'journal',
    title: 'Questions for the System',
    body: 'Why did my *class skill* change when I evolved? Ask the GM.',
    tags: ['system'],
    shareable: true,
  },
  {
    author: 'demo-miranda',
    kind: 'party',
    title: 'Camp rules',
    body: '1. Two on watch, always\n2. Boil the river water\n3. Nobody goes past the stones alone\n\n> The miasma is thicker after dark.',
    tags: ['region:river', 'quest:tutorial'],
    shareable: true,
  },
  {
    author: null,
    kind: 'party',
    title: 'Tutorial map',
    body: 'Known so far: the river camp, the standing stones, the fever village to the east.',
    tags: ['region:forest', 'region:river'],
    shareable: true,
  },
  {
    author: null,
    kind: 'gm',
    title: 'Drum reveal (GM only)',
    body: 'The Drum is the tutorial boss. Reveal on day 9.',
    tags: ['npc:the Drum'],
    shareable: false,
  },
];

export interface DemoContext {
  readonly now: () => string;
  readonly newId: () => string;
}

/**
 * Runs the demo's GM commands on an empty campaign and returns the events to
 * append. Later commands depend on the state (due menus, free-point batches),
 * so they are built as it goes. Throws if any command is refused (a bug in
 * the demo content).
 */
export function buildDemoEvents(ctx: DemoContext): DomainEvent[] {
  let campaign: Campaign = emptyCampaign();
  const events: DomainEvent[] = [];
  const run = (command: Command, characterId: string | null = null): void => {
    const result = execute(campaign, command, {
      actor: characterId === null ? { role: 'gm' } : { role: 'player', characterId },
      sessionId: null,
      now: ctx.now,
      newId: ctx.newId,
    });
    if (!result.ok) throw new Error(`Demo command ${command.type} refused: ${result.error}`);
    campaign = result.campaign;
    events.push(...result.events);
  };
  const char = (id: string): Character => {
    const found = campaign.state?.characters[id];
    if (!found) throw new Error(`Demo character ${id} missing`);
    return found;
  };
  const archer = STARTER_CLASSES[0];
  if (!archer) throw new Error('No starter class');

  run({ type: 'campaign.create', name: DEMO_CAMPAIGN_NAME, rules: DEFAULT_RULES });
  const rules: RulesConfig = (campaign.state as { rules: RulesConfig }).rules;
  for (const c of DEMO_CHARACTERS) {
    run({
      type: 'character.create',
      id: c.id,
      name: c.name,
      className: archer.name,
      classSkills: starterClassSkills(archer),
      classWeights: archer.weights,
    });
  }

  let nameIndex = 0;
  const skillName = () => {
    const n = nameIndex++;
    const adjective = ADJECTIVES[n % ADJECTIVES.length] as string;
    const noun = NOUNS[Math.floor(n / ADJECTIVES.length) % NOUNS.length] as string;
    return `${adjective} ${noun}`;
  };
  const rarityIds = rules.skills.rarities.filter((r) => !r.reserved).map((r) => r.id);

  for (const demo of DEMO_CHARACTERS) {
    const id = demo.id;
    nameIndex = 0;
    let evolutions = 0;
    for (let guard = 0; guard < 1000; guard++) {
      // Menus as they come due (the newest may stay open for the player).
      for (const slot of dueSelections(rules, char(id))) {
        if (char(id).selections.some((s) => s.level === slot.level)) continue;
        const grade = rules.grades.find((g) => g.id === slot.grade);
        const ceiling = rarityIds.indexOf(grade?.rarityCeiling ?? 'common');
        const rarities = [ceiling, Math.max(0, ceiling - 1), Math.max(0, ceiling - 2)];
        const options = rarities.map((r, i) => ({
          name: skillName(),
          rarity: rarityIds[slot.capstone || i > 0 ? r : Math.max(0, ceiling - 1)] as string,
          description: 'A System skill.',
          kind:
            i === 2 && char(id).profession !== null ? ('profession' as const) : ('class' as const),
        }));
        run({ type: 'selection.offer', characterId: id, level: slot.level, options });
      }
      const target = evolutionTarget(rules, char(id));
      const gradeIndex = rules.grades.findIndex((g) => g.id === char(id).grade);
      const wantedIndex = rules.grades.findIndex((g) => g.id === demo.grade);
      if (target && gradeIndex < wantedIndex) {
        chooseOpenMenus(id, false);
        const archery = char(id).skills.find((s) => s.kind === 'class');
        const into = ARCHERY_BY_GRADE[target.id];
        const unlock = target.id === rules.tracks.professionUnlockGrade;
        run({
          type: 'evolution.release',
          characterId: id,
          options: [
            {
              className: demo.classNames[evolutions] ?? char(id).className,
              description: 'The System has noticed how you fight.',
              transforms:
                archery && into
                  ? [{ skill: archery.name, name: into.name, rarity: into.rarity }]
                  : [],
            },
          ],
          ...(unlock && demo.profession ? { professions: [demo.profession.name, 'Smith'] } : {}),
          // The demo's GM keeps every rarity at the re-rating (MR.1), so the
          // sheets show the whole ladder and Identify keeps its reach.
          rerate: Object.fromEntries(char(id).skills.map((s) => [s.name, s.rarity])),
        });
        run({
          type: 'evolution.choose',
          characterId: id,
          optionId: 'o1',
          profession: unlock && demo.profession ? demo.profession.name : null,
        });
        evolutions++;
        continue;
      }
      const ch = char(id);
      const cap = trackCap(rules, ch.grade);
      const wantClass = Math.min(demo.classLevel, cap) - ch.classLevel;
      const wantProfession =
        ch.profession === null || !demo.profession
          ? 0
          : Math.min(demo.profession.level, cap) - ch.professionLevel;
      const track: XpTrack | null =
        wantClass > 0 ? 'class' : wantProfession > 0 ? 'profession' : null;
      if (track === null) break;
      const levels = Math.min(5, track === 'class' ? wantClass : wantProfession);
      run({
        type: 'xp.award',
        track,
        amount: xpForLevels(rules, ch, track, levels),
        participants: [{ characterId: id }],
        reason: track === 'class' ? 'Demo: tutorial fights' : 'Demo: brewing at camp',
      });
    }
    chooseOpenMenus(id, MENU_LEFT_OPEN.has(id));
    // Free points: the GM settles all but the newest batch, which the player assigns.
    const batches = char(id).freePointBatches;
    for (const batch of batches.slice(0, -1)) {
      run({
        type: 'freePoints.override',
        characterId: id,
        raceLevel: batch.raceLevel,
        allocation: spreadByWeights(char(id).classWeights, batch.points),
      });
    }
    for (const title of demo.titles) run({ type: 'title.award', characterId: id, title });
    const firstClassSkill = char(id).skills.find((s) => s.kind === 'class');
    if (demo.nickname && firstClassSkill) {
      run({
        type: 'skill.nickname',
        characterId: id,
        skill: firstClassSkill.name,
        nickname: demo.nickname,
      });
    }
    // M3.5: the race skill's System text, and a mark toward the first class
    // skill's next rarity, so the skill detail has something to show.
    run({
      type: 'skill.describe',
      characterId: id,
      skill: rules.skills.startingRaceSkill.name,
      description: IDENTIFY_TEXT.description,
      flavor: IDENTIFY_TEXT.flavor,
    });
    const marked = char(id).skills.find((s) => s.kind === 'class');
    if (marked && marksToUpgrade(rules, marked) !== null) {
      run({ type: 'skill.awardMark', characterId: id, skill: marked.name, session: 'demo-1' });
    }
    // Rested: pools full (level-ups do not refill them, Q14).
    const stats = char(id).stats;
    run({
      type: 'character.setPools',
      characterId: id,
      pools: Object.fromEntries(rules.pools.map((p) => [p.id, poolMax(rules, stats, p.id)])),
    });
  }

  function chooseOpenMenus(id: string, leaveNewest: boolean): void {
    const open = char(id).selections.filter((s) => s.chosen === null);
    const pick = leaveNewest ? open.slice(0, -1) : open;
    for (const record of pick) {
      run({
        type: 'selection.choose',
        characterId: id,
        level: record.level,
        skill: record.options[record.level % record.options.length]?.name ?? '',
      });
    }
  }

  // Items: the GM hands out gear; Jake wears the ring and the bow.
  for (const item of DEMO_ITEMS) run(item);
  run({
    type: 'gift.give',
    characterId: null,
    to: 'demo-jake',
    currency: 120,
    items: { 'demo-ring-haste': 1, 'demo-bow': 1, 'demo-potion': 2 },
  });
  run({ type: 'item.equip', characterId: 'demo-jake', itemId: 'demo-ring-haste', slot: 'ring' });
  run({ type: 'item.equip', characterId: 'demo-jake', itemId: 'demo-bow', slot: 'mainHand' });
  for (const id of ['demo-miranda', 'demo-casper', 'demo-sultan']) {
    run({
      type: 'gift.give',
      characterId: null,
      to: id,
      currency: 40,
      items: { 'demo-potion': 1 },
    });
  }

  // The tutorial quest, its World Stability gauge visible to the players.
  run({
    type: 'quest.create',
    questId: DEMO_QUEST_ID,
    title: DEMO_QUEST_TITLE,
    text: 'Find what is killing it. Delve to the heart of the world and purge the infection.',
    days: 30,
    stability: { initial: 100, visible: true, rules: { cleanse: -5, 'pale hunter': -3, beast: 2 } },
  });
  run({ type: 'campaign.advanceDay', days: 4 });
  run({ type: 'stability.applyAction', questId: DEMO_QUEST_ID, tag: 'cleanse', count: 3 });
  run({ type: 'stability.applyAction', questId: DEMO_QUEST_ID, tag: 'beast', count: 2 });

  // Identify (M3.9): Casper has trained Identify to Uncommon, so he reads a
  // deeper tier than the others. The Drum is defined but known to nobody yet.
  for (const session of ['demo-1', 'demo-2', 'demo-3', 'demo-4']) {
    run({
      type: 'skill.awardMark',
      characterId: 'demo-casper',
      skill: rules.skills.startingRaceSkill.name,
      session,
    });
  }
  run({
    type: 'skill.upgrade',
    characterId: 'demo-casper',
    skill: rules.skills.startingRaceSkill.name,
  });
  for (const entity of DEMO_ENTITIES) {
    run({
      type: 'entity.define',
      ...entity,
      knownBy: entity.knownBy === 'all' ? DEMO_CHARACTERS.map((c) => c.id) : [...entity.knownBy],
    });
  }

  // Practice and montage (M3.11): a GM-only clock half filled with no
  // failures, and a montage on it offered to Jake and Miranda (open).
  run({ type: 'clock.create', clockId: DEMO_CLOCK_ID, name: 'Cross the marsh', segments: 6 });
  run({ type: 'clock.tick', clockId: DEMO_CLOCK_ID, result: 'success', amount: 3 });
  run({
    type: 'montage.offer',
    montageId: DEMO_MONTAGE_ID,
    clockId: DEMO_CLOCK_ID,
    label: 'Crossing the black marsh',
    characterIds: ['demo-jake', 'demo-miranda'],
  });
  run(
    {
      type: 'practice.log',
      characterId: 'demo-jake',
      action: 'Shot at moving targets from the trees',
      stat: 'perception',
    },
    'demo-jake',
  );

  // Notes (M3.10): written by whoever owns them. Jake keeps a private journal
  // entry and one he shares with the GM; Miranda and the GM leave party
  // notes; the GM's own note never reaches a player.
  for (const n of DEMO_NOTES) {
    const author = n.author;
    run(
      {
        type: 'note.create',
        characterId: author,
        kind: n.kind,
        title: n.title,
        body: n.body,
        tags: n.tags,
        ...(n.kind === 'journal' ? { shareable: n.shareable } : {}),
      },
      author,
    );
  }

  // The default class, race, profession and skill libraries (M4.2), so the GM
  // console has entries to browse; added last, so no demo character's text changes.
  run({ type: 'library.seedDefaults' });

  for (const text of DEMO_BROADCASTS) {
    run({ type: 'system.broadcast', text, characterIds: null });
  }
  return events;
}

/** Splits points over stats in proportion to weights (largest remainder; ties in stat order). */
function spreadByWeights(
  weights: Readonly<Record<string, number>>,
  points: number,
): Record<string, number> {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  const exact = entries.map(([id, w]) => ({ id, value: (points * w) / total }));
  const out: Record<string, number> = {};
  let given = 0;
  for (const e of exact) {
    out[e.id] = Math.floor(e.value);
    given += out[e.id] ?? 0;
  }
  const byRemainder = [...exact].sort(
    (a, b) => b.value - Math.floor(b.value) - (a.value - Math.floor(a.value)),
  );
  for (let i = 0; given < points; i++, given++) {
    const id = (byRemainder[i % byRemainder.length] as { id: string }).id;
    out[id] = (out[id] ?? 0) + 1;
  }
  for (const key of Object.keys(out)) if (out[key] === 0) delete out[key];
  return out;
}
