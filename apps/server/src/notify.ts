import { raceLevel, type CampaignState, type DomainEvent } from '@the-system/engine';

/**
 * Notifications derived from a state change (DESIGN §9 "DING!"). Only gains
 * notify: an undo's level loss shows in the next view, not as a "DING". Pure: compares
 * each character before and after one event. Text is formatted by the client
 * from these facts and the rules, so wording stays in one place.
 */
export type Notification =
  | {
      readonly kind: 'level';
      readonly characterId: string;
      readonly track: 'class' | 'profession' | 'race';
      /** Track name as shown in the books: class name, profession name or race. */
      readonly name: string;
      readonly from: number;
      readonly to: number;
      /** Free points granted by this change (race track only). */
      readonly freePoints: number;
    }
  | {
      readonly kind: 'freePoints';
      readonly characterId: string;
      readonly unassigned: number;
    }
  | {
      /** A GM System broadcast, one per recipient (a player only ever sees their own). */
      readonly kind: 'broadcast';
      readonly characterId: string;
      readonly text: string;
    };

export function notificationsFor(
  before: CampaignState | null,
  after: CampaignState | null,
  /** The event that caused the change; messages (broadcasts) notify from it. */
  event?: DomainEvent,
): Notification[] {
  if (after === null) return [];
  const out: Notification[] = [];
  if (event?.type === 'system.broadcast') {
    const recipients = event.payload.characterIds ?? after.characterOrder;
    for (const characterId of recipients) {
      out.push({ kind: 'broadcast', characterId, text: event.payload.text });
    }
  }
  for (const id of after.characterOrder) {
    const now = after.characters[id];
    const was = before?.characters[id];
    if (!now || !was) continue;
    if (now.classLevel > was.classLevel) {
      out.push({
        kind: 'level',
        characterId: id,
        track: 'class',
        name: now.className,
        from: was.classLevel,
        to: now.classLevel,
        freePoints: 0,
      });
    }
    if (now.profession !== null && now.professionLevel > was.professionLevel) {
      out.push({
        kind: 'level',
        characterId: id,
        track: 'profession',
        name: now.profession,
        from: was.professionLevel,
        to: now.professionLevel,
        freePoints: 0,
      });
    }
    const raceBefore = raceLevel(before?.rules ?? after.rules, was);
    const raceAfter = raceLevel(after.rules, now);
    if (raceAfter > raceBefore) {
      const granted = (c: typeof now) => c.freePointBatches.reduce((a, b) => a + b.points, 0);
      out.push({
        kind: 'level',
        characterId: id,
        track: 'race',
        name: now.race,
        from: raceBefore,
        to: raceAfter,
        freePoints: granted(now) - granted(was),
      });
    }
    const open = (c: typeof now) =>
      c.freePointBatches.filter((b) => b.allocation === null).reduce((a, b) => a + b.points, 0);
    if (open(now) !== open(was)) {
      out.push({ kind: 'freePoints', characterId: id, unassigned: open(now) });
    }
  }
  return out;
}
