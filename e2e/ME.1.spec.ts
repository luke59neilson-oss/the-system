import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_RULES } from '@the-system/engine';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// ME.1 Every track grants stats (DESIGN §2, §4): a campaign created before ME
// keeps its old numbers until the GM switches in Rules settings; the switch is
// one recorded rules change and applies from the next level-up (D300, D301).

const GM_KEY = 'e2e-gm-key-me1-0123456789abcdefME1';
const shots = path.resolve(import.meta.dirname, '../docs/screens/ME.1');
let dataDir: string;
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-me1-'));
  server = await startBuiltServer({ GM_KEY }, { dataDir });
});

test.afterEach(async () => {
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

/** Runs one GM command over the GM page's own origin. */
async function gmCommand(gm: Page, command: Record<string, unknown>): Promise<void> {
  const result = await gm.evaluate(
    ({ key, command }) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(
          `ws://${(globalThis as unknown as { location: { host: string } }).location.host}/ws`,
        );
        ws.onmessage = (e) => {
          const m = JSON.parse(String(e.data)) as { type: string; ok?: boolean; error?: string };
          if (m.type === 'hello') ws.send(JSON.stringify({ type: 'join', role: 'gm', gmKey: key }));
          if (m.type === 'joined')
            ws.send(JSON.stringify({ type: 'command', requestId: 'x', command }));
          if (m.type === 'result') {
            ws.close();
            resolve(m.ok ? 'ok' : (m.error ?? 'failed'));
          }
        };
      }),
    { key: GM_KEY, command },
  );
  expect(result).toBe('ok');
}

test('an old campaign switches to the new stat budgets from the next level-up', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Old Rules');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await openWindow(gm, 'create-character');
  await gm.getByLabel('Name', { exact: true }).fill('Jake');
  await gm.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  // New campaigns have the budgets: no switch to offer.
  const panel = gm.locator('section[aria-labelledby="rules-settings"]');
  await openWindow(gm, 'rules-settings');
  await expect(panel.getByTestId('track-budget-switch')).toHaveCount(0);

  // The rules as a campaign created before ME stored them.
  const old = JSON.parse(JSON.stringify(DEFAULT_RULES)) as {
    grades: { trackBudget?: unknown }[];
    tracks: { professionUnlockGrade: string };
  };
  for (const g of old.grades) delete g.trackBudget;
  old.tracks.professionUnlockGrade = 'E';
  await gmCommand(gm, { type: 'rules.set', rules: old });

  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await player.goto(server.url);
  await player.getByRole('link', { name: /Jake/ }).click();
  const free = player.getByTestId('free-points');
  const level = async (amount: number) => {
    const form = gm.locator('form[aria-labelledby="award-xp"]');
    await openWindow(gm, 'award-xp');
    await gm.getByLabel('Amount').fill(String(amount));
    await gm.getByRole('button', { name: 'Award XP' }).click();
    await expect(form.getByRole('status')).toHaveText(/^Awarded [\d,]+ class XP to /);
  };

  // Old numbers: 2 free points per race level at G.
  await level(100);
  await expect(free).toHaveText('2');

  await openWindow(gm, 'rules-settings');
  const switcher = panel.getByTestId('track-budget-switch');
  await expect(switcher).toContainText('professions from E-grade');
  await switcher.screenshot({ path: path.join(shots, 'gm-switch-1366x768.png') });
  await switcher.getByRole('button', { name: 'Switch to the new stat budgets' }).click();
  await expect(panel.getByRole('status')).toHaveText('Switched to the new stat budgets.');
  await expect(switcher).toHaveCount(0);
  // Points already given stay as they are.
  await expect(free).toHaveText('2');

  // From the next level-up: the race's 5 free points at G.
  await level(100);
  await expect(free).toHaveText('7');
  await player.screenshot({ path: path.join(shots, 'player-after-switch-390x844.png') });
});
