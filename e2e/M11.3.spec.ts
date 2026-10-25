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
      // No warm-up: the timed visit is the first one this test makes. In this
      // serial (latency) project the 1366 test runs first after the server
      // starts, so it measures the cold path (the server builds the 12,500-
      // entry notification history for the first time).
      const errors: string[] = [];
      const timed = await browser.newPage({ viewport });
      timed.on('pageerror', (err) => errors.push(err.message));
      timed.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
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
      const pageEnd = Number((await messages.nth(49).textContent())?.split(' ')[1]);
      const older = timed.getByTestId('messages-older');
      await expect(older).toHaveText(/^Show older \(\d{3,} more\)$/);
      await older.click();
      await expect(messages).toHaveCount(100);
      // Focus moves to the first newly shown entry, the next older one.
      await expect(messages.nth(50)).toBeFocused();
      const next = Number((await messages.nth(50).textContent())?.split(' ')[1]);
      expect(next).toBeLessThan(pageEnd);
      // Level-ups alone are few (4 here: the G cap); everything is 12,500+.
      const dings = timed.getByTestId('dings').locator('li');
      await expect(timed.getByTestId('dings-older')).toBeHidden();
      await timed.getByLabel('Show', { exact: true }).selectOption('all');
      await expect(dings).toHaveCount(50);
      await timed.getByTestId('dings-older').click();
      await expect(dings).toHaveCount(100);
      await expect(dings.nth(50)).toBeFocused();
      await timed.getByTestId('dings-older').scrollIntoViewIfNeeded();
      await timed.screenshot({
        path: path.join(shots, `show-older-${viewport.width}x${viewport.height}.png`),
      });
      // Search still reaches entries older than the shown page.
      await timed.getByLabel('Search notifications').fill('Notice 39999');
      await expect(dings).toHaveCount(1);
      await expect(dings.first()).toContainText('Notice 39999');
      // A new filter or search starts again from the newest page.
      await timed.getByLabel('Search notifications').fill('');
      await expect(dings).toHaveCount(50);
      expect(errors).toEqual([]);
    },
  );
}
