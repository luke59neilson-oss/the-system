import { raceLevel } from '../character';
import { execute } from '../events/commands';
import type { Campaign } from '../events/log';

/**
 * QF.40: what an undo would do to each character's progression (grade,
 * class, profession and race levels), so the GM's undo confirm can say it
 * before the undo is sent. Pure: runs the undo on the campaign value and
 * compares. A refused undo gives its reason instead.
 */
export type UndoPreview =
  | { readonly ok: true; readonly changes: readonly string[] }
  | { readonly ok: false; readonly error: string };

export function undoPreview(campaign: Campaign, eventId: string, now: string): UndoPreview {
  const r = execute(
    campaign,
    { type: 'event.undo', eventId },
    {
      actor: { role: 'gm' },
      sessionId: campaign.state?.currentSession ?? null,
      now: () => now,
      newId: () => `undo-preview-${campaign.events.length}`,
    },
  );
  if (!r.ok) return { ok: false, error: r.error };
  const was = campaign.state?.characters ?? {};
  const changes: string[] = [];
  for (const [id, now] of Object.entries(r.campaign.state?.characters ?? {})) {
    const before = Object.hasOwn(was, id) ? was[id] : undefined;
    if (!before) continue;
    const parts: string[] = [];
    if (before.grade !== now.grade) parts.push(`grade ${before.grade} → ${now.grade}`);
    if (before.classLevel !== now.classLevel) {
      parts.push(`class ${before.classLevel} → ${now.classLevel}`);
    }
    if (before.professionLevel !== now.professionLevel) {
      parts.push(`profession ${before.professionLevel} → ${now.professionLevel}`);
    }
    const rules = r.campaign.state?.rules;
    const ra = rules ? raceLevel(rules, before) : 0;
    const rb = rules ? raceLevel(rules, now) : 0;
    if (ra !== rb) parts.push(`race ${ra} → ${rb}`);
    if (parts.length > 0) changes.push(`${now.name}: ${parts.join(', ')}`);
  }
  return { ok: true, changes };
}
