import { raceLevel, type CampaignState } from '@the-system/engine';

/**
 * Notifications derived from a state change (DESIGN §9 "DING!"). Pure: compares
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
    };

export function notificationsFor(
  before: CampaignState | null,
  after: CampaignState | null,
): Notification[] {
  if (after === null) return [];
  const out: Notification[] = [];
  for (const id of after.characterOrder) {
    const now = after.characters[id];
    const was = before?.characters[id];
    if (!now || !was) continue;
    if (now.classLevel !== was.classLevel) {
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
    if (now.profession !== null && now.professionLevel !== was.professionLevel) {
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
    if (raceBefore !== raceAfter) {
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
