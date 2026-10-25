import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';
import { bigCampaignLines } from '../scripts/big-campaign';

// M11.3 Performance: a player's sheet is interactive in under 2 s on
// localhost, measured on a long campaign (50,000 events: 12,500 each of XP
// awards, practice entries, renames and System broadcasts), not on an empty
// one. "Interactive" = the sheet shows the live character (name, class line,
// connection) and a skill opens its details from a click. The 50,000-event
// load bound itself is `apps/server/test/perf.test.ts`.

const EVENTS = 50_000;
const BOUND_MS = 2000;
const shots = 'docs/screens/M11.3';
let dataDir: string;
let server: RunningServer | null = null;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-m11-3-'));
  const dir = path.join(dataDir, 'campaigns', 'main');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'events.jsonl'), `${bigCampaignLines(EVENTS).join('\n')}\n`);
  server = await startBuiltServer({}, { dataDir });
});

test.afterAll(async () => {
  await server?.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(
    `the player sheet of a ${EVENTS}-event campaign is interactive in under 2 s (${viewport.width}×${viewport.height})`,
    { tag: '@latency' },
    async ({ browser }) => {
      if (!server) throw new Error('no server');
      const page = await browser.newPage({ viewport });
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
      // Warm the server's caches and the browser's HTTP cache once, as a
      // player's second visit would; the timed load is a fresh page.
      await page.goto(`${server.url}/play/ana`);
      await expect(page.getByTestId('connection')).toHaveText('Connected', { timeout: 10_000 });
      await page.close();

      const timed = await browser.newPage({ viewport });
      timed.on('pageerror', (err) => errors.push(err.message));
      const started = Date.now();
      await timed.goto(`${server.url}/play/ana`);
      await expect(timed.getByTestId('connection')).toHaveText('Connected', { timeout: BOUND_MS });
      await expect(timed.getByTestId('name')).toHaveText(/^ana \d+$/, { timeout: BOUND_MS });
      await expect(timed.getByTestId('class')).toHaveText(/^\[Archer – lvl \d+\]$/);
      const skill = timed.locator('.skill-open').first();
      await skill.click({ timeout: BOUND_MS });
      await expect(timed.getByRole('dialog')).toBeVisible({ timeout: BOUND_MS });
      const ms = Date.now() - started;
      console.log(`M11.3: sheet interactive in ${ms} ms at ${viewport.width}×${viewport.height}`);
      await timed.screenshot({
        path: path.join(shots, `sheet-interactive-${viewport.width}x${viewport.height}.png`),
      });
      await timed.keyboard.press('Escape');
      await timed.screenshot({
        path: path.join(shots, `long-campaign-sheet-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
      expect(ms).toBeLessThan(BOUND_MS);

      // The long histories render their newest page; older entries are one
      // press away, newest first.
      const messages = timed.getByTestId('messages').locator('li');
      await expect(messages).toHaveCount(50);
      await expect(messages.first()).toHaveText(/^Notice \d+$/);
      const newest = Number((await messages.first().textContent())?.split(' ')[1]);
      const older = timed.getByTestId('messages-older');
      await expect(older).toHaveText(/^Show older \(\d{3,} more\)$/);
      await older.click();
      await expect(messages).toHaveCount(100);
      await expect(messages.nth(50)).toHaveText(`Notice ${newest - 50 * 4}`);
      // Level-ups alone are few (4 here: the G cap); everything is 12,500+.
      const dings = timed.getByTestId('dings').locator('li');
      await expect(timed.getByTestId('dings-older')).toBeHidden();
      await timed.getByLabel('Show', { exact: true }).selectOption('all');
      await expect(dings).toHaveCount(50);
      await timed.getByTestId('dings-older').click();
      await expect(dings).toHaveCount(100);
      await timed.getByTestId('dings-older').scrollIntoViewIfNeeded();
      await timed.screenshot({
        path: path.join(shots, `show-older-${viewport.width}x${viewport.height}.png`),
      });
      // Search still reaches entries older than the shown page.
      await timed.getByLabel('Search notifications').fill('Notice 39999');
      await expect(dings).toHaveCount(1);
      await expect(dings.first()).toContainText('Notice 39999');
      expect(errors).toEqual([]);
    },
  );
}
