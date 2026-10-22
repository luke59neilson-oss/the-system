import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.8 Quest log: the demo quest's text, days left and visible World
// Stability gauge (89, D70), updating live as the GM changes them.

const GM_KEY = 'e2e-gm-key-m38-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.8');
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterAll(async () => {
  await server.stop();
});

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

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

test('the quest log shows the demo quest and follows the GM live', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Quest Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(laptop);
  await laptop.goto(server.url);
  await laptop.getByRole('link', { name: /Jake/ }).click();
  const log = laptop.getByTestId('quests');
  const quest = log.getByRole('article', { name: 'The world is dying' });
  await expect(quest).toContainText('Delve to the heart of the world and purge the infection.');
  await expect(quest.getByTestId('quest-time')).toHaveText('Time remaining: 26 days');
  await expect(quest.getByTestId('stability-value')).toHaveText('89');
  await expect(quest.getByRole('meter', { name: 'World Stability' })).toHaveAttribute(
    'aria-valuenow',
    '89',
  );
  await expect(log.getByTestId('day')).toHaveText('Day 5');
  await laptop.screenshot({ path: path.join(shots, 'player-quests-1366x768.png') });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Miranda/ }).click();
  const phoneLog = phone.getByTestId('quests');
  await expect(phoneLog.getByTestId('stability-value')).toHaveText('89');
  await phoneLog.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'player-quests-390x844.png') });

  // Live: a cleansed zone drops the gauge; days pass; the GM hides the gauge.
  await gmCommand(gm, { type: 'stability.applyAction', questId: 'demo-quest', tag: 'cleanse' });
  await expect(quest.getByTestId('stability-value')).toHaveText('84');
  await gmCommand(gm, { type: 'campaign.advanceDay', days: 25 });
  await expect(quest.getByTestId('quest-time')).toHaveText('Time remaining: 1 day');
  await gmCommand(gm, { type: 'campaign.advanceDay' });
  await expect(quest.getByTestId('quest-time')).toHaveText('Time is up');
  await gmCommand(gm, { type: 'quest.edit', questId: 'demo-quest', stabilityVisible: false });
  await expect(quest.getByTestId('stability')).toHaveCount(0);
  await expect(phoneLog.getByTestId('stability')).toHaveCount(0);

  // A finished quest moves under "Finished quests"; a hidden one vanishes.
  await gmCommand(gm, { type: 'quest.setStatus', questId: 'demo-quest', status: 'completed' });
  await expect(log.getByText('No active quests.')).toBeVisible();
  const finished = log.getByTestId('finished-quests');
  await finished.locator('summary').click();
  await expect(finished.getByTestId('quest-status')).toHaveText('Completed');
  await gmCommand(gm, { type: 'quest.edit', questId: 'demo-quest', visible: false });
  await expect(log.getByTestId('quest')).toHaveCount(0);

  expect(errors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
