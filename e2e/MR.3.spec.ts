import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';
import { openWindow } from './helpers/gmTabs';

// MR.3 XP overflow for every campaign (DESIGN §2, L16, D153): a campaign stored
// on the old banking rules switches to overflow when the app loads it, so the
// GM's XP form warns that an award to a character at the grade top is lost.

const GM_KEY = 'e2e-gm-key-mr3-0123456789abcdef03';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MR.3');
const golden = path.resolve(
  import.meta.dirname,
  '../packages/engine/test/golden/rules-migration.jsonl',
);
let server: RunningServer;
let dataDir: string;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  // The golden log up to its migration: banking rules, Jake at the G top with 600 banked.
  const lines = readFileSync(golden, 'utf8').trim().split('\n');
  const stored = lines.slice(
    0,
    lines.findIndex((l) => l.includes('"type":"rules.migrated"')),
  );
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-mr3-'));
  mkdirSync(path.join(dataDir, 'campaigns', 'main'), { recursive: true });
  writeFileSync(path.join(dataDir, 'campaigns', 'main', 'events.jsonl'), `${stored.join('\n')}\n`);
  server = await startBuiltServer({ GM_KEY }, { dataDir });
});

test.afterEach(async () => {
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

test('a stored banking campaign loads with XP overflow on', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${server.url}/gm#key=${GM_KEY}`);
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  await expect(page.getByTestId('class-level-jake')).toHaveText('4');
  await openWindow(page, 'award-xp');
  await page.getByLabel('Amount').fill('300');
  await page.getByRole('checkbox', { name: /Ana/ }).uncheck();
  await expect(page.getByTestId('lost-jake')).toHaveText(' · 300 lost');
  await expect(page.getByTestId('xp-lost')).toContainText('300 XP will be lost');
  await page
    .getByRole('form', { name: 'Award class XP' })
    .screenshot({ path: path.join(shots, 'xp-lost-after-migration-1366.png') });
  await page.screenshot({ path: path.join(shots, 'gm-1366x768.png') });

  // The migration is in the stored log, once.
  const log = readFileSync(path.join(dataDir, 'campaigns', 'main', 'events.jsonl'), 'utf8');
  expect(log.match(/"type":"rules\.migrated"/g)).toHaveLength(1);
  expect(errors).toEqual([]);
});
