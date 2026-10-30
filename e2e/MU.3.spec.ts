import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MU.3 (DESIGN §5 "XP award box"): each participant's grade, levels, XP now
// and per level, XP to the next level, and what the typed award is worth.

const GM_KEY = 'e2e-gm-key-mu3-0123456789abcdef0003';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MU.3');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

function watch(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('the award box shows each player’s level, XP and what the award is worth', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watch(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('XP context');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  const ids = await gm
    .locator('[data-testid^="party-name-"]')
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid')!.slice('party-name-'.length)),
    );
  const [jake, kim] = ids as [string, string];

  for (const tab of ['session', 'progression'] as const) {
    await openTab(gm, tab);
    const award = gm.getByRole('form', { name: 'Award class XP' });
    await expect(award.getByTestId(`context-${jake}`)).toContainText(
      'G-grade · Class 0 · 0/100 XP, 100 to next',
    );
    await award.getByLabel('Amount').fill('300');
    // 150 each: one and a half levels.
    await expect(award.getByTestId(`worth-${jake}`)).toHaveText(' · ≈ 1.5 levels');
    await expect(award.getByTestId(`worth-${kim}`)).toHaveText(' · ≈ 1.5 levels');
    await gm.screenshot({ path: path.join(shots, `gm-award-${tab}-1366x768.png`) });
  }

  // Uneven shares by hand (review): 50 for Jake leaves 250 for Kim.
  const award = gm.getByRole('form', { name: 'Award class XP' });
  await award.getByLabel('Set shares by hand').check();
  await award.getByLabel('Jake’s share', { exact: true }).fill('50');
  await expect(award.getByTestId(`share-${kim}`)).toHaveText(' · 250 XP');
  await expect(award.getByTestId(`worth-${jake}`)).toHaveText(' · ≈ 0.5 levels');
  await expect(award.getByTestId(`worth-${kim}`)).toHaveText(' · ≈ 2.5 levels');
  // A share too small to show reads as such.
  await award.getByLabel('Jake’s share', { exact: true }).fill('4');
  await expect(award.getByTestId(`worth-${jake}`)).toHaveText(' · ≈ under 0.1 levels');
  expect(errors).toEqual([]);
});
