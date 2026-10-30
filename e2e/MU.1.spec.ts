import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';
import { TABS, windowsOn } from '../apps/web/src/gm/tabsModel';

// MU.1 (DESIGN §9a): the console opens on Home; every window opens from its
// tab; the open tab is remembered; the tabs work from the keyboard.
const GM_KEY = 'e2e-gm-key-mu1-0123456789abcdef0123';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MU.1');

let server: RunningServer | null = null;
let dataDir: string;
test.beforeEach(() => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-mu1-'));
});
test.afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(dataDir, { recursive: true, force: true });
});

test('every window opens from its tab; the tab is remembered', async ({ browser }) => {
  test.setTimeout(120_000);
  server = await startBuiltServer({ GM_KEY }, { dataDir });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const gm = await context.newPage();
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const tabs = gm.getByRole('tablist', { name: 'Console tabs' });
  await expect(tabs.getByRole('tab')).toHaveText(TABS.map((t) => t.label));
  await expect(tabs.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  for (const t of TABS) {
    await tabs.getByRole('tab', { name: t.label, exact: true }).click();
    const ids = windowsOn(t.id);
    for (const id of ids) {
      await expect(gm.locator(`[data-window="${id}"]`), id).toBeVisible();
    }
    // Nothing from another tab shows.
    const shown = await gm
      .locator('[data-window]:not([hidden])')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-window')));
    expect(shown.sort()).toEqual([...ids].sort());
    await gm.screenshot({ path: path.join(shots, `gm-${t.id}-1366x768.png`) });
  }

  // Remembered after a reload.
  await tabs.getByRole('tab', { name: 'Progression' }).click();
  await gm.reload();
  await expect(
    gm.getByRole('tablist', { name: 'Console tabs' }).getByRole('tab', { name: 'Progression' }),
  ).toHaveAttribute('aria-selected', 'true');

  // Keyboard: arrows move between tabs and focus follows.
  await gm.getByRole('tab', { name: 'Progression' }).focus();
  await gm.keyboard.press('ArrowRight');
  await expect(gm.getByRole('tab', { name: 'Library & settings' })).toBeFocused();
  await expect(gm.getByRole('tab', { name: 'Library & settings' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await gm.keyboard.press('Home');
  await expect(gm.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');

  // 1920×1080 shots of home and each tab.
  await gm.setViewportSize({ width: 1920, height: 1080 });
  for (const t of TABS) {
    await gm.getByRole('tab', { name: t.label, exact: true }).click();
    await gm.screenshot({ path: path.join(shots, `gm-${t.id}-1920x1080.png`) });
  }
  await context.close();
});

test('home lists what needs the GM; each item opens its window', async ({ browser }) => {
  server = await startBuiltServer({ GM_KEY }, { dataDir });
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Needs');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const home = gm.locator('section[aria-labelledby="needs-you"]');
  await expect(home).toContainText('Nothing waits on you.');
  await expect(home.getByTestId('home-session')).toHaveText(
    /^Needs · day \d+ · no session running$/,
  );
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  const items = home.getByRole('list', { name: 'Waiting on the GM' }).getByRole('button');
  const practice = items.filter({ hasText: /practice (entry|entries) to review/ });
  await expect(practice).toHaveCount(1);
  await gm.screenshot({ path: path.join(shots, 'gm-home-needs-you-1366x768.png') });
  await practice.click();
  await expect(gm.getByRole('tab', { name: 'Progression' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(gm.locator('[data-window="practice-capture"]')).toBeVisible();
});
