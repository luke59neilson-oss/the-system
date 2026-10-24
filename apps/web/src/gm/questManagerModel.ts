import type { Command } from '@the-system/engine';

/**
 * GM quest manager form model (ROADMAP M7.1, DESIGN §7 "Quests", D67, D122).
 * Work in progress: the create command from the form draft. Next: edit,
 * status, nudges, `noticeTo`, and the practice-tag stability offer.
 */
export interface QuestDraft {
  title: string;
  text: string;
  visible: boolean;
  /** Timer in days; blank = none. */
  days: string;
  /** "tag: delta" lines; blank = no World Stability. */
  rules: string;
}

export const emptyQuestDraft = (): QuestDraft => ({
  title: '',
  text: '',
  visible: true,
  days: '',
  rules: '',
});

/** Parses "tag: delta" lines into lower-case tag → non-zero whole delta, or an error. */
export function parseStabilityRules(text: string): Record<string, number> | string {
  const out: Record<string, number> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const m = /^([^:]+):\s*([+-]?\d+)$/u.exec(line);
    if (!m) return `Write each rule as "tag: delta" (got "${line}")`;
    const tag = (m[1] ?? '').trim().toLowerCase();
    const delta = Number(m[2]);
    if (delta === 0) return `The rule for "${tag}" must change stability`;
    out[tag] = delta;
  }
  return out;
}

/** The quest.create command for a draft, or an error message. */
export function questCreateCommand(draft: QuestDraft): Command | string {
  const title = draft.title.trim().replace(/\s+/gu, ' ');
  if (title === '') return 'A quest needs a title';
  const days = draft.days.trim();
  if (days !== '' && !/^\d+$/u.test(days)) return 'Days must be a whole number';
  const rules = parseStabilityRules(draft.rules);
  if (typeof rules === 'string') return rules;
  return {
    type: 'quest.create',
    title,
    ...(draft.text.trim() === '' ? {} : { text: draft.text.trim() }),
    visible: draft.visible,
    days: days === '' ? null : Number(days),
    stability: Object.keys(rules).length === 0 ? null : { rules },
  };
}
