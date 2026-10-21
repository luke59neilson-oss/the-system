import { describe, expect, it } from 'vitest';
import {
  canUpgrade,
  defaultRules,
  dueSelections,
  emptyCampaign,
  evolutionTarget,
  execute,
  marksToUpgrade,
  montageAvailable,
  poolMax,
  projectForGm,
  projectForPlayer,
  raceLevel,
  replay,
  selectionSlots,
  skillPairCounts,
  statBudgetTotal,
  trackCap,
  xpForLevels,
  type Campaign,
  type Character,
  type Command,
  type CommandContext,
  type GradeRules,
  type XpTrack,
} from '../src';
import { kit, rawRules, seededRandom } from './helpers/events';

/**
 * ROADMAP M1.14 campaign simulation: 40 sessions, 4 characters, about 6 race
 * levels per session (4–8), random but always valid play from a fixed seed.
 * Every command must be accepted (valid play), and after every step the
 * campaign must satisfy the DESIGN invariants checked below.
 */
const SEED = 20261121;
const SESSIONS = 40;
const PARTY = ['jake', 'casper', 'miranda', 'neil'] as const;
const NAMES: Record<string, string> = {
  jake: 'Jake',
  casper: 'Casper',
  miranda: 'Miranda',
  neil: 'Neil',
};
/** DESIGN §4 check values: total stats with all tracks at the level. */
const CHECKS: Record<number, number> = {
  14: 194,
  49: 614,
  99: 1514,
  149: 2864,
  199: 4864,
  240: 7324,
};
/** DESIGN §3 "Reached by session" per grade. */
const REACHED_BY: Record<string, number> = { E: 3, D: 9, C: 17, B: 25, A: 34 };
// Markers that must never reach a player's browser.
const GM_NOTE = 'GM-SECRET-7f3a';
const HIDDEN_QUEST = 'HIDDEN-QUEST-91c2';
const PRIVATE_JOURNAL = 'PRIVATE-JOURNAL-5d0e';

const rules = defaultRules();
const gradeById = (id: string): GradeRules => {
  const g = rules.grades.find((x) => x.id === id);
  if (!g) throw new Error(`no grade ${id}`);
  return g;
};
/** Grade whose level range holds `level` (level 0 belongs to the first). */
const gradeOfLevel = (level: number): GradeRules => {
  const g = rules.grades.find((x) => level <= x.topLevel);
  if (!g) throw new Error(`no grade for level ${level}`);
  return g;
};
const rarityIds = rules.skills.rarities.filter((r) => !r.reserved).map((r) => r.id);
const rarityIdx = (id: string) => rarityIds.indexOf(id);
const statIds = rules.stats.list.map((s) => s.id);
const STARTING_TOTAL = rules.stats.startingValue * statIds.length;

/** Expected DESIGN §4 stat budget from levels alone (each level paid at its grade). */
function expectedBudget(classLevel: number, race: number): number {
  let total = STARTING_TOTAL;
  for (let l = 1; l <= classLevel; l++) total += gradeOfLevel(l).classSpreadPerLevel;
  for (let l = 1; l <= race; l++) total += gradeOfLevel(l).freePointsPerRaceLevel;
  return total;
}

interface Tally {
  levelsPerSession: number[][];
  evolutions: { id: string; from: string; to: string; race: number; session: number }[];
  checksSeen: Record<string, Record<number, number>>;
  accepted: Record<string, number>;
  playerCommands: number;
  marks: number;
  upgrades: number;
  merges: number;
  montages: number;
  professionPicks: number;
  deferredChoices: number;
}

function simulate(seed: number): { c: Campaign; tally: Tally } {
  const rand = seededRandom(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error(`seed ${seed}: pick from empty`);
    return items[Math.floor(rand() * items.length)] as T;
  };
  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };

  let tick = 0;
  let nextId = 0;
  let session: string | null = null;
  let sessionNo = 0;
  let uniq = 0;
  const context = (characterId: string | null): CommandContext => ({
    actor: characterId === null ? { role: 'gm' } : { role: 'player', characterId },
    sessionId: session,
    now: () => new Date(Date.UTC(2026, 9, 21, 18) + 1000 * tick++).toISOString(),
    newId: () => `x${++nextId}`,
  });

  const tally: Tally = {
    levelsPerSession: [],
    evolutions: [],
    checksSeen: Object.fromEntries(PARTY.map((id) => [id, {}])),
    accepted: {},
    playerCommands: 0,
    marks: 0,
    upgrades: 0,
    merges: 0,
    montages: 0,
    professionPicks: 0,
    deferredChoices: 0,
  };

  let c = emptyCampaign();
  /** Runs one command; valid play must always be accepted. */
  const exec = (command: Command, asPlayer: string | null = null): void => {
    const before = c;
    const result = execute(c, command, context(asPlayer));
    if (!result.ok) {
      throw new Error(
        `seed ${seed}, session ${sessionNo}: ${command.type} rejected: ${result.error}\n${JSON.stringify(command)}`,
      );
    }
    c = result.campaign;
    tally.accepted[command.type] = (tally.accepted[command.type] ?? 0) + 1;
    if (asPlayer !== null) tally.playerCommands++;
    checkInvariants(before, c, `seed ${seed}, session ${sessionNo}, after ${command.type}`);
  };
  const char = (id: string): Character => {
    const found = c.state?.characters[id];
    if (!found) throw new Error(`seed ${seed}: no ${id}`);
    return found;
  };

  // ---- Campaign set-up (session 0, outside play) ----
  exec({ type: 'campaign.create', name: 'The Whale', rules: rawRules() });
  for (const id of PARTY) {
    exec({
      type: 'character.create',
      id,
      name: NAMES[id] as string,
      className: pick(['Archer', 'Warrior', 'Mage', 'Rogue']),
      classSkills: kit.map((k) => ({ ...k, name: `${k.name} (${NAMES[id]})` })),
    });
  }
  exec({
    type: 'quest.create',
    questId: 'tutorial',
    title: 'The world is dying',
    text: 'Find what is killing it. Delve to the heart of the world and purge the infection.',
    days: 30,
    stability: { initial: 100, visible: true, rules: { cleanse: -5, hunter: -3, beast: 2 } },
  });
  exec({ type: 'quest.create', questId: 'reveal', title: HIDDEN_QUEST, visible: false });
  exec({ type: 'note.create', characterId: null, kind: 'gm', title: 'Twist', body: GM_NOTE });
  exec(
    { type: 'note.create', characterId: 'jake', kind: 'journal', body: PRIVATE_JOURNAL },
    'jake',
  );
  exec({ type: 'item.define', id: 'ring', name: 'Ring of Haste', rarity: 'rare', slot: 'ring' });
  exec({ type: 'item.define', id: 'potion', name: 'Healing Potion', rarity: 'common' });

  // ---- Helpers for one character's progression ----
  /** Player assigns every unassigned free-point batch (random split); locks it. */
  const assignFreePoints = (id: string) => {
    for (const batch of char(id).freePointBatches) {
      if (batch.allocation !== null) continue;
      const allocation: Record<string, number> = {};
      for (let p = 0; p < batch.points; p++) {
        const stat = pick(statIds);
        allocation[stat] = (allocation[stat] ?? 0) + 1;
      }
      exec(
        { type: 'freePoints.assign', characterId: id, raceLevel: batch.raceLevel, allocation },
        id,
      );
    }
  };
  const chooseSelection = (id: string, level: number) => {
    const record = char(id).selections.find((s) => s.level === level);
    if (!record || record.chosen !== null) return;
    exec(
      {
        type: 'selection.choose',
        characterId: id,
        level,
        skill: pick(record.options).name,
        offerId: record.offerId,
      },
      id,
    );
  };
  /** GM offers every due selection; the player picks now or waits for downtime. */
  const handleSelections = (id: string) => {
    for (const slot of dueSelections(rules, char(id))) {
      const offered = char(id).selections.find((s) => s.level === slot.level);
      if (!offered) {
        const ceiling = rarityIdx(gradeById(slot.grade).rarityCeiling);
        const size = int(rules.skills.menuSize.min, rules.skills.menuSize.max);
        const options = Array.from({ length: size }, (_, i) => ({
          name: `${NAMES[id]} Skill ${slot.level}${'abcd'[i]}`,
          rarity: rarityIds[i === 0 && slot.capstone ? ceiling : int(0, ceiling)] as string,
          kind: (char(id).profession !== null && rand() < 0.3 ? 'profession' : 'class') as
            'class' | 'profession',
          description: 'A System skill.',
        }));
        exec({ type: 'selection.offer', characterId: id, level: slot.level, options });
      }
      if (rand() < 0.75) chooseSelection(id, slot.level);
      else tally.deferredChoices++;
    }
  };
  /** Held evolution: GM releases (1–4 options), the player chooses. */
  const evolve = (id: string, target: GradeRules) => {
    const before = char(id);
    const race = raceLevel(rules, before);
    const unlock = target.id === rules.tracks.professionUnlockGrade;
    const ceiling = rarityIdx(target.rarityCeiling);
    const optionCount = int(1, rules.skills.menuSize.max);
    const options = Array.from({ length: optionCount }, (_, i) => {
      const count = int(rules.skills.evolutionTransforms.min, rules.skills.evolutionTransforms.max);
      const skills = shuffle(before.skills).slice(0, count);
      return {
        className: `${before.className.split(' ')[0]} ${target.id}${i}`,
        description: 'Evolve.',
        transforms: skills.map((s) => ({
          skill: s.name,
          name: `${s.name.split(' ⟶')[0]} ⟶${++uniq}`,
          rarity: rarityIds[Math.min(ceiling, rarityIdx(s.rarity) + int(0, 1))] as string,
        })),
        classWeights:
          rand() < 0.5
            ? Object.fromEntries(statIds.map((s) => [s, int(0, 3)]).concat([[pick(statIds), 4]]))
            : null,
      };
    });
    exec({
      type: 'evolution.release',
      characterId: id,
      options,
      ...(unlock ? { professions: ['Smith', 'Cook', 'Alchemist'] } : {}),
    });
    const pending = char(id).evolution;
    if (!pending) throw new Error(`seed ${seed}: release left nothing pending`);
    const profession = unlock ? pick(pending.professions) : null;
    exec(
      {
        type: 'evolution.choose',
        characterId: id,
        optionId: pick(pending.options).id,
        profession,
        releaseId: pending.releaseId,
      },
      id,
    );
    if (profession !== null) tally.professionPicks++;
    const after = char(id);
    expect(after.grade, `seed ${seed}: ${id} evolved`).toBe(target.id);
    if (unlock) {
      expect(after.profession).toBe(profession);
      expect(after.professionLevel, 'profession starts at the class level').toBe(before.classLevel);
    }
    tally.evolutions.push({ id, from: before.grade, to: target.id, race, session: sessionNo });
  };
  /** Records the DESIGN §4 check value when every track sits on a check level. */
  const recordCheck = (id: string) => {
    const ch = char(id);
    const race = raceLevel(rules, ch);
    const tracksTogether = ch.profession === null || ch.professionLevel === ch.classLevel;
    if (CHECKS[race] !== undefined && ch.classLevel === race && tracksTogether) {
      const seen = tally.checksSeen[id] as Record<number, number>;
      seen[race] = statBudgetTotal(ch);
    }
  };
  /** The track to raise next: the lower one (class on ties) that is below the target. */
  const nextTrack = (ch: Character, target: number): XpTrack | null => {
    const tracks: XpTrack[] = ch.profession === null ? ['class'] : ['class', 'profession'];
    const level = (t: XpTrack) => (t === 'class' ? ch.classLevel : ch.professionLevel);
    const open = tracks.filter((t) => level(t) < Math.min(target, trackCap(rules, ch.grade)));
    if (open.length === 0) return null;
    return open.reduce((a, b) => (level(b) < level(a) ? b : a));
  };
  const afterAward = (ids: readonly string[]) => {
    for (const id of ids) {
      assignFreePoints(id);
      recordCheck(id);
      handleSelections(id);
      const target = evolutionTarget(rules, char(id));
      if (target) {
        // Held: XP only banks while the GM has not released it (DESIGN §3).
        const held = char(id);
        expect(held.classLevel).toBe(trackCap(rules, held.grade));
        evolve(id, target);
        assignFreePoints(id);
        recordCheck(id);
        handleSelections(id);
      }
    }
  };

  /** One encounter: XP for some of the party still below their session target. */
  const encounter = (targets: Record<string, number>) => {
    const behind = PARTY.filter((id) => nextTrack(char(id), targets[id] as number) !== null);
    if (behind.length === 0) return false;
    const track: XpTrack = pick(behind.map((id) => nextTrack(char(id), targets[id] as number)!));
    const eligible = behind.filter((id) => nextTrack(char(id), targets[id] as number) === track);
    const participants = shuffle(eligible).slice(0, int(1, eligible.length));
    const needs = participants.map((id) => {
      const ch = char(id);
      const room =
        Math.min(targets[id] as number, trackCap(rules, ch.grade)) -
        (track === 'class' ? ch.classLevel : ch.professionLevel);
      return xpForLevels(rules, ch, track, Math.min(room, int(1, 3)));
    });
    if (participants.length > 1 && rand() < 0.4) {
      // Even split: every participant gets the smallest need.
      const each = Math.min(...needs);
      exec({
        type: 'xp.award',
        track,
        amount: each * participants.length,
        participants: participants.map((characterId) => ({ characterId })),
        reason: track === 'class' ? 'Pale hunter pack' : 'Crafting at camp',
      });
    } else {
      // The GM adjusts the shares by hand before confirming (DESIGN §5).
      exec({
        type: 'xp.award',
        track,
        amount: needs.reduce((a, b) => a + b, 0),
        participants: participants.map((characterId, i) => ({
          characterId,
          share: needs[i] as number,
        })),
        reason: track === 'class' ? 'Beast lord' : 'Masterwork',
      });
    }
    afterAward(participants);
    return true;
  };

  /** Some table play around the fights: practice log, items, quest, clock. */
  const sidePlay = () => {
    const id = pick(PARTY);
    const skills = char(id).skills.filter((s) => s.name !== 'Identify');
    const roll = rand();
    if (roll < 0.5 && skills.length >= 2) {
      // A favourite combo (two mergeable skills) often fights together, so merges happen.
      const ceiling = rarityIdx(gradeById(char(id).grade).rarityCeiling);
      const combo = skills.filter(
        (s) =>
          rarityIdx(s.rarity) >= rarityIdx(rules.skills.merge.minRarity) &&
          rarityIdx(s.rarity) < ceiling,
      );
      const pair =
        combo.length >= 2 && rand() < 0.6 ? combo.slice(0, 2) : shuffle(skills).slice(0, int(1, 3));
      exec(
        {
          type: 'practice.log',
          characterId: id,
          action: `${pick(['Volley', 'Ambush', 'Feint', 'Climb'])} ${++uniq}`,
          skills: pair.map((s) => s.name),
          stat: rand() < 0.5 ? pick(statIds) : null,
        },
        rand() < 0.5 ? id : null,
      );
    } else if (roll < 0.65) {
      exec({
        type: 'gift.give',
        characterId: null,
        to: id,
        currency: int(1, 30),
        items: { potion: 1 },
      });
    } else if (roll < 0.72) {
      const potions = c.state?.holdings[id]?.inventory['potion'] ?? 0;
      const other = pick(PARTY.filter((p) => p !== id));
      if (potions > 0)
        exec({ type: 'gift.give', characterId: id, to: other, items: { potion: 1 } }, id);
    } else if (roll < 0.85) {
      const quest = c.state?.quests['tutorial'];
      if (quest?.status === 'active') {
        exec({
          type: 'stability.applyAction',
          questId: 'tutorial',
          tag: pick(['cleanse', 'hunter', 'beast']),
        });
      }
    } else {
      const clock = c.state?.clocks['climb'];
      if (!clock) {
        exec({ type: 'clock.create', clockId: 'climb', name: 'Climb the Spout', segments: 6 });
      } else if (clock.filled >= clock.segments) {
        exec({ type: 'clock.remove', clockId: 'climb' });
      } else if (montageAvailable(rules, clock) && rand() < 0.5) {
        tally.montages++;
        exec({
          type: 'practice.log',
          characterId: id,
          action: `Montage: hand over hand ${++uniq}`,
          stat: pick(statIds),
          source: 'montage',
        });
        exec({ type: 'clock.remove', clockId: 'climb' });
      } else {
        exec({
          type: 'clock.tick',
          clockId: 'climb',
          result: rand() < 0.8 ? 'success' : 'failure',
        });
      }
    }
  };

  /** End-of-session review: deferred choices, marks, upgrades, merges. */
  const review = () => {
    for (const id of PARTY) {
      for (const record of char(id).selections)
        if (record.chosen === null) chooseSelection(id, record.level);
      // Marks: one per skill per session (DESIGN §6).
      for (const skill of shuffle(char(id).skills).slice(0, int(0, 3))) {
        if (marksToUpgrade(rules, skill) === null) continue;
        if (skill.markSessions.includes(session as string)) continue;
        exec({ type: 'skill.awardMark', characterId: id, skill: skill.name });
        tally.marks++;
      }
      for (const skill of char(id).skills) {
        if (canUpgrade(rules, char(id), skill) && rand() < 0.8) {
          exec({ type: 'skill.upgrade', characterId: id, skill: skill.name });
          tally.upgrades++;
        }
      }
      // Merge: one per grade, when a pair has been logged together enough.
      const ch = char(id);
      if ((ch.merges[ch.grade] ?? 0) < rules.skills.merge.maxPerCharacterPerGrade) {
        const entries = Object.values(c.state?.practice ?? {});
        const ceiling = rarityIdx(gradeById(ch.grade).rarityCeiling);
        for (const pair of skillPairCounts(entries, id)) {
          if (pair.count < rules.skills.merge.requiredJointUses) break;
          const [a, b] = pair.skills.map((n) => ch.skills.find((s) => s.name === n));
          if (!a || !b) continue;
          const min = rarityIdx(rules.skills.merge.minRarity);
          const top = Math.max(rarityIdx(a.rarity), rarityIdx(b.rarity));
          if (rarityIdx(a.rarity) < min || rarityIdx(b.rarity) < min) continue;
          if (top + rules.skills.merge.rarityStepsAboveHigher > ceiling) continue;
          exec({
            type: 'skill.merge',
            characterId: id,
            skills: [a.name, b.name],
            name: `Fusion ${++uniq}`,
          });
          tally.merges++;
          break;
        }
      }
    }
  };

  for (sessionNo = 1; sessionNo <= SESSIONS; sessionNo++) {
    session = `s${sessionNo}`;
    const start = Object.fromEntries(PARTY.map((id) => [id, raceLevel(rules, char(id))]));
    const targets: Record<string, number> = {};
    for (const id of PARTY) {
      const race = start[id] as number;
      const pace = rules.campaign.typicalLevelsPerSession;
      const [lo, hi] = rules.campaign.typicalLevelsPerSessionRange;
      targets[id] =
        sessionNo === SESSIONS
          ? rules.campaign.levelCap
          : Math.min(
              rules.campaign.levelCap,
              race + Math.max(lo, Math.min(hi, pace * sessionNo - race + int(-2, 2))),
            );
    }
    for (let guard = 0; guard < 500; guard++) {
      if (rand() < 0.35) sidePlay();
      if (!encounter(targets)) break;
    }
    for (const id of PARTY) {
      expect(
        raceLevel(rules, char(id)),
        `seed ${seed}, session ${sessionNo}: ${id} hit target`,
      ).toBe(targets[id]);
    }
    review();
    if (c.state?.quests['tutorial']?.status === 'active') {
      // The tutorial's World Stability moves with what the party did (DESIGN §8).
      for (let n = int(1, 3); n > 0; n--) {
        exec({
          type: 'stability.applyAction',
          questId: 'tutorial',
          tag: pick(['cleanse', 'hunter', 'beast']),
          count: int(1, 3),
        });
      }
    }
    exec({ type: 'campaign.advanceDay', days: 6 });
    if (sessionNo === 5)
      exec({ type: 'quest.setStatus', questId: 'tutorial', status: 'completed' });
    tally.levelsPerSession.push(
      PARTY.map((id) => raceLevel(rules, char(id)) - (start[id] as number)),
    );
    checkSession(c, `seed ${seed}, session ${sessionNo}`);
  }
  session = null;
  return { c, tally };
}

/** Invariants after every accepted command. */
function checkInvariants(before: Campaign, after: Campaign, where: string): void {
  const state = after.state;
  if (!state) throw new Error(`${where}: no state`);
  for (const quest of Object.values(state.quests)) {
    const v = quest.stability?.value ?? rules.stability.min;
    expect(v >= rules.stability.min && v <= rules.stability.max, `${where}: stability ${v}`).toBe(
      true,
    );
  }
  for (const id of state.characterOrder) {
    const ch = state.characters[id] as Character;
    const prev = before.state?.characters[id];
    const cap = trackCap(rules, ch.grade);
    const race = raceLevel(rules, ch);
    const problems: string[] = [];
    if (ch.classLevel > cap || ch.professionLevel > cap) problems.push('track above grade cap');
    if (race > cap) problems.push('race above cap');
    if (ch.profession === null && ch.professionLevel !== 0)
      problems.push('profession level without profession');
    if (ch.xp.class < 0 || ch.xp.profession < 0) problems.push('negative XP');
    for (const s of statIds) {
      const v = ch.stats[s];
      if (v === undefined || !Number.isInteger(v) || v < rules.stats.startingValue)
        problems.push(`stat ${s}=${v}`);
    }
    for (const pool of rules.pools) {
      const v = ch.pools[pool.id] ?? -1;
      if (v < 0 || v > poolMax(rules, ch.stats, pool.id)) problems.push(`pool ${pool.id}=${v}`);
    }
    // DESIGN §4: the budget is exactly the per-level grants at each level's grade.
    if (statBudgetTotal(ch) !== expectedBudget(ch.classLevel, race)) {
      problems.push(`budget ${statBudgetTotal(ch)} ≠ ${expectedBudget(ch.classLevel, race)}`);
    }
    const spread = Object.values(ch.classSpreadTotals).reduce((a, b) => a + b, 0);
    if (spread < 0) problems.push('negative spread');
    // Free points: one batch per race level gained, at that level's grade; assigned = locked.
    const batches = ch.freePointBatches;
    if (batches.length !== race) problems.push(`${batches.length} batches for race ${race}`);
    for (const b of batches) {
      if (b.points !== gradeOfLevel(b.raceLevel).freePointsPerRaceLevel)
        problems.push(`batch ${b.raceLevel} points`);
      if (b.allocation !== null) {
        const sum = Object.values(b.allocation).reduce((x, y) => x + y, 0);
        if (sum !== b.points || !b.locked) problems.push(`batch ${b.raceLevel} allocation`);
      }
    }
    // Skills: unique names; starting kit + Identify + chosen picks − merges.
    const names = ch.skills.map((s) => s.name.toLowerCase());
    if (new Set(names).size !== names.length) problems.push('duplicate skill names');
    const picks = ch.selections.filter((s) => s.chosen !== null).length;
    const merges = Object.values(ch.merges).reduce((a, b) => a + b, 0);
    if (ch.skills.length !== 4 + picks - merges) problems.push(`${ch.skills.length} skills`);
    const ceiling = rarityIdx(gradeById(ch.grade).rarityCeiling);
    for (const s of ch.skills) {
      if (rarityIdx(s.rarity) < 0) problems.push(`${s.name} rarity ${s.rarity}`);
      if (s.marks < 0) problems.push(`${s.name} marks`);
      if (rarityIdx(s.rarity) > ceiling) problems.push(`${s.name} above ceiling`);
    }
    for (const sel of ch.selections) {
      if (sel.level > ch.classLevel) problems.push(`selection ${sel.level} not reached`);
    }
    if (prev) {
      if (ch.classLevel < prev.classLevel || ch.professionLevel < prev.professionLevel)
        problems.push('level fell');
      if (raceLevel(rules, prev) > race) problems.push('race level fell');
      if (
        rules.grades.findIndex((g) => g.id === ch.grade) <
        rules.grades.findIndex((g) => g.id === prev.grade)
      ) {
        problems.push('grade fell');
      }
    }
    expect(problems, `${where}: ${id}`).toEqual([]);
  }
}

/** Invariants at each session end: replay, projections. */
function checkSession(c: Campaign, where: string): void {
  const replayed = replay(JSON.parse(JSON.stringify(c.events)) as unknown[]);
  expect(replayed.state, `${where}: replay equals incremental state`).toEqual(c.state);
  const state = c.state;
  if (!state) throw new Error(`${where}: no state`);
  const gmJson = JSON.stringify(projectForGm(state));
  expect(gmJson.includes(PRIVATE_JOURNAL), `${where}: GM sees a private journal entry`).toBe(false);
  for (const viewer of state.characterOrder) {
    const view = projectForPlayer(state, viewer);
    const json = JSON.stringify(view);
    const problems: string[] = [];
    if (json.includes(GM_NOTE)) problems.push('GM note');
    if (json.includes(HIDDEN_QUEST)) problems.push('hidden quest');
    if (viewer !== 'jake' && json.includes(PRIVATE_JOURNAL)) problems.push('journal');
    for (const other of state.characterOrder) {
      if (other === viewer) continue;
      const ch = state.characters[other] as Character;
      for (const sel of ch.selections) {
        for (const o of sel.options)
          if (sel.chosen !== o.name && json.includes(o.name))
            problems.push(`${other} menu ${o.name}`);
      }
      for (const o of ch.evolution?.options ?? [])
        if (json.includes(o.className)) problems.push(`${other} evolution`);
    }
    for (const member of view.party) {
      for (const key of [
        'stats',
        'xp',
        'freePointBatches',
        'selections',
        'evolution',
        'classWeights',
      ]) {
        if (key in member) problems.push(`party member ${member.id} has ${key}`);
      }
    }
    expect(problems, `${where}: viewer ${viewer}`).toEqual([]);
  }
}

describe('campaign simulation (ROADMAP M1.14)', () => {
  const { c, tally } = simulate(SEED);
  const state = c.state;
  if (!state) throw new Error('no state');

  it(`40 sessions, 4 characters reach level 240 (seed ${SEED})`, () => {
    for (const id of PARTY) {
      const ch = state.characters[id] as Character;
      expect(ch.grade, `seed ${SEED}: ${id}`).toBe('A');
      expect(ch.classLevel).toBe(240);
      expect(ch.professionLevel).toBe(240);
      expect(raceLevel(rules, ch)).toBe(240);
      expect(evolutionTarget(rules, ch)).toBeNull();
    }
    expect(tally.levelsPerSession).toHaveLength(SESSIONS);
  });

  it(`about 6 race levels per session, 4–8 each (seed ${SEED})`, () => {
    const [lo, hi] = rules.campaign.typicalLevelsPerSessionRange;
    for (const [i, row] of tally.levelsPerSession.entries()) {
      for (const n of row) {
        expect(n, `seed ${SEED}, session ${i + 1}`).toBeGreaterThanOrEqual(lo);
        expect(n, `seed ${SEED}, session ${i + 1}`).toBeLessThanOrEqual(hi);
      }
    }
    const all = tally.levelsPerSession.flat();
    expect(all.reduce((a, b) => a + b, 0) / all.length).toBe(6);
    // Pacing isn't a lockstep: sessions vary.
    expect(new Set(all).size, `seed ${SEED}`).toBeGreaterThanOrEqual(4);
  });

  it(`DESIGN §4 check values at every grade top (seed ${SEED})`, () => {
    for (const id of PARTY) expect(tally.checksSeen[id], `seed ${SEED}: ${id}`).toEqual(CHECKS);
  });

  it(`29 selections each, capstones at the grade ceiling (seed ${SEED})`, () => {
    const slots = selectionSlots(rules);
    expect(slots).toHaveLength(29);
    for (const id of PARTY) {
      const ch = state.characters[id] as Character;
      expect(
        ch.selections.map((s) => s.level),
        `seed ${SEED}: ${id}`,
      ).toEqual(slots.map((s) => s.level));
      expect(ch.selections.every((s) => s.chosen !== null)).toBe(true);
      for (const slot of slots.filter((s) => s.capstone)) {
        const menu = ch.selections.find((s) => s.level === slot.level);
        const ceiling = gradeById(slot.grade).rarityCeiling;
        expect(
          menu?.options.some((o) => o.rarity === ceiling),
          `${id} capstone ${slot.level}`,
        ).toBe(true);
      }
    }
    expect(tally.deferredChoices, 'some picks waited for downtime').toBeGreaterThan(0);
  });

  it(`evolutions at the thresholds, by the DESIGN §3 session (seed ${SEED})`, () => {
    for (const id of PARTY) {
      const mine = tally.evolutions.filter((e) => e.id === id);
      expect(
        mine.map((e) => e.race),
        `seed ${SEED}: ${id}`,
      ).toEqual([4, 14, 49, 99, 149, 199]);
      expect(mine.map((e) => e.to)).toEqual(['F', 'E', 'D', 'C', 'B', 'A']);
      for (const e of mine) {
        const by = REACHED_BY[e.to];
        // "Reached by session" is a pacing target; random sessions may land one either side.
        if (by !== undefined)
          expect(
            Math.abs(e.session - by),
            `${id} ${e.to} in session ${e.session}`,
          ).toBeLessThanOrEqual(1);
        else expect(e.session).toBe(1);
      }
    }
    expect(tally.professionPicks).toBe(PARTY.length);
  });

  it(`the whole run is valid play that exercises the systems (seed ${SEED})`, () => {
    for (const type of [
      'xp.award',
      'freePoints.assign',
      'selection.offer',
      'selection.choose',
      'evolution.release',
      'evolution.choose',
      'practice.log',
      'skill.awardMark',
      'skill.upgrade',
      'skill.merge',
      'gift.give',
      'stability.applyAction',
      'clock.tick',
    ]) {
      expect(tally.accepted[type] ?? 0, `seed ${SEED}: accepted ${type}`).toBeGreaterThan(0);
    }
    expect(tally.upgrades).toBeGreaterThan(10);
    expect(tally.merges).toBeGreaterThan(4);
    expect(tally.montages).toBeGreaterThan(0);
    expect(tally.playerCommands).toBeGreaterThan(1000);
    expect(state.day).toBe(1 + 6 * SESSIONS);
    expect(state.quests['tutorial']?.status).toBe('completed');
  });
});
