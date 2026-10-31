import { raceLevel, type Character, type CharacterSkill } from '../character';
import type { SelectionRecord } from '../evolution/model';
import type { DomainEvent } from '../events/envelope';
import { progressionOverrideSummary } from '../progression/override';
import type { Campaign } from '../events/log';
import { applyEvent, type CampaignState } from '../events/reducer';
import { repeatedEntryIds, type Note } from '../practice';

/**
 * The running session log (ROADMAP M2.4, DESIGN §7 "Logging for Claude").
 * Pure: built from the campaign's events from `fromSeq` on (the events of
 * this sitting), folded the same way the campaign is, so undone events never
 * appear. The server writes it to the exports folder; M9.1 builds the full
 * end-of-session report on top of it.
 *
 * Privacy (D62, D72): unshared journal entries never appear; GM notes appear
 * only when the GM tagged them `export`. Party notes and shareable journal
 * entries appear as they stand now.
 */

export type SessionLogKind =
  | 'character'
  | 'xp'
  | 'level'
  | 'selection'
  | 'evolution'
  | 'title'
  | 'skill'
  | 'item'
  | 'broadcast'
  | 'quest'
  | 'stability'
  | 'day'
  | 'rules'
  | 'session'
  | 'undo';

export interface SessionLogEntry {
  /** Index of the event in the campaign log. */
  readonly seq: number;
  /** Event timestamp (ISO-8601 UTC). */
  readonly at: string;
  readonly kind: SessionLogKind;
  /** One line of plain text (user text has newlines folded to spaces). */
  readonly text: string;
}

export interface SessionLogPractice {
  readonly at: string;
  readonly character: string;
  readonly action: string;
  readonly skills: readonly string[];
  readonly stat: string | null;
  readonly tags: readonly string[];
  readonly source: string;
  /** Same action, skills and stat already logged this session (DESIGN §7). */
  readonly repeat: boolean;
}

export interface SessionLogNote {
  readonly kind: Note['kind'];
  /** Author's name, or "GM". */
  readonly author: string;
  readonly title: string;
  readonly body: string;
  readonly tags: readonly string[];
  readonly updatedAt: string;
}

/** One skill on a party sheet, as the report gives it to Claude. */
export interface SessionLogSkill {
  /** Exact name (copy it as written when drafting a transform or a re-rate). */
  readonly name: string;
  readonly rarity: string;
  readonly kind: CharacterSkill['kind'];
  readonly marks: number;
  readonly nickname: string | null;
}

/**
 * A character's sheet as it stands at the end of the log (M9.A review): what
 * Claude needs to draft the next menu or evolution without guessing names.
 */
export interface SessionLogCharacter {
  readonly name: string;
  readonly race: string;
  readonly raceLevel: number;
  /** Grade id (G, F, ...). */
  readonly grade: string;
  readonly className: string;
  readonly classLevel: number;
  readonly profession: string | null;
  readonly professionLevel: number | null;
  readonly titles: readonly string[];
  readonly skills: readonly SessionLogSkill[];
  /** Menus offered and not chosen yet, with their options (rarity names). */
  readonly openMenus: readonly { readonly level: number; readonly options: readonly string[] }[];
  /** Class names of an evolution released and not chosen yet; null for none. */
  readonly evolution: readonly string[] | null;
}

export interface SessionLog {
  readonly campaignName: string;
  /** First event index covered. */
  readonly fromSeq: number;
  /** Events in the log when it was built (exclusive end). */
  readonly toSeq: number;
  readonly day: number | null;
  readonly entries: readonly SessionLogEntry[];
  readonly practice: readonly SessionLogPractice[];
  readonly notes: readonly SessionLogNote[];
  /** Every character's sheet at the end of the log, in party order. */
  readonly party: readonly SessionLogCharacter[];
}

/** The tag a GM puts on a GM note to include it in session logs and reports. */
export const EXPORT_NOTE_TAG = 'export';

/** Whether a note may appear in a session log or report. */
export function noteIsExportable(note: Note): boolean {
  switch (note.kind) {
    case 'journal':
      return note.shareable;
    case 'party':
      return true;
    case 'gm':
      return note.tags.some((t) => t.trim().toLowerCase() === EXPORT_NOTE_TAG);
  }
}

const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);
/** Folds user text onto one line so it cannot break the markdown structure. */
const line = (text: string) => text.replace(/\s+/g, ' ').trim();

function nameOf(state: CampaignState | null, id: string | null): string {
  if (id === null) return 'GM';
  return line(state?.characters[id]?.name ?? id);
}

function bundleText(
  state: CampaignState | null,
  bundle: { currency: number; items: Readonly<Record<string, number>> },
  signed = false,
): string {
  const parts: string[] = [];
  const num = (n: number) => (signed && n > 0 ? `+${n}` : String(n));
  if (bundle.currency !== 0) parts.push(`${num(bundle.currency)} currency`);
  for (const [itemId, count] of Object.entries(bundle.items).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    parts.push(`${num(count)}× ${line(state?.items[itemId]?.name ?? itemId)}`);
  }
  return parts.length ? parts.join(', ') : 'nothing';
}

function rarityName(state: CampaignState, id: string): string {
  return state.rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
}

function skillRarity(character: Character | undefined, skill: string): string | null {
  return character?.skills.find((s) => s.name === skill)?.rarity ?? null;
}

/** Level gains and new professions between two states (losses come only from undo). */
function levelLines(before: CampaignState | null, after: CampaignState): string[] {
  const out: string[] = [];
  for (const id of after.characterOrder) {
    const now = after.characters[id];
    const was = before?.characters[id];
    if (!now || !was) continue;
    const who = line(now.name);
    if (now.classLevel > was.classLevel) {
      out.push(`${who}: class ${line(now.className)} ${was.classLevel} → ${now.classLevel}`);
    }
    if (now.profession !== null && was.profession === null) {
      // It starts at the class level, not a level-up from 0 (MQ.6).
      out.push(
        `${who} gained the profession ${line(now.profession)} at level ${now.professionLevel}`,
      );
    } else if (now.profession !== null && now.professionLevel > was.professionLevel) {
      out.push(
        `${who}: profession ${line(now.profession)} ${was.professionLevel} → ${now.professionLevel}`,
      );
    }
    const raceWas = raceLevel(before?.rules ?? after.rules, was);
    const raceNow = raceLevel(after.rules, now);
    if (raceNow > raceWas) {
      const points = (c: Character) => c.freePointBatches.reduce((a, b) => a + b.points, 0);
      const gained = points(now) - points(was);
      const extra = gained > 0 ? ` (+${gained} free points)` : '';
      out.push(`${who}: race ${line(now.race)} ${raceWas} → ${raceNow}${extra}`);
    }
  }
  return out;
}

/** Log lines for one counted event, given the state before and after it. */
export function describeEvent(
  before: CampaignState | null,
  after: CampaignState,
  event: DomainEvent,
): { kind: SessionLogKind; text: string }[] {
  const out: { kind: SessionLogKind; text: string }[] = [];
  const add = (kind: SessionLogKind, text: string) => out.push({ kind, text });
  const who = (id: string | null) => nameOf(after, id);
  switch (event.type) {
    case 'character.created': {
      const c = after.characters[event.payload.id];
      if (c)
        add('character', `New character ${line(c.name)} (${line(c.race)}, ${line(c.className)})`);
      break;
    }
    case 'character.renamed':
      add(
        'character',
        `${nameOf(before, event.payload.characterId)} is now called ${who(event.payload.characterId)}`,
      );
      break;
    case 'character.portraitSet':
      add(
        'character',
        event.payload.portrait === null
          ? `${who(event.payload.characterId)}'s portrait was removed`
          : `${who(event.payload.characterId)} has a new portrait`,
      );
      break;
    case 'character.progressionSet': {
      // MT.5: say it was the GM's override, so the level lines that follow
      // are not read as earned level-ups.
      const was = before?.characters[event.payload.characterId];
      const changes = was
        ? progressionOverrideSummary(before.rules, was, event.payload).changes
        : [];
      add(
        'character',
        `The GM set ${who(event.payload.characterId)}'s level, XP or grade${changes.length ? `: ${changes.join(', ')}` : ''}`,
      );
      break;
    }
    case 'xp.awarded': {
      const p = event.payload;
      const shares = p.shares.map((s) => `${who(s.characterId)} ${s.share}`).join(', ');
      const enemy =
        (p.enemyLevel === null ? '' : `, enemy level ${p.enemyLevel}`) +
        (p.enemyGrade === undefined ? '' : `, enemy grade ${p.enemyGrade}`);
      const reason = p.reason ? ` for ${line(p.reason)}` : '';
      add('xp', `${p.amount} ${p.track} XP${reason}${enemy}: ${shares}`);
      break;
    }
    case 'title.awarded':
      add(
        'title',
        `${who(event.payload.characterId)} earned the title ${line(event.payload.title)}`,
      );
      break;
    case 'selection.offered':
      add(
        'selection',
        `Skill menu offered to ${who(event.payload.characterId)} at class level ${event.payload.level}: ${event.payload.options
          .map((o) => `${line(o.name)} (${rarityName(after, o.rarity)})`)
          .join(', ')}`,
      );
      break;
    case 'selection.chosen': {
      const rarity = skillRarity(after.characters[event.payload.characterId], event.payload.skill);
      const r = rarity ? ` (${rarityName(after, rarity)})` : '';
      add(
        'selection',
        `${who(event.payload.characterId)} chose ${line(event.payload.skill)}${r} at class level ${event.payload.level}`,
      );
      break;
    }
    case 'selection.optionWithdrawn':
      add(
        'selection',
        `${line(event.payload.skill)} withdrawn from ${who(event.payload.characterId)}'s passed-over options`,
      );
      break;
    case 'evolution.released':
      add(
        'evolution',
        `Evolution released for ${who(event.payload.characterId)}: ${event.payload.options
          .map((o) => line(o.className))
          .join(', ')}`,
      );
      break;
    case 'evolution.chosen': {
      const id = event.payload.characterId;
      const was = before?.characters[id];
      const now = after.characters[id];
      if (!now) break;
      const grade = was && was.grade !== now.grade ? `, grade ${was.grade} → ${now.grade}` : '';
      const offered = (was?.evolution?.professions.length ?? 0) > 0;
      const prof = event.payload.profession
        ? `, profession ${line(event.payload.profession)}`
        : offered
          ? ', no profession for now'
          : '';
      // A merge offered as part of the evolution (M5.2) is a notable event too.
      const chosen = was?.evolution?.options.find((o) => o.id === event.payload.optionId);
      const merged = (chosen?.transforms ?? [])
        .filter((t) => t.merge !== undefined)
        .map((t) => `, merged ${line(t.skill)} + ${line(t.merge ?? '')} into ${line(t.name)}`)
        .join('');
      add('evolution', `${who(id)} evolved into ${line(now.className)}${grade}${prof}${merged}`);
      break;
    }
    case 'skill.upgraded': {
      const id = event.payload.characterId;
      const from = skillRarity(before?.characters[id], event.payload.skill);
      const to = skillRarity(after.characters[id], event.payload.skill);
      const change = from && to ? `: ${rarityName(after, from)} → ${rarityName(after, to)}` : '';
      add('skill', `${who(id)} upgraded ${line(event.payload.skill)}${change}`);
      break;
    }
    case 'skill.granted': {
      // QF.48: a skill the GM gives is part of what happened at the table.
      const p = event.payload;
      add(
        'skill',
        `The GM gave ${who(p.characterId)} ${line(p.name)} (${rarityName(after, p.rarity)}, ${p.kind} skill)`,
      );
      break;
    }
    case 'character.poolsSet': {
      // QF.48: damage and healing, pool by pool.
      const id = event.payload.characterId;
      const was = before?.characters[id];
      const now = after.characters[id];
      if (!was || !now) break;
      const changes = after.rules.pools.flatMap((pool) => {
        const from = was.pools[pool.id];
        const to = now.pools[pool.id];
        if (from === undefined || to === undefined || from === to) return [];
        const delta = to - from;
        return [`${line(pool.name)} ${from} → ${to} (${delta > 0 ? '+' : '−'}${Math.abs(delta)})`];
      });
      if (changes.length > 0) add('character', `${who(id)}: ${changes.join(', ')}`);
      break;
    }
    case 'skill.markAwarded':
      add(
        'skill',
        `${who(event.payload.characterId)} earned a mark on ${line(event.payload.skill)}`,
      );
      break;
    case 'skill.merged': {
      const id = event.payload.characterId;
      const rarity = skillRarity(after.characters[id], event.payload.name);
      const r = rarity ? ` (${rarityName(after, rarity)})` : '';
      const [a, b] = event.payload.skills;
      add(
        'skill',
        `${who(id)} merged ${line(a)} and ${line(b)} into ${line(event.payload.name)}${r}`,
      );
      break;
    }
    case 'skill.mergeOffered': {
      const [a, b] = event.payload.skills;
      add(
        'skill',
        `The GM offered ${who(event.payload.characterId)} a merge of ${line(a)} and ${line(b)} into ${line(event.payload.name)}`,
      );
      break;
    }
    case 'skill.mergeAnswered': {
      // MT.2: the offer is gone after the answer, so read it from before.
      const id = event.payload.characterId;
      const offer = before?.characters[id]?.mergeOffer ?? null;
      if (!offer) break;
      const [a, b] = offer.skills;
      if (event.payload.accept) {
        const rarity = skillRarity(after.characters[id], offer.name);
        const r = rarity ? ` (${rarityName(after, rarity)})` : '';
        add('skill', `${who(id)} merged ${line(a)} and ${line(b)} into ${line(offer.name)}${r}`);
      } else {
        add('skill', `${who(id)} declined merging ${line(a)} and ${line(b)}`);
      }
      break;
    }
    case 'gift.given':
      add(
        'item',
        `${who(event.payload.characterId)} gave ${who(event.payload.to)}: ${bundleText(after, event.payload.bundle)}`,
      );
      break;
    case 'loot.rolled': {
      const roll = after.lootLog.find((r) => r.id === event.id);
      if (roll) {
        const to = roll.characterId === null ? '' : ` for ${who(roll.characterId)}`;
        add('item', `GM rolled ${line(roll.tableName)}${to}: ${bundleText(after, roll.bundle)}`);
      }
      break;
    }
    case 'holdings.adjusted': {
      const p = event.payload;
      const reason = p.reason ? ` (${line(p.reason)})` : '';
      add(
        'item',
        `GM adjusted ${who(p.characterId)}'s holdings: ${bundleText(after, { currency: p.currency, items: p.items }, true)}${reason}`,
      );
      break;
    }
    case 'trade.accepted': {
      const trade = after.trades[event.payload.tradeId];
      if (trade) {
        add(
          'item',
          `Trade: ${who(trade.from)} gave ${who(trade.to)} ${bundleText(after, trade.give)}; ${who(trade.to)} gave ${bundleText(after, trade.get)}`,
        );
      }
      break;
    }
    case 'system.broadcast': {
      const to = event.payload.characterIds;
      const audience = to === null ? 'everyone' : to.map((id) => who(id)).join(', ');
      const shown = event.payload.display;
      const banner = !shown
        ? ''
        : shown.mode === 'pinned'
          ? ' (pinned banner)'
          : ` (banner for ${shown.seconds} s)`;
      add('broadcast', `System message to ${audience}${banner}: ${line(event.payload.text)}`);
      break;
    }
    case 'broadcast.removed': {
      const b = after.broadcasts.find((x) => x.id === event.payload.id);
      add('broadcast', `Banner taken down: ${line(b?.text ?? event.payload.id)}`);
      break;
    }
    case 'broadcast.scheduled': {
      const to = event.payload.characterIds;
      const audience = to === null ? 'everyone' : to.map((id) => who(id)).join(', ');
      add(
        'broadcast',
        `System message scheduled for day ${event.payload.day} to ${audience}: ${line(event.payload.text)}`,
      );
      break;
    }
    case 'broadcast.unscheduled': {
      const b = before?.scheduledBroadcasts.find((x) => x.id === event.payload.id);
      add('broadcast', `Scheduled System message cancelled${b ? `: ${line(b.text)}` : ''}`);
      break;
    }
    case 'quest.created': {
      const q = after.quests[event.payload.questId];
      if (q) {
        const hidden = q.visible ? '' : ' (hidden from players)';
        const timer = q.days === null ? '' : `, ${q.days} days`;
        const gauge = q.stability ? `, World Stability ${q.stability.value}` : '';
        add('quest', `New quest: ${line(q.title)}${hidden}${timer}${gauge}`);
      }
      break;
    }
    case 'quest.edited': {
      const q = after.quests[event.payload.questId];
      if (q) add('quest', `Quest edited: ${line(q.title)}`);
      break;
    }
    case 'quest.statusSet': {
      const q = after.quests[event.payload.questId];
      if (q) add('quest', `Quest ${line(q.title)}: ${q.status}`);
      break;
    }
    case 'stability.actionApplied':
    case 'stability.nudged': {
      const id = event.payload.questId;
      const from = before?.quests[id]?.stability?.value;
      const q = after.quests[id];
      const to = q?.stability?.value;
      if (!q || from === undefined || to === undefined) break;
      const how =
        event.type === 'stability.actionApplied'
          ? `${line(event.payload.tag)} × ${event.payload.count}`
          : 'GM nudge';
      const reason = event.payload.reason ? `; ${line(event.payload.reason)}` : '';
      add('stability', `World Stability (${line(q.title)}): ${from} → ${to} (${how}${reason})`);
      break;
    }
    case 'rules.migrated': {
      // MR.3 (L16, D153): logged like any change, with the banked XP it cleared.
      const cleared = event.payload.banked.map(
        (x) => `${who(x.characterId)} ${x.xp} ${x.track} XP`,
      );
      add(
        'rules',
        `Rules updated: XP now overflows (DESIGN §2)${cleared.length ? `; banked XP re-applied under overflow: ${cleared.join(', ')}` : ''}`,
      );
      break;
    }
    case 'campaign.dayAdvanced': {
      add('day', `Day ${before?.day ?? after.day - event.payload.days} → ${after.day}`);
      for (const b of after.broadcasts.slice(
        before?.broadcasts.length ?? after.broadcasts.length,
      )) {
        const to = b.characterIds;
        const audience = to === null ? 'everyone' : to.map((id) => who(id)).join(', ');
        add('broadcast', `Scheduled System message to ${audience}: ${line(b.text)}`);
      }
      break;
    }
    case 'session.started':
    case 'session.ended': {
      const s = after.sessions.find((x) => x.id === event.payload.sessionId);
      if (s) {
        const what = event.type === 'session.started' ? 'started' : 'ended';
        add('session', `Session ${s.number} ${what} (day ${after.day})`);
      }
      break;
    }
    default:
      break;
  }
  for (const text of levelLines(before, after)) add('level', text);
  return out;
}

/**
 * Where a sitting's fold starts: the state of the events before `fromSeq`
 * that still count, and how many sitting undos reached back before it. Pass
 * it to `buildSessionLog` to skip re-folding the whole campaign; it stays
 * valid while `preUndos` is unchanged (only those undos change that state).
 */
export interface SessionLogBase {
  readonly fromSeq: number;
  readonly state: CampaignState | null;
  readonly preUndos: number;
}

function sittingIds(campaign: Campaign, start: number): Set<string> {
  const ids = new Set<string>();
  for (let i = start; i < campaign.events.length; i++) {
    const e = campaign.events[i];
    if (e) ids.add(e.id);
  }
  return ids;
}

/** Sitting undos whose target is an event from before the sitting. */
function countPreUndos(campaign: Campaign, start: number, sitting: Set<string>): number {
  let n = 0;
  for (let i = start; i < campaign.events.length; i++) {
    const e = campaign.events[i];
    if (e?.type === 'event.undone' && !sitting.has(e.payload.eventId)) n++;
  }
  return n;
}

/** Folds the counted events before `fromSeq` (see SessionLogBase). */
export function sessionLogBase(campaign: Campaign, fromSeq: number): SessionLogBase {
  const start = Math.max(0, fromSeq);
  let state: CampaignState | null = null;
  for (let seq = 0; seq < Math.min(start, campaign.events.length); seq++) {
    const event = campaign.events[seq];
    if (!event || event.type === 'event.undone' || has(campaign.undone, event.id)) continue;
    state = applyEvent(state, event);
  }
  return {
    fromSeq: start,
    state,
    preUndos: countPreUndos(campaign, start, sittingIds(campaign, start)),
  };
}

/** Whether `base` still matches the campaign (no new undo reached back before it). */
export function sessionLogBaseIsCurrent(campaign: Campaign, base: SessionLogBase): boolean {
  const sitting = sittingIds(campaign, base.fromSeq);
  return base.preUndos === countPreUndos(campaign, base.fromSeq, sitting);
}

/**
 * Builds the session log for the events from `fromSeq` on. Undone events and
 * their undos inside that range leave no trace; an undo of an earlier event
 * is noted, since it changes state this sitting. A `base` from
 * `sessionLogBase` is reused when still valid, else the fold starts at 0.
 */
export function buildSessionLog(
  campaign: Campaign,
  fromSeq: number,
  base?: SessionLogBase,
  /** Stop before this index (an ended session's report); the end of the log when omitted. */
  toSeq?: number,
): SessionLog {
  const entries: SessionLogEntry[] = [];
  const practiceIds = new Set<string>();
  const noteIds = new Set<string>();
  const start = Math.max(0, fromSeq);
  const sitting = sittingIds(campaign, start);
  const reuse =
    base !== undefined && base.fromSeq === start && sessionLogBaseIsCurrent(campaign, base);
  let state: CampaignState | null = reuse ? base.state : null;
  const end = Math.min(campaign.events.length, Math.max(start, toSeq ?? campaign.events.length));
  for (let seq = reuse ? start : 0; seq < end; seq++) {
    const event = campaign.events[seq];
    if (!event) continue;
    if (event.type === 'event.undone') {
      const target = event.payload.eventId;
      if (seq >= start && !sitting.has(target)) {
        entries.push({
          seq,
          at: event.timestamp,
          kind: 'undo',
          text: 'GM undid an earlier change',
        });
      }
      continue;
    }
    if (has(campaign.undone, event.id)) continue;
    const after = applyEvent(state, event);
    if (seq >= start) {
      for (const e of describeEvent(state, after, event)) {
        entries.push({ seq, at: event.timestamp, ...e });
      }
      // QF.48: a cast joins the practice log under its own event id.
      if (event.type === 'practice.logged' || event.type === 'skill.cast')
        practiceIds.add(event.id);
      if (event.type === 'note.created' || event.type === 'note.edited') {
        noteIds.add(event.payload.noteId);
      }
    }
    state = after;
  }
  const final: CampaignState | null = state;
  const repeats = final ? repeatedEntryIds(final.practice) : new Set<string>();
  const practice: SessionLogPractice[] = (final?.practice ?? [])
    .filter((p) => practiceIds.has(p.id))
    .map((p) => ({
      at: p.at,
      character: nameOf(final, p.characterId),
      action: line(p.action),
      skills: p.skills.map(line),
      stat:
        p.stat === null
          ? null
          : (final?.rules.stats.list.find((s) => s.id === p.stat)?.name ?? p.stat),
      tags: p.tags.map(line),
      source: p.source,
      repeat: repeats.has(p.id),
    }));
  const notes: SessionLogNote[] = (final?.noteOrder ?? []).flatMap((id) => {
    const note = final?.notes[id];
    if (!note || !noteIds.has(id) || !noteIsExportable(note)) return [];
    return [
      {
        kind: note.kind,
        author: nameOf(final, note.author),
        title: line(note.title),
        body: note.body,
        tags: note.tags.map(line),
        updatedAt: note.updatedAt,
      },
    ];
  });
  return {
    campaignName: line(final?.name ?? ''),
    fromSeq: start,
    toSeq: end,
    day: final?.day ?? null,
    entries,
    practice,
    notes,
    party: final ? partySheets(final) : [],
  };
}

function partySheets(state: CampaignState): SessionLogCharacter[] {
  return state.characterOrder.flatMap((id) => {
    const c = has(state.characters, id) ? state.characters[id] : undefined;
    if (!c) return [];
    const withheld = (r: SelectionRecord) => new Set(r.withdrawn ?? []);
    return [
      {
        name: c.name,
        race: c.race,
        raceLevel: raceLevel(state.rules, c),
        grade: c.grade,
        className: c.className,
        classLevel: c.classLevel,
        profession: c.profession,
        professionLevel: c.profession === null ? null : c.professionLevel,
        titles: [...c.titles],
        skills: c.skills.map((k) => ({
          name: k.name,
          rarity: rarityName(state, k.rarity),
          kind: k.kind,
          marks: k.marks,
          nickname: k.nickname,
        })),
        openMenus: c.selections
          .filter((r) => r.chosen === null)
          .map((r) => ({
            level: r.level,
            options: r.options
              .filter((o) => !withheld(r).has(o.name))
              .map((o) => `${o.name} (${rarityName(state, o.rarity)})`),
          })),
        evolution: c.evolution ? c.evolution.options.map((o) => o.className) : null,
      },
    ];
  });
}

/** `[Basic Archery (Inferior)]`, then marks and a nickname when it has them. */
function skillText(k: SessionLogSkill): string {
  const marks = k.marks > 0 ? ` ${k.marks} mark${k.marks === 1 ? '' : 's'}` : '';
  const nick = k.nickname ? ` nickname "${line(k.nickname)}"` : '';
  return `[${line(k.name)} (${k.rarity})]${marks}${nick}`;
}

function renderParty(party: readonly SessionLogCharacter[], out: string[]): void {
  out.push('## Party');
  out.push('');
  if (party.length === 0) {
    out.push('No characters yet.');
    out.push('');
  } else {
    out.push(
      "Sheets as they stand at the end of this log. A skill's name is the text in brackets before its rarity; copy it exactly when drafting content.",
    );
    out.push('');
  }
  for (const c of party) {
    out.push(`### ${line(c.name)}`);
    out.push('');
    out.push(`- Race: [${line(c.race)} (${c.grade}) – lvl ${c.raceLevel}]`);
    out.push(`- Class: [${line(c.className)} – lvl ${c.classLevel}]`);
    out.push(
      c.profession === null
        ? '- Profession: none'
        : `- Profession: [${line(c.profession)} – lvl ${c.professionLevel ?? 0}]`,
    );
    out.push(
      `- Titles: ${c.titles.length ? c.titles.map((t) => `[${line(t)}]`).join(', ') : 'none'}`,
    );
    for (const kind of ['class', 'profession', 'race'] as const) {
      const skills = c.skills.filter((k) => k.kind === kind);
      if (skills.length === 0) continue;
      const head = kind.charAt(0).toUpperCase() + kind.slice(1);
      out.push(`- ${head} skills: ${skills.map(skillText).join(', ')}`);
    }
    for (const m of c.openMenus) {
      out.push(
        `- Skill menu at level ${m.level}, not chosen yet: ${m.options.map((o) => `[${line(o)}]`).join(', ')}`,
      );
    }
    if (c.evolution) {
      out.push(
        `- Evolution released, not chosen yet: ${c.evolution.map((o) => `[${line(o)}]`).join(', ')}`,
      );
    }
    out.push('');
  }
}

/** `2026-10-21T19:02:03.000Z` → `19:02:03`. */
const clock = (iso: string) => iso.slice(11, 19);

/** Indents note bodies so their own markdown headings stay inside the note. */
const quoteBody = (body: string) =>
  body.trim() === ''
    ? '> (empty)'
    : body
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((l) => (l === '' ? '>' : `> ${l}`))
        .join('\n');

/**
 * Where a play session's events are in the log (M4.3): from its counting
 * `session.started` to just after its counting `session.ended` (`toSeq` null
 * while it runs). Null when no counting start exists.
 */
export function sessionEventRange(
  campaign: Campaign,
  sessionId: string,
): { readonly fromSeq: number; readonly toSeq: number | null } | null {
  let fromSeq = -1;
  for (let seq = 0; seq < campaign.events.length; seq++) {
    const e = campaign.events[seq];
    if (!e || has(campaign.undone, e.id)) continue;
    if (e.type === 'session.started' && e.payload.sessionId === sessionId) fromSeq = seq;
    if (e.type === 'session.ended' && e.payload.sessionId === sessionId && fromSeq >= 0) {
      return { fromSeq, toSeq: seq + 1 };
    }
  }
  return fromSeq >= 0 ? { fromSeq, toSeq: null } : null;
}

/** Header facts about the play session a log covers (M4.3). */
export interface SessionLogSessionMeta {
  readonly number: number;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly startDay: number;
  readonly endDay: number | null;
}

/**
 * Renders the log as markdown for the exports folder. With `session`, it is
 * that session's running log, or its report once the session has ended.
 */
export function renderSessionLog(
  log: SessionLog,
  meta: {
    readonly startedAt: string;
    readonly writtenAt: string;
    readonly session?: SessionLogSessionMeta | undefined;
  },
): string {
  const out: string[] = [];
  const name = log.campaignName || 'Campaign';
  const s = meta.session;
  if (s) {
    out.push(
      s.endedAt === null
        ? `# Session ${s.number} log (running): ${name}`
        : `# Session ${s.number} report: ${name}`,
    );
    out.push('');
    out.push(`- Session started: ${s.startedAt}`);
    out.push(s.endedAt === null ? '- Session still running' : `- Session ended: ${s.endedAt}`);
    out.push(`- Last written: ${meta.writtenAt}`);
    const lastDay = s.endDay ?? log.day ?? s.startDay;
    out.push(
      lastDay === s.startDay
        ? `- In-game day: ${lastDay}`
        : `- In-game days: ${s.startDay}–${lastDay}`,
    );
  } else {
    out.push(`# Session log: ${name}`);
    out.push('');
    out.push(`- Sitting started: ${meta.startedAt}`);
    out.push(`- Last written: ${meta.writtenAt}`);
    if (log.day !== null) out.push(`- In-game day: ${log.day}`);
  }
  out.push(`- Events: ${log.fromSeq}–${Math.max(log.fromSeq, log.toSeq - 1)} of the campaign log`);
  out.push('- GM-only file: it includes hidden quests and GM reasons. Do not show it to players.');
  out.push(
    '- Times are UTC. Unshared journal entries and GM notes not tagged "export" are left out.',
  );
  out.push('');
  renderParty(log.party, out);
  out.push('## Timeline');
  out.push('');
  if (log.entries.length === 0) out.push('Nothing notable yet.');
  for (const e of log.entries) out.push(`- ${clock(e.at)} · ${e.kind} · ${e.text}`);
  out.push('');
  out.push('## Practice');
  out.push('');
  if (log.practice.length === 0) out.push('No practice logged yet.');
  for (const p of log.practice) {
    const bits = [
      p.skills.length ? `skills: ${p.skills.join(' + ')}` : null,
      p.stat ? `stat: ${p.stat}` : null,
      p.tags.length ? `tags: ${p.tags.join(', ')}` : null,
      `from ${p.source}`,
      p.repeat ? 'repeat' : null,
    ].filter((b): b is string => b !== null);
    out.push(`- ${clock(p.at)} · ${p.character}: ${p.action} (${bits.join('; ')})`);
  }
  out.push('');
  out.push('## Notes');
  out.push('');
  if (log.notes.length === 0) out.push('No shared notes yet.');
  for (const n of log.notes) {
    const tags = n.tags.length ? ` · tags: ${n.tags.join(', ')}` : '';
    out.push(`### ${n.title || '(untitled)'}`);
    out.push('');
    out.push(`${n.kind} note by ${n.author} · updated ${n.updatedAt}${tags}`);
    out.push('');
    out.push(quoteBody(n.body));
    out.push('');
  }
  return `${out.join('\n').trimEnd()}\n`;
}
