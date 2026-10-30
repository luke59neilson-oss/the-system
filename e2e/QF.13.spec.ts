import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.13: a long campaign's change log arrives a page at a time. The GM sees
// the newest page, loads older ones on request, searches the whole log on the
// server, and new changes still appear live without losing loaded pages.

const GM_KEY = 'e2e-gm-key-qf13-0123456789abcdef13';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.13');
const golden = path.resolve(import.meta.dirname, '../packages/engine/test/golden/broadcast.jsonl');
const LINES = 230;
let server: RunningServer;
let dataDir: string;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  // The broadcast golden's campaign and Jake, then LINES broadcasts.
  const [created, jake] = readFileSync(golden, 'utf8').trim().split('\n');
  const start = Date.UTC(2026, 9, 24, 18, 1);
  const broadcasts = Array.from({ length: LINES }, (_, i) =>
    JSON.stringify({
      id: `q${i}`,
      type: 'system.broadcast',
      timestamp: new Date(start + 1000 * i).toISOString(),
      actor: { role: 'gm' },
      sessionId: 's1',
      schemaVersion: 1,
      payload: { text: `Line ${i}.`, characterIds: null },
    }),
  );
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-qf13-'));
  mkdirSync(path.join(dataDir, 'campaigns', 'main'), { recursive: true });
  writeFileSync(
    path.join(dataDir, 'campaigns', 'main', 'events.jsonl'),
    `${[created, jake, ...broadcasts].join('\n')}\n`,
  );
  server = await startBuiltServer({ GM_KEY }, { dataDir });
});

test.afterEach(async () => {
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

test('the change log pages, searches the whole log and stays live', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${server.url}/gm#key=${GM_KEY}`);
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  const log = page.locator('section[aria-labelledby="change-log"]');
  const rows = log.getByRole('listitem');
  await openWindow(page, 'change-log');
  await expect(rows).toHaveCount(100);
  // Loading the stored log turned XP overflow on (L16): the newest row.
  await expect(rows.first()).toContainText('XP now overflows');
  await expect(rows.nth(1)).toContainText(`Line ${LINES - 1}.`);
  await expect(log.getByText(/^Showing 100 of 23\d changes\.$/)).toBeVisible();

  await log.getByRole('button', { name: 'Load older' }).click();
  await expect(rows).toHaveCount(200);
  await expect(rows.nth(100)).toContainText(`Line ${LINES - 100}.`);

  // A new change arrives at the top; the loaded pages stay.
  const form = page.locator('form[aria-labelledby="broadcast"]');
  await form.getByLabel('Message').fill('Fresh news.');
  await form.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(rows.first()).toContainText('Fresh news.');
  await expect(rows).toHaveCount(201);

  await log.getByRole('button', { name: 'Load older' }).click();
  await expect(log.getByRole('button', { name: 'Load older' })).toHaveCount(0);
  await expect(rows.last()).toContainText('Campaign created');
  await page.screenshot({ path: path.join(shots, 'gm-1366x768.png') });

  // Undoing a row on a loaded older page: the list starts over from the
  // newest page (rows below it may have changed), never showing it un-undone.
  const old20 = rows.filter({ hasText: 'Line 20.' });
  await old20.getByRole('button', { name: 'Undo' }).click();
  await old20.getByRole('button', { name: 'Confirm undo' }).click();
  await expect(rows).toHaveCount(100);
  await log.getByLabel('Filter').fill('Line 20.');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('(undone)');
  await log.getByLabel('Filter').fill('');
  await expect(rows).toHaveCount(100);

  // The search runs on the server, so it finds rows no page has loaded.
  await log.getByLabel('Filter').fill('Line 7.');
  await expect(rows).toHaveCount(1);
  await expect(log.getByText('Showing 1 of 1 change.')).toBeVisible();
  await log.getByLabel('Filter').fill('');
  await expect(rows).toHaveCount(100);
  await log.screenshot({ path: path.join(shots, 'gm-change-log-1366x768.png') });
  expect(errors).toEqual([]);
});
