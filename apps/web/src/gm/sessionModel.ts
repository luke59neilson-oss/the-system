import type { CampaignState, SessionRecord } from '@the-system/engine';

/**
 * What the GM console's Session window shows (M4.3): the running session or
 * the next one to start, the in-game day, and past sessions newest first.
 */
export interface SessionSummary {
  /** The running session, or null between sessions. */
  readonly running: SessionRecord | null;
  /** Number the next started session will get. */
  readonly nextNumber: number;
  readonly day: number;
  /** Ended sessions, newest first. */
  readonly past: readonly SessionRecord[];
}

export function sessionSummary(state: CampaignState): SessionSummary {
  const sessions = state.sessions;
  const running =
    state.currentSession === null
      ? null
      : (sessions.find((s) => s.id === state.currentSession) ?? null);
  return {
    running,
    nextNumber: sessions.length + 1,
    day: state.day,
    past: sessions.filter((s) => s.endedAt !== null).reverse(),
  };
}

/** "Day 4" or "Days 4–6" for a session's in-game span. */
export function daySpan(s: SessionRecord, today: number): string {
  const end = s.endDay ?? today;
  return end === s.startDay ? `Day ${end}` : `Days ${s.startDay}–${end}`;
}

/** Local date and time, short ("22 Oct, 19:02"). */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // QF.55: one formatter each, made once; a toLocale… call per row built two
  // per row on every state frame (the change log, ledger and past sessions).
  dayFmt ??= new Intl.DateTimeFormat([], { day: 'numeric', month: 'short' });
  timeFmt ??= new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' });
  return `${dayFmt.format(d)}, ${timeFmt.format(d)}`;
}
let dayFmt: Intl.DateTimeFormat | undefined;
let timeFmt: Intl.DateTimeFormat | undefined;

/** How long a session ran, in whole minutes ("2 h 05 min", "45 min"). */
export function duration(fromIso: string, toIso: string): string {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.floor(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (minutes === 0) return 'under 1 min';
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

/** Parses the "advance by" field: a whole number of days from 1 to `max`, else null. */
export function parseDays(text: string, max = 1000): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= max ? n : null;
}
