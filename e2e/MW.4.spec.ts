import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MW.4 (DESIGN §9a "Movable panels"): drag a panel, move one by keyboard, both
// survive a reload, Reset restores; forms stay filled; player screens unchanged.

const GM_KEY = 'e2e-gm-key-mw4-0123456789abcdef0004';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MW.4');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

async function openConsole(gm: Page) {
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Panels');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  // Loading the demo drops the socket and reconnects a second later (QF.70);
  // the demo party in View as proves the new socket has the demo's state.
  await expect(
    gm.getByRole('navigation', { name: 'View as' }).getByRole('button', { name: 'Jake' }),
  ).toBeVisible();
  await expect(gm.getByTestId('connection')).toHaveText('Connected');
}

/** The ids of the panels on the open tab, in the order they draw. */
const order = (gm: Page) =>
  gm
    .locator('.gm-grid > .place:visible')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-window')));

async function drag(gm: Page, from: string, onto: string) {
  const heading = gm.locator(`[data-window="${from}"] > * > h2`).first();
  await heading.scrollIntoViewIfNeeded();
  const a = await heading.boundingBox();
  if (!a) throw new Error(`no heading for ${from}`);
  await gm.mouse.move(a.x + 20, a.y + a.height / 2);
  await gm.mouse.down();
  await gm.mouse.move(a.x + 40, a.y + a.height / 2, { steps: 3 });
  const b = await gm.locator(`[data-window="${onto}"]`).boundingBox();
  if (!b) throw new Error(`no panel ${onto}`);
  await gm.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 60), { steps: 5 });
  await expect(gm.locator(`[data-window="${onto}"]`)).toHaveClass(/drop-target/);
  return () => gm.mouse.up();
}

test('drag and keyboard moves survive a reload; Reset layout restores', async ({ browser }) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await openConsole(gm);

  await openTab(gm, 'session');
  const start = await order(gm);
  expect(start.slice(0, 3)).toEqual(['session', 'award-xp', 'listen']);
  const reset = gm.getByRole('button', { name: 'Reset layout' });
  await expect(reset).toBeDisabled();
  await gm.screenshot({ path: path.join(shots, 'default-session-1366x768.png') });

  // A half-filled form survives its panel being moved.
  const reason = gm.locator('[data-window="award-xp"]').getByRole('spinbutton').first();
  await reason.fill('37');

  // Drag by the heading: the panel takes the spot of the one dropped on.
  const drop = await drag(gm, 'listen', 'session');
  await gm.screenshot({ path: path.join(shots, 'dragging-1366x768.png') });
  await drop();
  await expect.poll(() => order(gm)).toEqual(['listen', ...start.filter((i) => i !== 'listen')]);
  await expect(reason).toHaveValue('37');

  // A press on a heading that does not travel is not a drag.
  await gm.locator('[data-window="session"] > * > h2').first().click();
  expect((await order(gm))[0]).toBe('listen');

  // Keyboard only: focus the menu, Enter opens it, Enter moves, focus stays.
  const toggle = gm.getByTestId('panel-menu-award-xp').getByRole('button', { name: 'Panel menu' });
  await toggle.focus();
  await gm.keyboard.press('Enter');
  const later = gm.getByRole('button', { name: 'Move later' });
  await expect(later).toBeVisible();
  await gm.keyboard.press('Tab'); // Move earlier
  await expect(gm.getByRole('button', { name: 'Move earlier' })).toBeFocused();
  await gm.keyboard.press('Enter');
  await expect
    .poll(async () => (await order(gm)).slice(0, 3))
    .toEqual(['listen', 'award-xp', 'session']);
  await expect(gm.getByRole('button', { name: 'Move earlier' })).toBeFocused();
  await expect(gm.getByTestId('layout-notice')).toHaveText('Panel moved to place 2 of 13');

  // Width from the same menu; the third/half/full buttons say which is on.
  await gm.keyboard.press('Tab');
  await gm.keyboard.press('Tab');
  await gm.keyboard.press('Tab'); // Third, Half
  const half = gm.getByRole('button', { name: 'Half', exact: true });
  await expect(half).toBeFocused();
  await gm.keyboard.press('Enter');
  await expect(half).toHaveAttribute('aria-pressed', 'true');
  await expect(gm.locator('[data-window="award-xp"]')).toHaveAttribute('data-width', 'half');
  await gm.screenshot({ path: path.join(shots, 'panel-menu-1366x768.png') });

  // Escape closes the menu and focus returns to it.
  await gm.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(half).toBeHidden();

  const changed = await order(gm);
  await gm.screenshot({ path: path.join(shots, 'rearranged-session-1366x768.png') });

  // Layouts are per page: Home is untouched.
  await openTab(gm, 'home');
  expect((await order(gm)).slice(0, 2)).toEqual(['needs-you', 'join']);
  await expect(reset).toBeDisabled();

  // Both survive a reload (the tab is remembered too; open it anyway).
  await gm.reload();
  await expect(gm.getByTestId('connection')).toHaveText('Connected');
  await openTab(gm, 'session');
  await expect.poll(() => order(gm)).toEqual(changed);
  await expect(gm.locator('[data-window="award-xp"]')).toHaveAttribute('data-width', 'half');
  const widths = await gm
    .locator('[data-window="award-xp"]')
    .evaluate((el) => el.getBoundingClientRect().width / el.parentElement!.clientWidth);
  expect(widths).toBeGreaterThan(0.45);
  expect(widths).toBeLessThan(0.55);

  // Unknown saved panels are ignored; a broken save counts as none (the unit
  // tests cover the rules, this proves the console reads them through).
  await gm.evaluate(
    `window.localStorage.setItem('the-system.gm.layout.home', '${JSON.stringify({ order: ['gone', 'join', 'needs-you'] })}')`,
  );
  await gm.reload();
  await expect(gm.getByTestId('connection')).toHaveText('Connected');
  await openTab(gm, 'home');
  // Party follows Join, the panel before it by default (a panel the save does not name).
  await expect.poll(async () => (await order(gm)).slice(0, 2)).toEqual(['join', 'party']);
  expect(await order(gm)).not.toContain('gone');
  await gm.getByRole('button', { name: 'Reset layout' }).click();
  await expect.poll(async () => (await order(gm)).slice(0, 2)).toEqual(['needs-you', 'join']);

  // Reset restores the page.
  await openTab(gm, 'session');
  await reset.click();
  await expect.poll(() => order(gm)).toEqual(start);
  await expect(gm.locator('[data-window="award-xp"]')).toHaveAttribute('data-width', 'third');
  await expect(reset).toBeDisabled();
  await expect(gm.getByTestId('layout-notice')).toHaveText('Layout reset');
  await gm.reload();
  await expect(gm.getByTestId('connection')).toHaveText('Connected');
  await openTab(gm, 'session');
  await expect.poll(() => order(gm)).toEqual(start);

  // Escape during a drag cancels it.
  const pending = await drag(gm, 'listen', 'session');
  await gm.keyboard.press('Escape');
  await pending();
  expect(await order(gm)).toEqual(start);

  // Player screens keep their fixed layout: no panel controls reach them.
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await player.goto(`${server.url}/play/demo-jake`);
  await expect(player.getByTestId('connection')).toHaveText('Connected');
  await expect(player.getByTestId('status')).toBeVisible();
  await expect(player.getByRole('button', { name: 'Panel menu' })).toHaveCount(0);
  await expect(player.getByRole('button', { name: 'Reset layout' })).toHaveCount(0);
});

test('the Evolutions, Progression and Library tabs have panel menus too', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await openConsole(gm);
  for (const tab of ['home', 'progression', 'evolutions', 'library'] as const) {
    await openTab(gm, tab);
    const panels = await order(gm);
    expect(panels.length).toBeGreaterThan(0);
    await expect(gm.locator('.gm-grid > .place:visible .panel-menu-toggle')).toHaveCount(
      panels.length,
    );
    // Every visible place draws a window: none is an empty cell with only a menu.
    for (const id of panels) {
      await expect(gm.locator(`[data-window="${id}"] > :not(.panel-menu)`).first()).toBeVisible();
    }
  }
  await openTab(gm, 'home');
  await gm.screenshot({ path: path.join(shots, 'default-home-1366x768.png') });

  // A narrower window: Reset layout and its notice clear the wrapped tab bar.
  await gm.setViewportSize({ width: 800, height: 768 });
  const tabs = await gm.getByRole('tablist', { name: 'Console tabs' }).boundingBox();
  const bar = await gm.locator('.layout-bar').boundingBox();
  if (!tabs || !bar) throw new Error('no tab bar or layout bar');
  expect(bar.y).toBeGreaterThanOrEqual(tabs.y + tabs.height);
});
