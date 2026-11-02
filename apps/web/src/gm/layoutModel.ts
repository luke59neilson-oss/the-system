// MW.4 (DESIGN §9a "Movable panels"): the GM console's panel layout, one per
// page, without the UI. A layout is what the GM changed; the panels on the
// page come from the code, so an unknown panel in a saved layout is ignored
// and a panel added by a later release appears in its default spot.

export const PANEL_WIDTHS = ['third', 'half', 'full'] as const;
export type PanelWidth = (typeof PANEL_WIDTHS)[number];

export interface PageLayout {
  readonly order: readonly string[];
  readonly widths: Readonly<Record<string, PanelWidth>>;
}

export const EMPTY_LAYOUT: PageLayout = { order: [], widths: {} };

const isWidth = (v: unknown): v is PanelWidth => PANEL_WIDTHS.includes(v as PanelWidth);

/** A saved layout as read from storage: anything malformed counts as nothing saved. */
export function parseLayout(raw: string | null): PageLayout {
  if (raw === null) return EMPTY_LAYOUT;
  try {
    const data = JSON.parse(raw) as { order?: unknown; widths?: unknown };
    const order = Array.isArray(data.order)
      ? [...new Set(data.order.filter((id): id is string => typeof id === 'string'))]
      : [];
    const widths: Record<string, PanelWidth> = {};
    if (typeof data.widths === 'object' && data.widths !== null) {
      for (const [id, width] of Object.entries(data.widths)) {
        if (isWidth(width)) widths[id] = width;
      }
    }
    return { order, widths };
  } catch {
    return EMPTY_LAYOUT;
  }
}

/**
 * The page's panels in layout order. Saved panels keep their saved order;
 * unknown ones are dropped; a panel the layout does not name goes right after
 * the panel before it in the default order (first if there is none).
 */
export function orderedPanels(defaults: readonly string[], layout: PageLayout): string[] {
  const known = new Set(defaults);
  const out = layout.order.filter((id) => known.has(id));
  const placed = new Set(out);
  defaults.forEach((id, i) => {
    if (placed.has(id)) return;
    const before = defaults[i - 1];
    const at = before === undefined ? -1 : out.indexOf(before);
    out.splice(at + 1, 0, id);
    placed.add(id);
  });
  return out;
}

/** Moves a panel one place earlier or later; at either end nothing changes. */
export function movePanel(
  defaults: readonly string[],
  layout: PageLayout,
  id: string,
  by: -1 | 1,
): PageLayout {
  const order = orderedPanels(defaults, layout);
  const from = order.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= order.length) return layout;
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...layout, order };
}

/**
 * Moves a panel past its nearest neighbour the GM can see. A window that draws
 * nothing right now holds a slot but no cell, so it is never the neighbour; the
 * move changes nothing at either end of what shows.
 */
export function movePanelAmong(
  defaults: readonly string[],
  layout: PageLayout,
  id: string,
  by: -1 | 1,
  visible: readonly string[],
): PageLayout {
  const seen = orderedPanels(defaults, layout).filter((p) => visible.includes(p));
  const neighbour = seen[seen.indexOf(id) + by];
  if (!seen.includes(id) || neighbour === undefined) return layout;
  return dropPanel(defaults, layout, id, neighbour);
}

/** Puts a dragged panel in the spot of the panel it was dropped on. */
export function dropPanel(
  defaults: readonly string[],
  layout: PageLayout,
  id: string,
  onto: string,
): PageLayout {
  const order = orderedPanels(defaults, layout);
  const from = order.indexOf(id);
  const to = order.indexOf(onto);
  if (from < 0 || to < 0 || from === to) return layout;
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...layout, order };
}

export const setPanelWidth = (layout: PageLayout, id: string, width: PanelWidth): PageLayout => ({
  ...layout,
  widths: { ...layout.widths, [id]: width },
});

/** The width a panel shows at: the GM's choice, else its default. */
export const panelWidth = (layout: PageLayout, id: string): PanelWidth =>
  layout.widths[id] ?? DEFAULT_WIDTHS[id] ?? 'third';

/** Panels that start full width, as their own stylesheet rules used to make them. */
const DEFAULT_WIDTHS: Readonly<Record<string, PanelWidth>> = {
  party: 'full',
  feed: 'full',
  encounter: 'full',
  trackers: 'full',
  'offer-builder': 'full',
  'skill-library': 'full',
  'item-library': 'full',
  'loot-tables': 'full',
  'origin-library': 'full',
  'rules-settings': 'full',
};

/**
 * Every panel of the console in the order to mount it: the page's panels take
 * the page's slots in layout order and the panels of other tabs keep theirs,
 * so a tab switch moves as few mounted panels as it can.
 */
export function arrangeSlots(
  all: readonly string[],
  shown: readonly string[],
  layout: PageLayout,
): string[] {
  const onPage = new Set(shown);
  const ordered = orderedPanels(shown, layout);
  let next = 0;
  return all.map((id) => (onPage.has(id) ? (ordered[next++] ?? id) : id));
}

export const isLayoutChanged = (layout: PageLayout): boolean =>
  layout.order.length > 0 || Object.keys(layout.widths).length > 0;
