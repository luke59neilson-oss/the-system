import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MQ.A review fix: the GM's XP form says what an award would lose before it is
// confirmed (DESIGN §2, MQ.11: "the GM's XP preview says so").

const GM_KEY = 'e2e-gm-key-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MQ.A');
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterAll(async () => {
  await server.stop();
});

test('the XP form warns when an award passes the grade top and would be lost', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${server.url}/gm#key=${GM_KEY}`);
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  await page.getByLabel('Campaign name').fill('Overflow check');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Jake');
  await page.getByRole('button', { name: 'Create character' }).click();
  await expect(page.getByRole('cell', { name: 'Jake', exact: true })).toBeVisible();

  const characters = (await (await fetch(`${server.url}/api/characters`)).json()) as {
    id: string;
  }[];
  const id = characters[0]?.id ?? '';

  // 400 XP takes a fresh G-grade character to level 4, the grade top: nothing lost.
  await page.getByLabel('Amount').fill('400');
  await expect(page.getByTestId(`share-${id}`)).toHaveText(' · 400 XP');
  await expect(page.getByTestId(`lost-${id}`)).toHaveCount(0);
  await expect(page.getByTestId('xp-lost')).toHaveCount(0);

  // 450: no profession to take the rest, so 50 is lost and the GM sees it first.
  await page.getByLabel('Amount').fill('450');
  await expect(page.getByTestId(`lost-${id}`)).toHaveText(' · 50 lost');
  await expect(page.getByTestId('xp-lost')).toContainText('50 XP will be lost');
  await page
    .getByRole('form', { name: 'Award class XP' })
    .screenshot({ path: path.join(shots, 'xp-lost-1366.png') });
  await page.getByRole('button', { name: 'Award XP' }).click();
  await expect(page.getByText('XP awarded')).toBeVisible();
  await expect(page.getByTestId(`class-level-${id}`)).toHaveText('4');

  // At the top, every further award is lost in full.
  await page.getByLabel('Amount').fill('10');
  await expect(page.getByTestId(`lost-${id}`)).toHaveText(' · 10 lost');
});
