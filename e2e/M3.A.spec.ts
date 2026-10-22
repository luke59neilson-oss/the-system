import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.A Milestone acceptance: every player window of the demo campaign, for
// every demo character, at each supported viewport (DESIGN §9: 1366×768 and
// 1920×1080 laptops, 390×844 phones), with zero console errors, no sideways
// scroll, the dialogs opening and closing, and no GM-only text in any player
// WebSocket frame. The item-level behaviour lives in e2e/M3.1–M3.13.

const GM_KEY = 'e2e-gm-key-m3a-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.A');
// Each viewport gets its own server so each starts from an empty data folder.
let server: RunningServer | undefined;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server?.stop();
  server = undefined;
});

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

function watchFrames(page: Page) {
  const frames: string[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => frames.push(String(f.payload)));
  });
  return frames;
}

/** GM-only demo text (entity GM names, deeper tiers, the Drum, the GM note). */
const GM_ONLY = [
  'immune',
  'Immune',
  'The Host’s Response',
  'whale’s heart',
  'Heart of the World',
  'Drum reveal',
  'tutorial boss',
  // The GM-only montage clock (D86) and the stability rule tags (D83).
  'Cross the marsh',
  'demo-clock-marsh',
  'pale hunter',
];
/** Jake's unshared journal entry: only Jake's own screen may receive it. */
const JAKE_PRIVATE = ['Something is watching', 'Not telling the others yet'];

/** Every player window M3 added (M3.2–M3.12). */
const WINDOWS = [
  'status',
  'history',
  'quests',
  'inventory',
  'identify',
  'notes',
  'practice',
  'party',
];

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
];

/** Acceptance shots are JPEG to keep the repo small (30 pages). */
const JPEG = { type: 'jpeg', quality: 80 } as const;

const CHARACTERS = ['Jake', 'Miranda', 'Casper', 'Sultan'];

async function noSidewaysScroll(page: Page, width: number): Promise<void> {
  const scroll = await page.locator('html').evaluate((el) => el.scrollWidth);
  expect(scroll).toBeLessThanOrEqual(width);
}

for (const viewport of VIEWPORTS) {
  const size = `${viewport.width}x${viewport.height}`;
  test(`every player window for every demo character at ${size}`, async ({ browser }) => {
    test.setTimeout(180_000);
    if (!server) throw new Error('server not started');
    const url = server.url;
    const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const gmErrors = watchErrors(gm);
    gm.on('dialog', (d) => void d.accept());
    await gm.goto(`${url}/gm#key=${GM_KEY}`);
    await gm.getByLabel('Campaign name').fill(`Acceptance ${size}`);
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    await gm.getByRole('button', { name: 'Load demo campaign' }).click();
    await expect(gm.getByTestId('demo-badge')).toBeVisible();

    for (const name of CHARACTERS) {
      const page = await browser.newPage({ viewport });
      const errors = watchErrors(page);
      const frames = watchFrames(page);

      // M3.1: the join screen lists the party; pick one.
      await page.goto(url);
      await expect(page.getByRole('link', { name: /Jake/ })).toBeVisible();
      await noSidewaysScroll(page, viewport.width);
      await page.getByRole('link', { name: new RegExp(name) }).click();

      // Every window is there and nothing scrolls sideways.
      await expect(page.getByTestId('name')).toContainText(name);
      for (const id of WINDOWS) await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByTestId('party').getByTestId('party-member')).toHaveCount(
        CHARACTERS.length - 1,
      );
      await expect(page.getByTestId('quests').getByTestId('stability-value')).toHaveText('89%');
      await noSidewaysScroll(page, viewport.width);

      // Practice forms name skills officially, with the nickname beside (D78).
      if (name === 'Jake') {
        await expect(page.locator('.practice-skills').first()).toContainText(
          'Expert Archery “Old Faithful”',
        );
      }

      // M3.5: the first skill's detail opens as a dialog and Escape closes it.
      const firstSkill = page.getByTestId('skill').first().getByRole('button').first();
      await firstSkill.click();
      await expect(page.getByTestId('skill-detail')).toBeVisible();
      await noSidewaysScroll(page, viewport.width);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('skill-detail')).toHaveCount(0);

      // M3.6: an open menu shows its offers; leave it for later.
      if ((await page.getByTestId('selection-badge').count()) > 0) {
        await page.getByRole('button', { name: '[Choose]' }).click();
        const dialog = page.getByRole('dialog', { name: 'Skill selection' });
        await expect(dialog.getByTestId('offer').first()).toBeVisible();
        await noSidewaysScroll(page, viewport.width);
        await page.screenshot({
          path: path.join(shots, `${name.toLowerCase()}-selection-${size}.jpg`),
          ...JPEG,
        });
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
      }

      // M3.9: Identify a known entity, when there is one.
      const target = page.getByTestId('identify-target');
      if ((await target.count()) > 0) {
        await target.first().click();
        await expect(page.getByTestId('identify-text')).toBeVisible();
        await noSidewaysScroll(page, viewport.width);
      }

      // The first screenful, as a player sees it on opening the page.
      await page.locator('html').evaluate((el) => el.scrollIntoView());
      await page.screenshot({
        path: path.join(shots, `${name.toLowerCase()}-${size}.jpg`),
        ...JPEG,
      });
      await page.screenshot({
        path: path.join(shots, `${name.toLowerCase()}-${size}-full.jpg`),
        fullPage: true,
        ...JPEG,
      });

      // Canary: no GM-only text, and Jake's private entry only on Jake's screen.
      expect(frames.length).toBeGreaterThan(0);
      const all = frames.join('\n');
      for (const secret of GM_ONLY) expect(all).not.toContain(secret);
      if (name !== 'Jake') for (const secret of JAKE_PRIVATE) expect(all).not.toContain(secret);
      expect(errors, `${name} at ${size}`).toEqual([]);
      await page.close();
    }
    expect(gmErrors).toEqual([]);
  });
}
