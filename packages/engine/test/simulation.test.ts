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
  banked: number;
  bankedProfession: number;
  plans: Record<string, number[]>;
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
    banked: 0,
    bankedProfession: 0,
    plans: {},
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
          name: `${NAMES[id]} Skill L${slot.level}${'abcd'[i]}`,
          rarity: rarityIds[i === 0 && slot.capstone ? ceiling : int(0, ceiling)] as string,
          kind: (char(id).profession !== null && rand() < 0.3 ? 'profession' : 'class') as
            'class' | 'profession',
          description: 'A System skill.',
        }));
        exec({ type: 'selection.offer', characterId: id, level: slot.level, options });
      }
      if (rand() < 0.75) chooseSelection(id, slot.level);
      else {
        tally.deferredChoices++;
        checkLeaks(c, `seed ${seed}, session ${sessionNo}, ${id} menu ${slot.level} pending`);
      }
    }
  };
  /** Held evolution: GM releases (1–4 options), the player chooses. */
  const evolve = (id: string, target: GradeRules, bankLevels: number, bankTrack: XpTrack) => {
    if (bankLevels > 0) {
      // Held: more XP only banks, levels stay at the cap (DESIGN §3).
      const held = char(id);
      const amount = bankLevels * target.xpPerLevel - held.xp[bankTrack];
      exec({
        type: 'xp.award',
        track: bankTrack,
        amount,
        participants: [{ characterId: id }],
      });
      const banked = char(id);
      expect(banked.classLevel, `seed ${seed}: ${id} held at the cap`).toBe(held.classLevel);
      expect(banked.professionLevel, `seed ${seed}: ${id} held`).toBe(held.professionLevel);
      expect(banked.xp[bankTrack], `seed ${seed}: ${id} XP banks`).toBe(
        held.xp[bankTrack] + amount,
      );
      tally.banked++;
      if (bankTrack === 'profession') tally.bankedProfession++;
    }
    const before = char(id);
    const race = raceLevel(rules, before);
    const unlock = target.id === rules.tracks.professionUnlockGrade;
    const ceiling = rarityIdx(target.rarityCeiling);
    const optionCount = int(1, rules.skills.menuSize.max);
    const options = Array.from({ length: optionCount }, (_, i) => {
      const count = int(rules.skills.evolutionTransforms.min, rules.skills.evolutionTransforms.max);
      const skills = shuffle(before.skills).slice(0, count);
      return {
        className: `${NAMES[id]}'s ${target.id}${i} class #${++uniq}#`,
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
    checkLeaks(c, `seed ${seed}, session ${sessionNo}, ${id} release pending`);
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
    const gained = (ch: Character, t: XpTrack) =>
      t === 'class'
        ? ch.classLevel - before.classLevel
        : ch.professionLevel - before.professionLevel;
    expect(gained(after, bankTrack), `seed ${seed}: ${id} banked XP applies at the new grade`).toBe(
      bankLevels,
    );
    if (!unlock) {
      const other: XpTrack = bankTrack === 'class' ? 'profession' : 'class';
      expect(gained(after, other), `seed ${seed}: ${id} other track unchanged`).toBe(0);
    }
    if (unlock) {
      expect(after.profession, `seed ${seed}: ${id}`).toBe(profession);
      expect(after.professionLevel, `seed ${seed}: profession starts at the class level`).toBe(
        before.classLevel,
      );
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
  /** A track to raise next (random, so the profession may lag or lead): one below the target. */
  const nextTrack = (ch: Character, target: number): XpTrack | null => {
    const tracks: XpTrack[] = ch.profession === null ? ['class'] : ['class', 'profession'];
    const level = (t: XpTrack) => (t === 'class' ? ch.classLevel : ch.professionLevel);
    const open = tracks.filter((t) => level(t) < Math.min(target, trackCap(rules, ch.grade)));
    if (open.length === 0) return null;
    return pick(open);
  };
  const afterAward = (ids: readonly string[], targets: Record<string, number>) => {
    for (const id of ids) {
      assignFreePoints(id);
      recordCheck(id);
      handleSelections(id);
      const target = evolutionTarget(rules, char(id));
      if (target) {
        // Held: XP only banks while the GM has not released it (DESIGN §3).
        const held = char(id);
        expect(held.classLevel, `seed ${seed}: ${id} held`).toBe(trackCap(rules, held.grade));
        const bankTrack: XpTrack =
          held.profession !== null && rand() < 0.5 ? 'profession' : 'class';
        const level = bankTrack === 'class' ? held.classLevel : held.professionLevel;
        const room = Math.max(0, Math.min(2, (targets[id] as number) - level));
        evolve(id, target, room > 0 && rand() < 0.5 ? int(1, room) : 0, bankTrack);
        assignFreePoints(id);
        recordCheck(id);
        handleSelections(id);
      }
    }
  };

  /** One encounter: XP for some of the party still below their session target. */
  const encounter = (targets: Record<string, number>) => {
    const wants = new Map<string, XpTrack>();
    for (const id of PARTY) {
      const t = nextTrack(char(id), targets[id] as number);
      if (t !== null) wants.set(id, t);
    }
    if (wants.size === 0) return false;
    const track: XpTrack = pick([...wants.values()]);
    const eligible = [...wants].filter(([, t]) => t === track).map(([id]) => id);
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
    afterAward(participants, targets);
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
      } else if (montageAvailable(rules, clock) && rand() < 0.8) {
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

  // Pacing plan per character: random levels per session in the DESIGN range,
  // adding up to the campaign cap over the planned sessions (no catch-up).
  const [lo, hi] = rules.campaign.typicalLevelsPerSessionRange;
  for (const id of PARTY) {
    const plan = Array.from({ length: SESSIONS }, () => rules.campaign.typicalLevelsPerSession);
    for (let n = 0; n < 400; n++) {
      const a = int(0, SESSIONS - 1);
      const b = int(0, SESSIONS - 1);
      if (a !== b && (plan[a] as number) < hi && (plan[b] as number) > lo) {
        plan[a] = (plan[a] as number) + 1;
        plan[b] = (plan[b] as number) - 1;
      }
    }
    tally.plans[id] = plan;
  }
  for (sessionNo = 1; sessionNo <= SESSIONS; sessionNo++) {
    session = `s${sessionNo}`;
    const start = Object.fromEntries(PARTY.map((id) => [id, raceLevel(rules, char(id))]));
    const targets: Record<string, number> = {};
    for (const id of PARTY) {
      targets[id] =
        (start[id] as number) + ((tally.plans[id] as number[])[sessionNo - 1] as number);
    }
    if (sessionNo === 2) {
      // A half-filled clock with no failures offers a montage (DESIGN §7).
      exec({
        type: 'clock.create',
        clockId: 'canyon',
        name: 'Cross the Rake Canyons',
        segments: 4,
      });
      exec({ type: 'clock.tick', clockId: 'canyon', result: 'success', amount: 2 });
      const clock = c.state?.clocks['canyon'];
      expect(clock && montageAvailable(rules, clock), `seed ${seed}: montage offered`).toBe(true);
      tally.montages++;
      exec({
        type: 'practice.log',
        characterId: 'casper',
        action: 'Montage: rope bridge across the scar',
        stat: 'agility',
        source: 'montage',
      });
      exec({ type: 'clock.remove', clockId: 'canyon' });
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

/** Invariants at each session end: replay equals incremental state, then the leak checks. */
function checkSession(c: Campaign, where: string): void {
  const replayed = replay(JSON.parse(JSON.stringify(c.events)) as unknown[]);
  expect(replayed.state, `${where}: replay equals incremental state`).toEqual(c.state);
  const state = c.state;
  if (!state) throw new Error(`${where}: no state`);
  checkLeaks(c, where);
}

/** GM-only and other players' pending data never reach a player; private journals never reach the GM. */
function checkLeaks(c: Campaign, where: string): void {
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

/** DESIGN §3–§5 tables as written, so the config the simulation reads is pinned to DESIGN. */
const DESIGN_GRADES = [
  // id, top level, class spread, free points, XP per level (×3 per grade, MQ.10), selection interval, rarity ceiling
  ['G', 4, 4, 2, 100, null, 'rare'],
  ['F', 14, 5, 3, 300, 5, 'rare'],
  ['E', 49, 8, 4, 900, 5, 'epic'],
  ['D', 99, 12, 6, 2700, 10, 'ancient'],
  ['C', 149, 18, 9, 8100, 10, 'legendary'],
  ['B', 199, 27, 13, 24300, 10, 'legendary'],
  ['A', 240, 40, 20, 72900, 10, 'mythical'],
] as const;

/** First session (1-based) whose cumulative planned levels reach `level`. */
const sessionReaching = (plan: readonly number[], level: number): number => {
  let sum = 0;
  for (const [i, n] of plan.entries()) {
    sum += n;
    if (sum >= level) return i + 1;
  }
  return Infinity;
};

describe('campaign simulation (ROADMAP M1.14)', () => {
  let memo: ReturnType<typeof simulate> | Error | null = null;
  /** Runs once; a failure inside the run fails every test with the seed in its message. */
  const sim = () => {
    if (memo === null) {
      try {
        memo = simulate(SEED);
      } catch (error) {
        memo = error instanceof Error ? error : new Error(String(error));
      }
    }
    if (memo instanceof Error) throw memo;
    return memo;
  };
  const finalState = () => {
    const state = sim().c.state;
    if (!state) throw new Error(`seed ${SEED}: no state`);
    return state;
  };

  it('the rules config the simulation reads matches the DESIGN tables', () => {
    expect(
      rules.grades.map((g) => [
        g.id,
        Math.min(g.topLevel, rules.campaign.levelCap),
        g.classSpreadPerLevel,
        g.freePointsPerRaceLevel,
        g.xpPerLevel,
        g.selectionInterval,
        g.rarityCeiling,
      ]),
    ).toEqual(DESIGN_GRADES);
    expect(STARTING_TOTAL).toBe(90);
    // DESIGN §3 "Reached by session" is the evolution threshold at the typical pace.
    const pace = rules.campaign.typicalLevelsPerSession;
    const thresholds: Record<string, number> = { E: 14, D: 49, C: 99, B: 149, A: 199 };
    for (const [grade, by] of Object.entries(REACHED_BY)) {
      expect(Math.ceil((thresholds[grade] as number) / pace), grade).toBe(by);
    }
  });

  it(`40 sessions, 4 characters reach level 240 (seed ${SEED})`, () => {
    const state = finalState();
    for (const id of PARTY) {
      const ch = state.characters[id] as Character;
      expect(ch.grade, `seed ${SEED}: ${id}`).toBe('A');
      expect(ch.classLevel, `seed ${SEED}: ${id}`).toBe(240);
      expect(ch.professionLevel, `seed ${SEED}: ${id}`).toBe(240);
      expect(raceLevel(rules, ch), `seed ${SEED}: ${id}`).toBe(240);
      expect(evolutionTarget(rules, ch), `seed ${SEED}: ${id}`).toBeNull();
    }
    expect(sim().tally.levelsPerSession, `seed ${SEED}`).toHaveLength(SESSIONS);
    // This test runs the whole 40-session simulation (the others reuse it);
    // under coverage instrumentation on CI it takes about 5 s, the default limit.
  }, 60_000);

  it(`race levels per session follow a random 4–8 plan averaging 6 (seed ${SEED})`, () => {
    const { tally } = sim();
    const [lo, hi] = rules.campaign.typicalLevelsPerSessionRange;
    for (const [i, row] of tally.levelsPerSession.entries()) {
      for (const [k, n] of row.entries()) {
        const id = PARTY[k] as string;
        expect(n, `seed ${SEED}, session ${i + 1}, ${id}`).toBe((tally.plans[id] as number[])[i]);
        expect(n, `seed ${SEED}, session ${i + 1}`).toBeGreaterThanOrEqual(lo);
        expect(n, `seed ${SEED}, session ${i + 1}`).toBeLessThanOrEqual(hi);
      }
    }
    const all = tally.levelsPerSession.flat();
    // The plans are random, not lockstep: every value in the range shows up,
    // and characters' paces differ.
    expect(new Set(all), `seed ${SEED}`).toEqual(new Set([4, 5, 6, 7, 8]));
    const plans = PARTY.map((id) => JSON.stringify(tally.plans[id]));
    expect(new Set(plans).size, `seed ${SEED}`).toBe(PARTY.length);
  });

  it(`DESIGN §4 check values at every grade top (seed ${SEED})`, () => {
    const { tally } = sim();
    for (const id of PARTY) expect(tally.checksSeen[id], `seed ${SEED}: ${id}`).toEqual(CHECKS);
  });

  it(`29 selections each, capstones at the grade ceiling (seed ${SEED})`, () => {
    const state = finalState();
    const slots = selectionSlots(rules);
    expect(slots).toHaveLength(29);
    for (const id of PARTY) {
      const ch = state.characters[id] as Character;
      expect(
        ch.selections.map((s) => s.level),
        `seed ${SEED}: ${id}`,
      ).toEqual(slots.map((s) => s.level));
      expect(
        ch.selections.every((s) => s.chosen !== null),
        `seed ${SEED}: ${id}`,
      ).toBe(true);
      for (const slot of slots.filter((s) => s.capstone)) {
        const menu = ch.selections.find((s) => s.level === slot.level);
        const ceiling = gradeById(slot.grade).rarityCeiling;
        expect(
          menu?.options.some((o) => o.rarity === ceiling),
          `seed ${SEED}: ${id} capstone ${slot.level}`,
        ).toBe(true);
      }
    }
    expect(sim().tally.deferredChoices, `seed ${SEED}: picks waited for downtime`).toBeGreaterThan(
      10,
    );
  });

  it(`evolutions at the thresholds, in the session the plan reaches them (seed ${SEED})`, () => {
    const { tally } = sim();
    for (const id of PARTY) {
      const mine = tally.evolutions.filter((e) => e.id === id);
      expect(
        mine.map((e) => e.race),
        `seed ${SEED}: ${id}`,
      ).toEqual([4, 14, 49, 99, 149, 199]);
      expect(
        mine.map((e) => e.to),
        `seed ${SEED}: ${id}`,
      ).toEqual(['F', 'E', 'D', 'C', 'B', 'A']);
      const plan = tally.plans[id] as number[];
      for (const e of mine) {
        expect(e.session, `seed ${SEED}: ${id} → ${e.to}`).toBe(sessionReaching(plan, e.race));
      }
    }
    expect(tally.professionPicks, `seed ${SEED}`).toBe(PARTY.length);
    expect(tally.banked, `seed ${SEED}: XP banked while held`).toBeGreaterThan(5);
    expect(tally.bankedProfession, `seed ${SEED}: profession XP banked`).toBeGreaterThan(1);
  });

  it(`the whole run is valid play that exercises the systems (seed ${SEED})`, () => {
    const { tally } = sim();
    const state = finalState();
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
    expect(tally.upgrades, `seed ${SEED}`).toBeGreaterThan(10);
    expect(tally.merges, `seed ${SEED}`).toBeGreaterThan(8);
    expect(tally.montages, `seed ${SEED}`).toBeGreaterThan(0);
    expect(tally.playerCommands, `seed ${SEED}`).toBeGreaterThan(1000);
    expect(state.day, `seed ${SEED}`).toBe(1 + 6 * SESSIONS);
    expect(state.quests['tutorial']?.status, `seed ${SEED}`).toBe('completed');
  });
});
