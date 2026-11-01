import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MV.2 XP shares by percent (DESIGN §5 "Shares are percentages", L25): even
// whole percentages to start, a typed one changes nothing else, a running
// total, Award only at exactly 100, Even split resets.

const GM_KEY = 'e2e-gm-key-mv2-0123456789abcdef02';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MV.2');
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterAll(async () => {
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

test('1,000 XP to four at 40/20/20/20 lands 400/200/200/200', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watch(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Percent Shares');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const names = ['Jake', 'Kim', 'Ada', 'Bo'];
  for (const name of names) {
    await openWindow(gm, 'create-character');
    await gm.getByLabel('Name', { exact: true }).fill(name);
    await gm.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  const ids = await gm
    .locator('[data-testid^="party-name-"]')
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid')!.slice('party-name-'.length)),
    );
  const [jake, kim, ada, bo] = ids as [string, string, string, string];

  await openWindow(gm, 'award-xp');
  const award = gm.getByRole('form', { name: 'Award class XP' });
  const pct = (name: string) => award.getByLabel(`${name}’s %`, { exact: true });
  const total = award.getByTestId('pct-total');
  const submit = award.getByRole('button', { name: 'Award XP' });
  await award.getByLabel('Amount').fill('1000');
  // Even to start: 25 each.
  for (const name of names) await expect(pct(name)).toHaveValue('25');
  await expect(total).toContainText('Total 100%');
  await expect(award.getByRole('button', { name: 'Even split' })).toBeDisabled();

  // A typed percentage changes nothing else; the total says so and blocks Award.
  await pct('Jake').fill('40');
  await expect(pct('Kim')).toHaveValue('25');
  await expect(total).toContainText('Total 115%');
  await expect(award.getByRole('alert')).toHaveText('The percentages total 115%, not 100%');
  await expect(submit).toBeDisabled();
  await pct('Kim').fill('20');
  await pct('Ada').fill('20');
  await pct('Bo').fill('19');
  await expect(total).toContainText('Total 99%');
  await expect(submit).toBeDisabled();
  await pct('Bo').fill('21');
  await expect(total).toContainText('Total 101%');
  await expect(submit).toBeDisabled();

  // Even split resets every row.
  await award.getByRole('button', { name: 'Even split' }).click();
  for (const name of names) await expect(pct(name)).toHaveValue('25');

  // Leaving someone out re-evens the rest: 34/33/33, and says typed values were reset.
  await pct('Jake').fill('40');
  await award.getByRole('checkbox', { name: 'Bo', exact: true }).uncheck();
  await expect(award.getByTestId('pct-reset')).toHaveText(
    'Participants changed: typed percentages were reset to an even split.',
  );
  await expect(pct('Jake')).toHaveValue('34');
  await expect(pct('Kim')).toHaveValue('33');
  await expect(pct('Ada')).toHaveValue('33');
  // At the even percentages the XP splits exactly evenly (334/333/333), and retyping
  // a shown value does not move it (D296).
  await expect(award.getByTestId(`share-${jake}`)).toHaveText(' · 334 XP');
  await expect(award.getByTestId('pct-even-note')).toBeVisible();
  await pct('Jake').fill('34');
  await expect(award.getByTestId(`share-${jake}`)).toHaveText(' · 334 XP');
  await expect(award.getByTestId(`share-${kim}`)).toHaveText(' · 333 XP');
  await award.getByRole('checkbox', { name: 'Bo', exact: true }).check();

  await pct('Jake').fill('40');
  await expect(award.getByTestId('pct-reset')).toHaveCount(0);
  await pct('Kim').fill('20');
  await pct('Ada').fill('20');
  await pct('Bo').fill('20');
  await expect(total).toContainText('Total 100%');
  await expect(award.getByTestId(`share-${jake}`)).toHaveText(' · 400 XP');
  await expect(award.getByTestId(`share-${kim}`)).toHaveText(' · 200 XP');
  await expect(award.getByTestId(`share-${ada}`)).toHaveText(' · 200 XP');
  await expect(award.getByTestId(`share-${bo}`)).toHaveText(' · 200 XP');
  // MU.3's context stays on each row.
  await expect(award.getByTestId(`context-${jake}`)).toContainText('G-grade');
  await expect(submit).toBeEnabled();
  await award.screenshot({ path: path.join(shots, 'gm-award-percent-1366x768.png') });
  await submit.click();
  await expect(award.getByRole('status')).toHaveText(
    'Awarded 1,000 class XP to Jake (400), Kim (200), Ada (200) and Bo (200).',
  );
  // The form starts even again for the next award.
  await expect(pct('Jake')).toHaveValue('25');
  await openWindow(gm, 'party');
  await expect(gm.getByTestId(`class-level-${jake}`)).toHaveText('4');
  await expect(gm.getByTestId(`class-level-${kim}`)).toHaveText('2');
  await openWindow(gm, 'award-xp');
  await expect(pct('Jake')).toHaveValue('25');
  expect(errors).toEqual([]);
});
