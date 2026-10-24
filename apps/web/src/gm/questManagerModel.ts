import type { CampaignState, Command, PracticeEntry, Quest } from '@the-system/engine';

/**
 * GM quest manager form model (ROADMAP M7.1, DESIGN §7 "Quests", D67, D122):
 * create and edit commands from the form draft, stability rules written as
 * "tag: delta" lines, nudges, tagged actions, and the offer to apply a
 * quest's stability rule when a practice entry carries one of its tags.
 */
export interface QuestDraft {
  title: string;
  text: string;
  visible: boolean;
  /** Timer in days; blank = none. */
  days: string;
  /** "tag: delta" lines; blank = no World Stability (create only). */
  rules: string;
  /** Players see the World Stability gauge. */
  stabilityVisible: boolean;
  /** Hidden quests only: who gets the notice (D122); null = every character. */
  noticeTo: string[] | null;
}

export const emptyQuestDraft = (stabilityVisible = false): QuestDraft => ({
  title: '',
  text: '',
  visible: true,
  days: '',
  rules: '',
  stabilityVisible,
  noticeTo: null,
});

/** "tag: delta" lines for a rules map, in tag order as stored. */
export function rulesText(rules: Readonly<Record<string, number>>): string {
  return Object.entries(rules)
    .map(([tag, delta]) => `${tag}: ${delta > 0 ? '+' : ''}${delta}`)
    .join('\n');
}

/** The edit form's draft for a stored quest. */
export function questDraftOf(quest: Quest): QuestDraft {
  return {
    title: quest.title,
    text: quest.text,
    visible: quest.visible,
    days: quest.days === null ? '' : String(quest.days),
    rules: quest.stability ? rulesText(quest.stability.rules) : '',
    stabilityVisible: quest.stability?.visible ?? false,
    noticeTo: quest.noticeTo === null ? null : [...quest.noticeTo],
  };
}

/** Parses "tag: delta" lines into lower-case tag → non-zero whole delta, or an error. */
export function parseStabilityRules(text: string): Record<string, number> | string {
  const out: Record<string, number> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const m = /^([^:]+):\s*([+-]?\d+)$/u.exec(line);
    if (!m) return `Write each rule as "tag: delta" (got "${line}")`;
    const tag = (m[1] ?? '').trim().replace(/\s+/gu, ' ').toLowerCase();
    const delta = Number(m[2]);
    if (delta === 0) return `The rule for "${tag}" must change stability`;
    if (Object.prototype.hasOwnProperty.call(out, tag)) return `"${tag}" has two rules`;
    out[tag] = delta;
  }
  return out;
}

const cleanTitle = (s: string) => s.trim().replace(/\s+/gu, ' ');

function parseDays(days: string): number | null | string {
  const d = days.trim();
  if (d === '') return null;
  if (!/^\d+$/u.test(d)) return 'Days must be a whole number';
  return Number(d);
}

/** The quest.create command for a draft, or an error message. */
export function questCreateCommand(draft: QuestDraft): Command | string {
  const title = cleanTitle(draft.title);
  if (title === '') return 'A quest needs a title';
  const days = parseDays(draft.days);
  if (typeof days === 'string') return days;
  const rules = parseStabilityRules(draft.rules);
  if (typeof rules === 'string') return rules;
  return {
    type: 'quest.create',
    title,
    ...(draft.text.trim() === '' ? {} : { text: draft.text.trim() }),
    visible: draft.visible,
    days,
    stability: Object.keys(rules).length === 0 ? null : { rules, visible: draft.stabilityVisible },
    ...(draft.visible ? {} : { noticeTo: draft.noticeTo === null ? null : [...draft.noticeTo] }),
  };
}

const sameList = (a: readonly string[] | null, b: readonly string[] | null) =>
  a === null || b === null
    ? a === b
    : a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

const sameRules = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([k, v]) => b[k] === v);

/**
 * The quest.edit command carrying only what changed, null when nothing did,
 * or an error message. A quest created without World Stability cannot gain
 * it here (the engine's edit has no such field; D180).
 */
export function questEditCommand(quest: Quest, draft: QuestDraft): Command | string | null {
  const title = cleanTitle(draft.title);
  if (title === '') return 'A quest needs a title';
  const days = parseDays(draft.days);
  if (typeof days === 'string') return days;
  const rules = parseStabilityRules(draft.rules);
  if (typeof rules === 'string') return rules;
  if (!quest.stability && Object.keys(rules).length > 0) {
    return 'World Stability can only be added when the quest is created';
  }
  const text = draft.text.trim();
  const change: Record<string, unknown> = {};
  if (title !== quest.title) change['title'] = title;
  if (text !== quest.text.trim()) change['text'] = text;
  if (draft.visible !== quest.visible) change['visible'] = draft.visible;
  if (days !== quest.days) change['days'] = days;
  if (quest.stability) {
    if (draft.stabilityVisible !== quest.stability.visible)
      change['stabilityVisible'] = draft.stabilityVisible;
    if (!sameRules(rules, quest.stability.rules)) change['stabilityRules'] = rules;
  }
  // The notice list only matters while hidden; keep it when the quest is shown.
  if (!draft.visible && !sameList(draft.noticeTo, quest.noticeTo)) {
    change['noticeTo'] = draft.noticeTo === null ? null : [...draft.noticeTo];
  }
  if (Object.keys(change).length === 0) return null;
  return { type: 'quest.edit', questId: quest.id, ...change } as Command;
}

/**
 * The quest as it stands after `command` (a quest.edit from questEditCommand)
 * lands, so the form keeps diffing against what this GM last saved.
 */
export function savedQuest(quest: Quest, command: Command): Quest {
  if (command.type !== 'quest.edit') return quest;
  const c = command;
  return {
    ...quest,
    title: c.title ?? quest.title,
    text: c.text ?? quest.text,
    visible: c.visible ?? quest.visible,
    days: c.days === undefined ? quest.days : c.days,
    noticeTo:
      c.noticeTo === undefined ? quest.noticeTo : c.noticeTo === null ? null : [...c.noticeTo],
    stability: quest.stability && {
      ...quest.stability,
      visible: c.stabilityVisible ?? quest.stability.visible,
      rules: c.stabilityRules === undefined ? quest.stability.rules : { ...c.stabilityRules },
    },
  };
}

/** A manual stability nudge (signed whole number, not 0), or an error. */
export function nudgeCommand(questId: string, delta: string, reason: string): Command | string {
  const d = delta.trim();
  if (!/^[+-]?\d+$/u.test(d) || Number(d) === 0) return 'Nudge by a whole number other than 0';
  const why = reason.trim().replace(/\s+/gu, ' ');
  return {
    type: 'stability.nudge',
    questId,
    delta: Number(d),
    ...(why === '' ? {} : { reason: why }),
  };
}

/** A tagged action applied `count` times, or an error. */
export function actionCommand(
  questId: string,
  tag: string,
  count: string,
  reason: string,
): Command | string {
  if (tag === '') return 'Pick an action';
  const c = count.trim();
  if (!/^\d+$/u.test(c) || Number(c) < 1) return 'Count must be a whole number, 1 or more';
  const why = reason.trim().replace(/\s+/gu, ' ');
  return {
    type: 'stability.applyAction',
    questId,
    tag,
    count: Number(c),
    ...(why === '' ? {} : { reason: why }),
  };
}

/** Quests the GM can still apply actions to: active, with World Stability. */
export function stabilityQuests(state: CampaignState): Quest[] {
  return state.questOrder
    .map((id) => state.quests[id])
    .filter((q): q is Quest => q !== undefined && q.status === 'active' && q.stability !== null);
}

/** Every action tag of an active quest, sorted, for the practice tags list. */
export function actionTags(state: CampaignState): string[] {
  const tags = new Set<string>();
  for (const q of stabilityQuests(state)) {
    for (const tag of Object.keys(q.stability?.rules ?? {})) tags.add(tag);
  }
  return [...tags].sort();
}

/** Splits a comma-separated tags field into clean lower-case tags, without repeats. */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const tag = raw.trim().replace(/\s+/gu, ' ').toLowerCase();
    if (tag !== '' && !out.includes(tag)) out.push(tag);
  }
  return out;
}

export interface StabilityOffer {
  readonly questId: string;
  readonly title: string;
  readonly tag: string;
  readonly delta: number;
}

/**
 * Stability rules a practice entry's tags match (D67, M7.1): one offer per
 * active quest rule whose tag the entry carries (case-insensitive).
 */
export function stabilityOffers(
  state: CampaignState,
  entry: Pick<PracticeEntry, 'tags'>,
): StabilityOffer[] {
  const tags = entry.tags.map((t) => t.trim().toLowerCase());
  const out: StabilityOffer[] = [];
  for (const q of stabilityQuests(state)) {
    for (const [tag, delta] of Object.entries(q.stability?.rules ?? {})) {
      if (tags.includes(tag)) out.push({ questId: q.id, title: q.title, tag, delta });
    }
  }
  return out;
}

/** A practice offer waiting for the GM: which entry it came from and what it applies. */
export interface PendingOffer {
  readonly key: string;
  /** Reason recorded with the action ("Practice: Jake: Burned out a curse zone"). */
  readonly reason: string;
  readonly questId: string;
  readonly tag: string;
}

/**
 * A pending offer as it stands now: the quest's current title and delta, or
 * null once the quest is closed, gone, or no longer has the rule.
 */
export function liveOffer(state: CampaignState, offer: PendingOffer): StabilityOffer | null {
  const q = Object.prototype.hasOwnProperty.call(state.quests, offer.questId)
    ? state.quests[offer.questId]
    : undefined;
  if (!q || q.status !== 'active' || !q.stability) return null;
  const delta = Object.prototype.hasOwnProperty.call(q.stability.rules, offer.tag)
    ? q.stability.rules[offer.tag]
    : undefined;
  return delta === undefined ? null : { questId: q.id, title: q.title, tag: offer.tag, delta };
}

/** "+5" / "-3": a signed delta for labels. */
export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
