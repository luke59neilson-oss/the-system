import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M4.6 XP award dialog (DESIGN §5): even split with editable shares and a
// balancing last share, target grade and above-level bonus, a preview of
// level-ups, overflow and lost XP, the typical-session helper, confirm.

const GM_KEY = 'e2e-gm-key-m46-0123456789abcdef46';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M4.6');
let dataDir: string;
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-m46-'));
  server = await startBuiltServer({ GM_KEY }, { dataDir });
});

test.afterEach(async () => {
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

function watch(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('the GM previews and awards XP with a custom split', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watch(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('XP Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim', 'Ada']) {
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  const ids = await gm
    .locator('[data-testid^="party-name-"]')
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid')!.slice('party-name-'.length)),
    );
  const [jake, kim, ada] = ids as [string, string, string];

  const award = gm.getByRole('form', { name: 'Award class XP' });
  // The typical-session helper fills the amount for the three G-grade characters.
  await expect(award.getByTestId('typical-session')).toContainText('G-grade 600 XP each');
  await award.getByRole('button', { name: 'Use for 3' }).click();
  await expect(award.getByLabel('Amount')).toHaveValue('1800');

  // Even split of 1,000: 334 / 333 / 333, each to class level 3 or 4 with XP lost past the top.
  await award.getByLabel('Amount').fill('1000');
  await expect(award.getByTestId(`share-${jake}`)).toHaveText(' · 334 XP');
  await expect(award.getByTestId(`share-${ada}`)).toHaveText(' · 333 XP');
  await expect(award.getByTestId(`levels-${jake}`)).toHaveText(' · class lvl 0 → 3');

  // By hand: Jake 500, Kim 100, Ada balances to 400.
  await award.getByRole('checkbox', { name: 'Set shares by hand' }).check();
  await award.getByLabel('Jake’s share').fill('500');
  await award.getByLabel('Kim’s share').fill('100');
  await expect(award.getByLabel('Ada’s share (balances)')).toHaveValue('400');
  await expect(award.getByTestId(`share-${ada}`)).toHaveText(' · 400 XP');
  await expect(award.getByTestId(`lost-${jake}`)).toHaveText(' · 100 lost');
  await expect(award.getByTestId(`levels-${jake}`)).toHaveText(' · class lvl 0 → 4');
  await expect(award.getByTestId(`levels-${kim}`)).toHaveText(' · class lvl 0 → 1');
  await expect(award.getByTestId('xp-lost')).toContainText('100 XP will be lost');

  // Too much typed: refused before sending.
  await award.getByLabel('Kim’s share').fill('600');
  await expect(award.getByRole('alert')).toHaveText('The shares add up to more than 1000 XP');
  await expect(award.getByRole('button', { name: 'Award XP' })).toBeDisabled();
  await award.getByLabel('Kim’s share').fill('100');

  // A target one grade below would give a third; set and then clear it.
  await award.getByLabel('Target’s grade').selectOption({ label: 'G-grade' });
  await expect(award.getByTestId(`gained-${jake}`)).toHaveCount(0);
  await award.getByLabel('Target’s grade').selectOption({ label: 'Not set (full XP)' });
  // The above-level bonus: a level 3 target gives +30% to level-0 characters.
  await award.getByRole('checkbox', { name: 'Above-level bonus' }).check();
  await award.getByLabel('Target’s level').fill('3');
  await expect(award.getByTestId(`gained-${kim}`)).toHaveText(' · gains 130');
  await award.getByLabel('Reason (GM only)').fill('The Rake Canyons ambush');
  await award.screenshot({ path: path.join(shots, 'xp-award-1366x768.png') });

  await award.getByRole('button', { name: 'Award XP' }).click();
  await expect(award.getByRole('status')).toHaveText('XP awarded');
  await expect(gm.getByTestId(`class-level-${jake}`)).toHaveText('4');
  await expect(gm.getByTestId(`class-level-${kim}`)).toHaveText('1');
  await expect(gm.getByTestId(`class-level-${ada}`)).toHaveText('4');

  // The stored event carries the hand-set shares and the target's level.
  const awarded = readFileSync(path.join(dataDir, 'campaigns', 'main', 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { type: string; payload: Record<string, unknown> })
    .filter((e) => e.type === 'xp.awarded');
  expect(awarded).toHaveLength(1);
  expect(awarded[0]!.payload).toMatchObject({
    track: 'class',
    amount: 1000,
    enemyLevel: 3,
    shares: [
      { characterId: jake, share: 500 },
      { characterId: kim, share: 100 },
      { characterId: ada, share: 400 },
    ],
    reason: 'The Rake Canyons ambush',
  });

  // The profession track: no profession yet, so a capped class takes nothing and it is lost.
  await award.getByLabel('Track').selectOption('profession');
  await expect(gm.getByRole('form', { name: 'Award profession XP' })).toBeVisible();
  await gm.screenshot({ path: path.join(shots, 'gm-1366x768.png'), fullPage: true });
  await gm.setViewportSize({ width: 390, height: 844 });
  await gm
    .getByRole('form', { name: 'Award profession XP' })
    .screenshot({ path: path.join(shots, 'xp-award-390x844.png') });
  expect(errors).toEqual([]);
});
