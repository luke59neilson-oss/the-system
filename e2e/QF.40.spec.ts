import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.40: a non-latest undo never silently loses XP. The undo confirm says what
// an allowed undo changes in levels, and an undo that would lose later XP at an
// old level cap is refused with whose levels it would cost.

const GM_KEY = 'e2e-gm-key-qf40-0123456789abcdef40';
const SHOTS = path.resolve(import.meta.dirname, '../docs/screens/QF.40');
let dataDir: string;
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(SHOTS, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-qf40-'));
  server = await startBuiltServer({ GM_KEY }, { dataDir });
});

test.afterEach(async () => {
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

/** Sends GM commands over the page's own origin, as the console does. */
async function gmCommands(page: Page, commands: unknown[]) {
  await page.evaluate(
    async ({ key, url, commands }) => {
      const ws = new WebSocket(url);
      await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
      ws.send(JSON.stringify({ type: 'join', role: 'gm', gmKey: key }));
      for (const [i, command] of commands.entries()) {
        const done = new Promise<void>((ok, fail) => {
          const on = (e: { data: unknown }) => {
            const m = JSON.parse(String(e.data)) as {
              type: string;
              requestId?: string;
              ok?: boolean;
              error?: string;
            };
            if (m.requestId !== `qf40-${i}`) return;
            ws.removeEventListener('message', on);
            if (m.ok === false) fail(new Error(m.error));
            else ok();
          };
          ws.addEventListener('message', on);
        });
        ws.send(JSON.stringify({ type: 'command', requestId: `qf40-${i}`, command }));
        await done;
      }
      ws.close();
    },
    { key: GM_KEY, url: `${server.url.replace(/^http/, 'ws')}/ws`, commands },
  );
}

const award = (amount: number) => ({
  type: 'xp.award',
  track: 'class',
  amount,
  participants: [{ characterId: 'jake' }],
});

test('the undo confirm shows level changes and refuses an undo that would lose XP', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${server.url}/gm#key=${GM_KEY}`);
  await page.getByLabel('Campaign name').fill('Undo Test');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByLabel('Campaign name')).toHaveCount(0);
  await gmCommands(page, [
    {
      type: 'character.create',
      id: 'jake',
      name: 'Jake',
      className: 'Archer',
      classSkills: [
        { name: 'Basic Archery', rarity: 'inferior' },
        { name: 'Basic Stealth', rarity: 'inferior' },
        { name: 'Archer’s Eye', rarity: 'common' },
      ],
    },
    award(400),
    {
      type: 'evolution.release',
      characterId: 'jake',
      options: [{ className: 'Hunter' }],
      rerateApproved: true,
      override: true,
    },
    { type: 'evolution.choose', characterId: 'jake', optionId: 'o1' },
    award(300),
    award(600),
  ]);
  await openWindow(page, 'change-log');
  const log = page.locator('section[aria-labelledby="change-log"]');
  const awards = log.getByRole('listitem').filter({ hasText: /XP/ });
  // The newest award: the confirm says Jake drops from class 7 to 5.
  const newest = awards.first();
  await newest.getByRole('button', { name: 'Undo' }).click();
  await expect(newest.getByTestId('undo-preview')).toHaveText(
    'This undo changes: Jake: class 7 → 5, race 7 → 5',
  );
  await page.screenshot({ path: path.join(SHOTS, 'undo-preview-1366x768.png') });
  await newest.getByRole('button', { name: 'Keep' }).click();
  // The evolution: undoing it would put the G cap back and lose 900 XP.
  const evolution = log
    .getByRole('listitem')
    .filter({ hasText: /evolved into/ })
    .first();
  await evolution.getByRole('button', { name: 'Undo' }).click();
  await expect(evolution.getByTestId('undo-preview')).toContainText(
    "Can't undo this: Jake would lose 900 XP (class 7 → 4)",
  );
  await page.screenshot({ path: path.join(SHOTS, 'undo-refused-1366x768.png') });
  await evolution.getByRole('button', { name: 'Confirm undo' }).click();
  await expect(log.getByRole('alert')).toContainText('Jake would lose 900 XP (class 7 → 4)');
  await expect(evolution).not.toContainText('(undone)');
});
