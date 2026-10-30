import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { TABS, WINDOWS, parseTab, tabAfterKey, tabOf, type ConsoleTab } from './tabsModel';

// MU.1 (DESIGN §9a): the console's tab bar and the wrapper that shows each
// window only on its tab. Windows stay mounted on the other tabs (hidden), so
// half-filled forms and live polls survive a tab switch.

const STORE = 'the-system.gm.tab';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORE);
  } catch {
    return null;
  }
}

/** The open tab, remembered on this laptop; `#<window id>` links open that window's tab. */
export function useConsoleTab(): [ConsoleTab, (t: ConsoleTab) => void] {
  const [tab, setTabState] = useState<ConsoleTab>(() => parseTab(readStored()));
  const setTab = useCallback((t: ConsoleTab) => {
    setTabState(t);
    try {
      window.localStorage.setItem(STORE, t);
    } catch {
      // No storage (private window): the tab is not remembered.
    }
  }, []);
  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.replace(/^#/u, '');
      const owner = tabOf(id);
      if (owner) setTab(owner);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [setTab]);
  return [tab, setTab];
}

export function ConsoleTabs({
  tab,
  onChange,
}: {
  tab: ConsoleTab;
  onChange: (t: ConsoleTab) => void;
}) {
  const refs = useRef(new Map<ConsoleTab, HTMLButtonElement>());
  return (
    <nav className="console-tabs" aria-label="Console">
      <div role="tablist" aria-label="Console tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            // Only the open tab's panel is rendered (MU.1 review).
            aria-controls={tab === t.id ? `tabpanel-${t.id}` : undefined}
            tabIndex={tab === t.id ? 0 : -1}
            ref={(el) => {
              if (el) refs.current.set(t.id, el);
            }}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const next = tabAfterKey(t.id, e.key);
              if (!next) return;
              e.preventDefault();
              onChange(next);
              refs.current.get(next)?.focus();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

/** One GM window's place: shown only on the tab(s) the table gives it. */
export function Place({ id, tab, children }: { id: string; tab: ConsoleTab; children: ReactNode }) {
  const shown = WINDOWS[id]?.includes(tab) ?? false;
  return (
    <div className="place" data-window={id} hidden={!shown}>
      {children}
    </div>
  );
}
