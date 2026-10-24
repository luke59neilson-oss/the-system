import {
  characterEffectiveStats,
  contestChance,
  damageFactor,
  montageAvailable,
  poolMax,
  settleContest,
  walled,
  type CampaignState,
  type Clock,
  type Command,
  type ContestResult,
  type ContestSideRecord,
  type GradeGapMode,
  type Montage,
} from '@the-system/engine';

/**
 * GM encounter panel model (ROADMAP M7.3, DESIGN §7 "Resolution", "Grade
 * walls", "Progress clocks", "Montage"). Pure: the panel rolls on the GM's
 * screen; only a roll the GM shares becomes an event (`contest.share`).
 */

/** Who a contest side is: a character, a bestiary entity, or a free value. */
export type SideSource = `c:${string}` | `e:${string}` | 'custom';

export interface SideDraft {
  source: SideSource;
  /** Stat id rolled ('' for a custom side with no stat). */
  stat: string;
  /** What the table sees for this side. */
  label: string;
  /** Stat value in stat units, as typed. */
  value: string;
  grade: string;
}

export interface SideOption {
  readonly source: SideSource;
  readonly name: string;
}

const own = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

/** Characters first, then bestiary entities that have a grade or stats, then a free value. */
export function sideOptions(state: CampaignState): SideOption[] {
  const out: SideOption[] = [];
  for (const id of state.characterOrder) {
    const c = own(state.characters, id) ? state.characters[id] : undefined;
    if (c) out.push({ source: `c:${id}`, name: c.name });
  }
  for (const id of state.entityOrder) {
    const e = own(state.entities, id) ? state.entities[id] : undefined;
    if (e && (e.grade !== null || e.stats !== null)) {
      out.push({ source: `e:${id}`, name: `${e.name} (bestiary)` });
    }
  }
  out.push({ source: 'custom', name: 'Custom value' });
  return out;
}

const statName = (state: CampaignState, stat: string) =>
  state.rules.stats.list.find((s) => s.id === stat)?.name ?? stat;

/**
 * A side as the source fills it: a character's effective stat and grade, an
 * entity's stat (blank when the bestiary has none) and grade, its
 * player-facing label (never the GM name). Fields the GM typed are replaced.
 */
export function sideDraftFor(state: CampaignState, source: SideSource, stat: string): SideDraft {
  const first = state.rules.grades[0]?.id ?? '';
  const statId = stat || (state.rules.stats.list[0]?.id ?? '');
  if (source.startsWith('c:')) {
    const id = source.slice(2);
    const c = own(state.characters, id) ? state.characters[id] : undefined;
    if (c) {
      let stats: Record<string, number>;
      try {
        stats = characterEffectiveStats(state, id);
      } catch {
        stats = { ...c.stats };
      }
      const value = stats[statId];
      return {
        source,
        stat: statId,
        label: `${c.name} · ${statName(state, statId)}`,
        value: value === undefined ? '' : String(Math.round(value * 100) / 100),
        grade: c.grade,
      };
    }
  }
  if (source.startsWith('e:')) {
    const id = source.slice(2);
    const e = own(state.entities, id) ? state.entities[id] : undefined;
    if (e) {
      const value = e.stats && own(e.stats, statId) ? e.stats[statId] : undefined;
      return {
        source,
        stat: statId,
        label: e.label,
        value: value === undefined ? '' : String(value),
        grade: e.grade ?? first,
      };
    }
  }
  return { source: 'custom', stat: '', label: '', value: '', grade: first };
}

export const emptySide = (state: CampaignState): SideDraft => sideDraftFor(state, 'custom', '');

/**
 * A side kept current as the campaign changes (M7.A): a character's stat can
 * move mid-fight (level, item, title), so a side still showing what was
 * derived from `prev` takes the value derived from `next`. Fields the GM
 * typed by hand stay as typed; a custom side never changes.
 */
export function refreshSide(prev: CampaignState, next: CampaignState, draft: SideDraft): SideDraft {
  if (draft.source === 'custom') return draft;
  const was = sideDraftFor(prev, draft.source, draft.stat);
  const now = sideDraftFor(next, draft.source, draft.stat);
  if (now.source !== draft.source) return draft;
  const value = draft.value === was.value ? now.value : draft.value;
  const grade = draft.grade === was.grade ? now.grade : draft.grade;
  const label = draft.label === was.label ? now.label : draft.label;
  if (value === draft.value && grade === draft.grade && label === draft.label) return draft;
  return { ...draft, value, grade, label };
}

/** The side as the engine takes it, or a problem to show. */
export function sideRecord(
  state: CampaignState,
  draft: SideDraft,
  name: string,
): ContestSideRecord | string {
  const label = draft.label.trim();
  if (label === '') return `${name}: give it a label the table sees`;
  if (label.length > 80) return `${name}: the label is longer than 80 characters`;
  const text = draft.value.trim();
  const value = Number(text);
  if (text === '' || !Number.isFinite(value) || value < 0) {
    return `${name}: the value must be a number ≥ 0`;
  }
  if (!state.rules.grades.some((g) => g.id === draft.grade)) return `${name}: pick a grade`;
  const stat = state.rules.stats.list.some((s) => s.id === draft.stat) ? draft.stat : null;
  const characterIds = draft.source.startsWith('c:') ? [draft.source.slice(2)] : [];
  return { label, value, grade: draft.grade, characterIds, stat };
}

export interface ContestPlan {
  readonly a: ContestSideRecord;
  readonly b: ContestSideRecord;
  readonly mode: GradeGapMode;
  /** Chance side A wins, 0..1. */
  readonly chance: number;
  /** A grade wall settles it with no roll. */
  readonly walled: boolean;
}

/** Both sides checked, with side A's chance; or the first problem. */
export function contestPlan(
  state: CampaignState,
  a: SideDraft,
  b: SideDraft,
  mode: GradeGapMode,
): ContestPlan | string {
  const ra = sideRecord(state, a, 'Side A');
  if (typeof ra === 'string') return ra;
  const rb = sideRecord(state, b, 'Side B');
  if (typeof rb === 'string') return rb;
  const both = ra.characterIds.filter((id) => rb.characterIds.includes(id));
  if (both.length > 0) return 'A character cannot be on both sides';
  return {
    a: ra,
    b: rb,
    mode,
    chance: contestChance(state.rules, ra, rb, mode),
    walled: walled(state.rules, ra, rb, mode),
  };
}

export interface RolledContest {
  readonly plan: ContestPlan;
  readonly roll: number | null;
  readonly result: ContestResult;
}

/** Rolls a planned contest with the given random source (no draw when walled). */
export function rollPlan(state: CampaignState, plan: ContestPlan, random: () => number) {
  const roll = plan.walled ? null : random();
  const result = settleContest(state.rules, plan.a, plan.b, plan.mode, roll);
  return { plan, roll, result } satisfies RolledContest;
}

/** The command that shares a rolled contest with the table. */
export function shareCommand(rolled: RolledContest): Command {
  return {
    type: 'contest.share',
    a: rolled.plan.a,
    b: rolled.plan.b,
    mode: rolled.plan.mode,
    roll: rolled.roll,
  };
}

/** "75%" (whole percent; "<1%" and ">99%" near the ends). */
export function percent(chance: number): string {
  if (chance > 0 && chance < 0.01) return '<1%';
  if (chance < 1 && chance > 0.99) return '>99%';
  return `${Math.round(chance * 100)}%`;
}

/** One line for the GM: who won, at what odds, with what roll. */
export function outcomeText(rolled: RolledContest): string {
  const { plan, result } = rolled;
  const winner = result.success ? plan.a.label : plan.b.label;
  if (result.walled) return `${winner} wins: a grade wall, no roll`;
  const roll = Math.round((result.roll ?? 0) * 100);
  return `${winner} wins (${plan.a.label} ${percent(result.chance)}, rolled ${roll})`;
}

// ---- Damage and healing -------------------------------------------------

export interface PoolChangeInput {
  characterId: string;
  pool: string;
  kind: 'damage' | 'heal';
  /** Whole points as typed. */
  amount: string;
  /** Damage only: the attacker's grade for the grade-wall factor ('' = same grade). */
  attackerGrade: string;
}

export interface PoolChange {
  readonly characterId: string;
  readonly pool: string;
  readonly before: number;
  readonly after: number;
  readonly max: number;
  /** Points actually applied (after the damage factor and the 0..max clamp). */
  readonly applied: number;
  /** Damage factor from the grade walls (1 for a heal or the same grade). */
  readonly factor: number;
}

/** What a damage or heal does to a character's pool, or a problem. */
export function poolChange(state: CampaignState, input: PoolChangeInput): PoolChange | string {
  const c = own(state.characters, input.characterId)
    ? state.characters[input.characterId]
    : undefined;
  if (!c) return 'Pick a character';
  if (!state.rules.pools.some((p) => p.id === input.pool)) return 'Pick a pool';
  if (input.amount.trim() === '') return 'Enter an amount';
  const amount = Number(input.amount.trim());
  if (!Number.isInteger(amount) || amount < 1) {
    return 'The amount must be a whole number ≥ 1';
  }
  let stats: Record<string, number>;
  try {
    stats = characterEffectiveStats(state, c.id);
  } catch {
    stats = { ...c.stats };
  }
  const max = poolMax(state.rules, stats, input.pool);
  const before = Math.min(max, c.pools[input.pool] ?? max);
  let factor = 1;
  if (input.kind === 'damage' && input.attackerGrade !== '') {
    if (!state.rules.grades.some((g) => g.id === input.attackerGrade)) return 'Pick a grade';
    factor = damageFactor(state.rules, input.attackerGrade, c.grade);
  }
  const dealt = Math.floor(Number((amount * factor).toFixed(9)));
  const after =
    input.kind === 'damage' ? Math.max(0, before - dealt) : Math.min(max, before + amount);
  return {
    characterId: c.id,
    pool: input.pool,
    before,
    after,
    max,
    applied: Math.abs(after - before),
    factor,
  };
}

export function poolCommand(change: PoolChange): Command {
  return {
    type: 'character.setPools',
    characterId: change.characterId,
    pools: { [change.pool]: change.after },
  };
}

/** "×⅓" style label for a damage factor. */
export function factorText(factor: number): string {
  if (factor === 1) return 'full damage';
  if (factor === 0) return 'no damage (two or more grades below)';
  const third = Math.abs(factor - 1 / 3) < 1e-9;
  return `×${third ? '⅓' : String(Math.round(factor * 100) / 100)} damage (one grade below)`;
}

// ---- Progress clocks and montages --------------------------------------

export interface ClockRow {
  readonly clock: Clock;
  readonly complete: boolean;
  /** The clock qualifies for a montage now (DESIGN §7). */
  readonly montageReady: boolean;
  /** Open montages on this clock. */
  readonly montages: readonly Montage[];
}

export function clockRows(state: CampaignState): ClockRow[] {
  return state.clockOrder.flatMap((id) => {
    const clock = own(state.clocks, id) ? state.clocks[id] : undefined;
    if (!clock) return [];
    const montages = state.montageOrder.flatMap((m) => {
      const montage = own(state.montages, m) ? state.montages[m] : undefined;
      return montage && montage.clockId === id && montage.status === 'open' ? [montage] : [];
    });
    return [
      {
        clock,
        complete: clock.filled >= clock.segments,
        montageReady: montageAvailable(state.rules, clock) && montages.length === 0,
        montages,
      },
    ];
  });
}

/** Names of the montage participants who have given their focus, and who has not. */
export function montageProgress(state: CampaignState, montage: Montage) {
  const name = (id: string) => state.characters[id]?.name ?? id;
  const done = montage.characterIds.filter((id) => own(montage.focuses, id)).map(name);
  const waiting = montage.characterIds.filter((id) => !own(montage.focuses, id)).map(name);
  return { done, waiting };
}

/** Recent shared contests, newest first (GM view). */
export function recentContests(state: CampaignState, limit = 5) {
  return state.contestOrder
    .slice(-limit)
    .reverse()
    .flatMap((id) => (own(state.contests, id) && state.contests[id] ? [state.contests[id]] : []));
}
