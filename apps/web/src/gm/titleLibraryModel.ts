import { titleKey, type CampaignState, type Command, type TitleDef } from '@the-system/engine';
import { percentText, type TitleBonus } from '../player/titles';

export { describeTitleBonuses } from '../player/titles';

/**
 * The GM's title library form (ROADMAP M6.4, DESIGN §4 "Bonuses", §7
 * "Titles"). Pure helpers; tested in titleLibraryModel.test.ts. A title gives
 * percentage bonuses and, optionally, flat stats, so the draft holds two typed
 * values per stat: a percent ("10" = +10%) and a flat amount in stat points.
 */

export interface TitleDraft {
  name: string;
  text: string;
  /** Stat id → percent as typed ('' = none). */
  percent: Record<string, string>;
  /** Stat id → flat stat points as typed ('' = none). */
  flat: Record<string, string>;
}

type Bonus = TitleBonus;

export function emptyTitleDraft(): TitleDraft {
  return { name: '', text: '', percent: {}, flat: {} };
}

export function titleDraftOf(def: TitleDef): TitleDraft {
  const percent: Record<string, string> = {};
  const flat: Record<string, string> = {};
  for (const b of def.bonuses) {
    if (b.percent !== undefined && b.percent !== 0) percent[b.stat] = percentText(b.percent);
    if (b.flat !== undefined && b.flat !== 0) flat[b.stat] = String(b.flat);
  }
  return { name: def.name, text: def.text, percent, flat };
}

/** The highest percent a title may give one stat (the event schema's +10,000%). */
export const MAX_TITLE_PERCENT = 10_000;

/**
 * One typed percent as a fraction: '' → undefined (none), a number above
 * -99% and at most +10,000% → its fraction, anything else → null.
 */
export function parsePercent(raw: string | undefined): number | undefined | null {
  const t = (raw ?? '').trim();
  if (t === '') return undefined;
  if (!/^[+-]?\d+(\.\d{1,4})?$/u.test(t)) return null;
  const n = Number(t);
  if (n <= -99.0001 || n > MAX_TITLE_PERCENT) return null;
  return Math.round(n * 1e4) / 1e6;
}

/** One typed flat bonus: '' → undefined, a whole number → it, anything else → null. */
export function parseFlat(raw: string | undefined): number | undefined | null {
  const t = (raw ?? '').trim();
  if (t === '') return undefined;
  if (!/^[+-]?\d{1,7}$/u.test(t)) return null;
  const n = Number(t);
  return Math.abs(n) > 1_000_000 ? null : n;
}

/** Typed bonuses in the rules' stat order; blanks and zeros dropped. null when one is not valid. */
export function parseTitleBonuses(
  draft: TitleDraft,
  stats: readonly { id: string }[],
): Bonus[] | null {
  const out: Bonus[] = [];
  for (const { id } of stats) {
    const percent = parsePercent(draft.percent[id]);
    const flat = parseFlat(draft.flat[id]);
    if (percent === null || flat === null) return null;
    const b: Bonus = { stat: id };
    if (percent !== undefined && percent !== 0) b.percent = percent;
    if (flat !== undefined && flat !== 0) b.flat = flat;
    if (b.percent !== undefined || b.flat !== undefined) out.push(b);
  }
  return out;
}

const sameBonuses = (a: readonly Bonus[], b: readonly Bonus[]) =>
  a.length === b.length &&
  a.every((x, i) => x.stat === b[i]?.stat && x.flat === b[i]?.flat && x.percent === b[i]?.percent);

/**
 * The command that saves the draft: `titleDef.define` for a new title, or a
 * `titleDef.edit` carrying only the fields changed since `base` was loaded.
 * null when nothing would change or the draft is not valid.
 */
export function titleSaveCommand(
  draft: TitleDraft,
  base: TitleDef | null,
  stats: readonly { id: string }[],
): Command | null {
  const name = draft.name.trim().replace(/\s+/gu, ' ');
  const bonuses = parseTitleBonuses(draft, stats);
  if (name === '' || name.length > 80 || bonuses === null) return null;
  const text = draft.text.trim();
  if (base === null) return { type: 'titleDef.define', name, text, bonuses };
  const edit: Extract<Command, { type: 'titleDef.edit' }> = {
    type: 'titleDef.edit',
    titleDefId: base.id,
  };
  if (name !== base.name) edit.name = name;
  if (text !== base.text) edit.text = text;
  const baseBonuses = parseTitleBonuses(titleDraftOf(base), stats) ?? [];
  if (!sameBonuses(bonuses, baseBonuses)) edit.bonuses = bonuses;
  return Object.keys(edit).length > 2 ? edit : null;
}

/** The title as it reads once `command` is applied: the form's baseline after a save. */
export function savedTitle(loaded: TitleDef, command: Command): TitleDef {
  if (command.type !== 'titleDef.edit') return loaded;
  const { name, text, bonuses } = command;
  return {
    ...loaded,
    ...(name !== undefined && { name }),
    ...(text !== undefined && { text }),
    ...(bonuses !== undefined && {
      bonuses: bonuses.map((b) => ({
        stat: b.stat,
        ...(b.flat !== undefined && { flat: b.flat }),
        ...(b.percent !== undefined && { percent: b.percent }),
      })),
    }),
  };
}

/** True when the live title differs from the copy the form was opened from. */
export function titleChangedSince(loaded: TitleDef, live: TitleDef): boolean {
  return JSON.stringify(loaded) !== JSON.stringify(live);
}

/** Library titles in definition order, filtered by name or text (case-insensitive). */
export function libraryTitles(
  state: Pick<CampaignState, 'titleLibrary' | 'titleLibraryOrder'>,
  query: string,
): TitleDef[] {
  const q = query.trim().toLowerCase();
  return state.titleLibraryOrder.flatMap((id) => {
    const def = Object.prototype.hasOwnProperty.call(state.titleLibrary, id)
      ? state.titleLibrary[id]
      : undefined;
    if (!def) return [];
    if (q === '') return [def];
    return [def.name, def.text].some((s) => s.toLowerCase().includes(q)) ? [def] : [];
  });
}

/** Names of the characters holding a title (any case), in character order. */
export function holdersOf(
  state: Pick<CampaignState, 'characterOrder' | 'characters'>,
  name: string,
): string[] {
  const k = titleKey(name);
  return state.characterOrder.flatMap((id) => {
    const c = Object.prototype.hasOwnProperty.call(state.characters, id)
      ? state.characters[id]
      : undefined;
    return c && c.titles.some((t) => titleKey(t) === k) ? [c.name] : [];
  });
}
