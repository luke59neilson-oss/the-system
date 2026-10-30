import type { Locator, Page } from '@playwright/test';
import { TABS, tabOf, type ConsoleTab } from '../../apps/web/src/gm/tabsModel';

// MU.1: the GM console shows one tab at a time (DESIGN §9a). Specs open the
// tab that holds a window before using it, the way the GM would.

/** Clicks a console tab by id. */
export async function openTab(gm: Page, tab: ConsoleTab): Promise<void> {
  const label = TABS.find((t) => t.id === tab)?.label ?? tab;
  await gm
    .getByRole('tablist', { name: 'Console tabs' })
    .getByRole('tab', { name: label, exact: true })
    .click();
}

/** Opens the tab that holds a window (by its id in `tabsModel.ts`). */
export async function openWindow(gm: Page, windowId: string): Promise<void> {
  const tab = tabOf(windowId);
  if (!tab) throw new Error(`No GM window "${windowId}" in tabsModel.ts`);
  await openTab(gm, tab);
}

/** Opens the tab that holds whatever window `target` sits in. */
export async function reveal(gm: Page, target: Locator): Promise<Locator> {
  const id = await target
    .first()
    .evaluate((el) => el.closest('[data-window]')?.getAttribute('data-window') ?? null);
  if (id) await openWindow(gm, id);
  return target;
}
