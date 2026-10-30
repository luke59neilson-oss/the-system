// MU.1 (DESIGN §9a): the GM console's home dashboard and three tabs. This
// table is the one place that says where every GM window lives; the console
// renders from it, the e2e helper opens a window's tab from it, and the table
// in docs/GM-GUIDE.md mirrors it (MU.1). Award XP is the only window in two places
// (quick on Session, full on Progression).

export type ConsoleTab = 'home' | 'session' | 'progression' | 'library';

export const TABS: readonly { readonly id: ConsoleTab; readonly label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'session', label: 'Session' },
  { id: 'progression', label: 'Progression' },
  { id: 'library', label: 'Library & settings' },
];

/** Every GM window, by id, with the tab(s) it lives in. */
export const WINDOWS: Readonly<Record<string, readonly ConsoleTab[]>> = {
  // Home: the campaign at a glance and what needs the GM.
  'needs-you': ['home'],
  party: ['home'],
  join: ['home'],
  'create-character': ['home'],
  // Session: running the table.
  session: ['session'],
  'award-xp': ['session', 'progression'],
  listen: ['session'],
  codm: ['session'],
  // Co-DM generations preview and approve here, mid-narration (D-entry, MU.1).
  import: ['session'],
  encounter: ['session'],
  'quest-manager': ['session'],
  broadcast: ['session'],
  shops: ['session'],
  'currency-ledger': ['session'],
  trackers: ['session'],
  'change-log': ['session'],
  feed: ['session'],
  // Progression: levels, skills and evolutions.
  'offer-builder': ['progression'],
  'marks-review': ['progression'],
  'merge-builder': ['progression'],
  'evolution-builder': ['progression'],
  'practice-capture': ['progression'],
  // Library & settings: the campaign's reference data and configuration.
  'skill-text': ['library'],
  'skill-library': ['library'],
  'item-library': ['library'],
  'loot-tables': ['library'],
  'title-library': ['library'],
  'origin-library': ['library'],
  bestiary: ['library'],
  // MU.6: the Primal Hunter reference lists (GM-only).
  reference: ['library'],
  'rules-settings': ['library'],
  'codm-settings': ['library'],
};

/** The windows shown on a tab, in table order. */
export function windowsOn(tab: ConsoleTab): string[] {
  return Object.entries(WINDOWS)
    .filter(([, tabs]) => tabs.includes(tab))
    .map(([id]) => id);
}

/** The tab that opens a window (its first place). */
export function tabOf(windowId: string): ConsoleTab | null {
  return WINDOWS[windowId]?.[0] ?? null;
}

/** A stored tab id, or Home when it is missing or unknown. */
export function parseTab(stored: string | null): ConsoleTab {
  return TABS.some((t) => t.id === stored) ? (stored as ConsoleTab) : 'home';
}

/** Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern). */
export function tabAfterKey(current: ConsoleTab, key: string): ConsoleTab | null {
  const i = TABS.findIndex((t) => t.id === current);
  const n = TABS.length;
  const at = (j: number): ConsoleTab => TABS[((j % n) + n) % n]!.id;
  switch (key) {
    case 'ArrowRight':
      return at(i + 1);
    case 'ArrowLeft':
      return at(i - 1);
    case 'Home':
      return at(0);
    case 'End':
      return at(n - 1);
    default:
      return null;
  }
}
