import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  EMPTY_LAYOUT,
  PANEL_WIDTHS,
  arrangeSlots,
  dropPanel,
  isLayoutChanged,
  movePanelAmong,
  orderedPanels,
  panelWidth,
  parseLayout,
  setPanelWidth,
  type PageLayout,
  type PanelWidth,
} from './layoutModel';
import { TABS, WINDOWS, type ConsoleTab } from './tabsModel';

// MW.4 (DESIGN §9a "Movable panels"): the console's snap grid. Panels are
// reordered in the DOM, keyed, so forms stay mounted and the Tab order follows
// what the GM sees. Drag by a panel's heading, or use its menu from the keyboard.

const STORE = 'the-system.gm.layout.';
/** Pointer travel before a press on a heading counts as a drag. */
const DRAG_START_PX = 6;

function readLayout(tab: ConsoleTab): PageLayout {
  try {
    return parseLayout(window.localStorage.getItem(STORE + tab));
  } catch {
    return EMPTY_LAYOUT;
  }
}

function writeLayout(tab: ConsoleTab, layout: PageLayout): void {
  try {
    if (isLayoutChanged(layout)) window.localStorage.setItem(STORE + tab, JSON.stringify(layout));
    else window.localStorage.removeItem(STORE + tab);
  } catch {
    // No storage (private window): the layout lasts until the page closes.
  }
}

const WIDTH_LABEL: Readonly<Record<PanelWidth, string>> = {
  third: 'Third',
  half: 'Half',
  full: 'Full',
};

interface Panels {
  readonly layout: PageLayout;
  readonly dragging: string | null;
  readonly over: string | null;
  move(id: string, by: -1 | 1): void;
  setWidth(id: string, width: PanelWidth): void;
  press(id: string, event: ReactPointerEvent<HTMLDivElement>): void;
}

const PanelsContext = createContext<Panels | null>(null);

const placeId = (child: ReactElement): string => (child.props as { id: string }).id;

const placeNotice = (order: readonly string[], id: string, visible: readonly string[]): string => {
  const seen = order.filter((p) => visible.includes(p));
  return `Panel moved to place ${seen.indexOf(id) + 1} of ${seen.length}`;
};

/** The panels that draw a cell right now, in page order. */
function visiblePlaces(grid: HTMLElement | null): string[] {
  if (!grid) return [];
  return [...grid.querySelectorAll<HTMLElement>(':scope > .place')]
    .filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => el.dataset.window ?? '');
}

/** The place nearest a point, so a drop in the gap between panels still snaps. */
function nearestPlace(grid: HTMLElement, x: number, y: number): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const el of grid.querySelectorAll<HTMLElement>(':scope > .place')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = el.dataset.window ?? null;
    }
  }
  return best;
}

/** The console's tab panel: its places in the saved layout, and Reset layout. */
export function PanelGrid({ tab, children }: { tab: ConsoleTab; children: ReactNode }) {
  const [saved, setSaved] = useState<Partial<Record<ConsoleTab, PageLayout>>>(() =>
    Object.fromEntries(TABS.map((t) => [t.id, readLayout(t.id)])),
  );
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);
  const [notice, setNotice] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);
  const endDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => endDrag.current?.(), []);
  // A notice is about the page it was said on.
  useEffect(() => setNotice(''), [tab]);

  const layout = saved[tab] ?? EMPTY_LAYOUT;
  const places = Children.toArray(children).filter(isValidElement);
  const all = places.map(placeId);
  const shownKey = all.filter((id) => WINDOWS[id]?.includes(tab)).join(' ');
  const shown = useMemo(() => (shownKey === '' ? [] : shownKey.split(' ')), [shownKey]);

  const change = useCallback(
    (next: PageLayout) => {
      setSaved((s) => ({ ...s, [tab]: next }));
      writeLayout(tab, next);
    },
    [tab],
  );
  const current = useRef(layout);
  current.current = layout;

  const panels = useMemo<Panels>(
    () => ({
      layout,
      dragging: drag?.id ?? null,
      over: drag?.over ?? null,
      move(id, by) {
        const visible = visiblePlaces(gridRef.current);
        const next = movePanelAmong(shown, current.current, id, by, visible);
        if (next === current.current) {
          setNotice(by < 0 ? 'Already the first panel' : 'Already the last panel');
          return;
        }
        change(next);
        setNotice(placeNotice(orderedPanels(shown, next), id, visible));
      },
      setWidth(id, width) {
        change(setPanelWidth(current.current, id, width));
        setNotice(`Panel width: ${WIDTH_LABEL[width].toLowerCase()}`);
      },
      press(id, event) {
        if (event.button !== 0) return;
        const place = event.currentTarget;
        const target = event.target as Element;
        const heading = target.closest('h2');
        // Only the panel's own heading drags; forms inside it keep their pointer.
        if (!heading || heading.parentElement?.parentElement !== place) return;
        const grid = gridRef.current;
        if (!grid) return;
        const startX = event.clientX;
        const startY = event.clientY;
        let started = false;
        let over: string | null = null;
        const stop = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', stop);
          window.removeEventListener('keydown', onKey, true);
          endDrag.current = null;
          setDrag(null);
        };
        const onMove = (e: PointerEvent) => {
          if (!started) {
            if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_START_PX) return;
            started = true;
          }
          over = nearestPlace(grid, e.clientX, e.clientY);
          setDrag({ id, over });
        };
        const onUp = () => {
          const onto = over;
          const wasDragging = started;
          stop();
          if (!wasDragging || onto === null || onto === id) return;
          const next = dropPanel(shown, current.current, id, onto);
          change(next);
          setNotice(placeNotice(orderedPanels(shown, next), id, visiblePlaces(grid)));
        };
        const onKey = (e: KeyboardEvent) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          stop();
        };
        endDrag.current?.();
        endDrag.current = stop;
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', stop);
        window.addEventListener('keydown', onKey, true);
      },
    }),
    [layout, drag, shown, change],
  );

  const slots = arrangeSlots(all, shown, layout);
  const byId = new Map(places.map((p) => [placeId(p), p]));
  return (
    <PanelsContext.Provider value={panels}>
      <div className="layout-bar">
        <span role="status" className="muted" data-testid="layout-notice">
          {notice}
        </span>
        <button
          type="button"
          disabled={!isLayoutChanged(layout)}
          onClick={() => {
            change(EMPTY_LAYOUT);
            setNotice('Layout reset');
          }}
        >
          Reset layout
        </button>
      </div>
      <div
        ref={gridRef}
        className={`gm-grid${drag ? ' dragging' : ''}`}
        role="tabpanel"
        id={`tabpanel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {slots.map((id) => byId.get(id))}
      </div>
    </PanelsContext.Provider>
  );
}

/** One window's place in the grid: its width, its drag handle and its menu. */
export function MovablePlace({
  id,
  shown,
  children,
}: {
  id: string;
  shown: boolean;
  children: ReactNode;
}) {
  const panels = useContext(PanelsContext);
  const classes = ['place'];
  if (panels?.dragging === id) classes.push('drag-source');
  else if (panels?.dragging && panels.over === id) classes.push('drop-target');
  return (
    <div
      className={classes.join(' ')}
      data-window={id}
      data-width={panels ? panelWidth(panels.layout, id) : undefined}
      hidden={!shown}
      onPointerDown={panels ? (e) => panels.press(id, e) : undefined}
    >
      {shown && panels && <PanelMenu id={id} panels={panels} />}
      {children}
    </div>
  );
}

function PanelMenu({ id, panels }: { id: string; panels: Panels }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const width = panelWidth(panels.layout, id);
  return (
    <div
      className="panel-menu"
      data-testid={`panel-menu-${id}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="panel-menu-toggle"
        aria-label="Panel menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        ⋮
      </button>
      {open && (
        <div className="panel-menu-list" id={listId}>
          <button type="button" onClick={() => panels.move(id, -1)}>
            Move earlier
          </button>
          <button type="button" onClick={() => panels.move(id, 1)}>
            Move later
          </button>
          <div className="panel-menu-widths" role="group" aria-label="Width">
            Width:
            {PANEL_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={w === width}
                onClick={() => panels.setWidth(id, w)}
              >
                {WIDTH_LABEL[w]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
