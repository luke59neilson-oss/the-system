import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M7.4 trackers (DESIGN §7–§8, D184): the GM turns on the hunger tracker, sets
// and moves the party's hunger, renames the steps, adds regions and moves the
// party, and keeps survivor factions. The player sees their own hunger (only
// while the tracker is on) and the current region's name; the other
// character's hunger, region notes, unvisited regions and factions never
// reach them.

const GM_KEY = 'e2e-gm-key-m74-0123456789abcdef74';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M7.4');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
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

test('the GM keeps hunger, regions and factions; players see their own hunger and the region', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim']) {
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = watchErrors(page);
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  const status = page.getByTestId('status');
  await expect(status).not.toContainText('Hunger');

  const win = gm.locator('section[aria-labelledby="trackers"]');
  const hunger = win.getByRole('group', { name: 'Hunger' });
  await hunger.getByLabel('Use the hunger tracker in this campaign').click();
  await expect(win.getByRole('status')).toHaveText(
    'Hunger tracker on: players see their own hunger',
  );
  await expect(page.getByTestId('hunger')).toHaveText('Fed (1/5)');

  // Everyone one step hungrier, then Kim alone to Starving.
  await hunger.getByRole('button', { name: 'Everyone one step hungrier' }).click();
  await expect(win.getByRole('status')).toHaveText('Everyone is one step hungrier');
  await expect(page.getByTestId('hunger')).toHaveText('Peckish (2/5)');
  await hunger.getByLabel('Hunger of Kim').selectOption({ label: 'Starving' });
  await expect(win.getByRole('status')).toHaveText('Kim is Starving');
  await expect(hunger.getByRole('listitem').filter({ hasText: 'Kim' })).toContainText('5/5');
  await expect(page.getByTestId('hunger')).toHaveText('Peckish (2/5)');

  // Rename the steps; the player's label follows.
  await hunger
    .getByLabel('Steps, least hungry first (one per line)')
    .fill('Full\nPeckish\nRavenous');
  await hunger.getByRole('button', { name: 'Save steps' }).click();
  await expect(win.getByRole('status')).toHaveText('Hunger steps saved');
  await expect(page.getByTestId('hunger')).toHaveText('Peckish (2/3)');
  await expect(hunger.getByRole('listitem').filter({ hasText: 'Kim' })).toContainText('3/3');
  await hunger.getByLabel('Steps, least hungry first (one per line)').fill('Only');
  await expect(hunger.getByText('Give at least two hunger steps')).toBeVisible();
  await expect(hunger.getByRole('button', { name: 'Save steps' })).toBeDisabled();
  await hunger
    .getByLabel('Steps, least hungry first (one per line)')
    .fill('Full\nPeckish\nRavenous');

  // Regions: add two, move the party into the first.
  const regions = win.getByRole('group', { name: 'Regions' });
  const regionForm = regions.getByRole('form', { name: 'New region' });
  await regionForm.getByLabel('Region name').fill('The Crown');
  await regionForm.getByLabel('Region notes (GM only)').fill('SECRET spawn knolls');
  await regionForm.getByRole('button', { name: 'Add region' }).click();
  await expect(win.getByRole('status')).toHaveText('The Crown added');
  await regionForm.getByLabel('Region name').fill('SECRET The Drum');
  await regionForm.getByRole('button', { name: 'Add region' }).click();
  await expect(win.getByRole('status')).toHaveText('SECRET The Drum added');
  await regions.getByRole('button', { name: 'The party is in The Crown' }).click();
  await expect(regions.getByTestId('current-region')).toContainText('The party is in The Crown');
  await expect(page.getByTestId('region')).toHaveText(' · The Crown');

  // Factions: GM-only.
  const factions = win.getByRole('group', { name: 'Survivor factions (GM only)' });
  const factionForm = factions.getByRole('form', { name: 'New faction' });
  await factionForm.getByLabel('Faction name').fill('SECRET Canyon Watch');
  await factionForm.getByLabel('Based in').selectOption({ label: 'The Crown' });
  await factionForm.getByLabel('Survivors').fill('twelve');
  await expect(factions.getByText('Members must be a whole number (or blank)')).toBeVisible();
  await factionForm.getByLabel('Survivors').fill('12');
  await factionForm.getByLabel('Standing toward the party').fill('Wary');
  await factionForm.getByRole('button', { name: 'Add faction' }).click();
  await expect(win.getByRole('status')).toHaveText('SECRET Canyon Watch added');
  await expect(factions.getByRole('list', { name: 'Factions' })).toHaveText(
    'SECRET Canyon Watch Wary · 12 survivors · The Crown',
  );
  await factions.getByRole('button', { name: /Canyon Watch/ }).click();
  const editFaction = factions.getByRole('form', { name: 'Edit SECRET Canyon Watch' });
  await editFaction.getByLabel('Standing toward the party').fill('Friendly');
  await editFaction.getByRole('button', { name: 'Save faction' }).click();
  await expect(win.getByRole('status')).toHaveText('SECRET Canyon Watch saved');
  await expect(editFaction.getByRole('button', { name: 'Save faction' })).toBeDisabled();

  await win.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-trackers-1366x768.png') });
  await status.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, 'player-hunger-390x844.png') });
  await page.getByTestId('quests').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, 'player-region-390x844.png') });

  // Turning the tracker off hides it from the player again.
  await hunger.getByLabel('Use the hunger tracker in this campaign').click();
  await expect(win.getByRole('status')).toHaveText('Hunger tracker off: players no longer see it');
  await expect(page.getByTestId('hunger')).toHaveCount(0);

  for (const secret of ['SECRET', 'Ravenous', GM_KEY]) {
    expect(frames.filter((f) => f.includes(secret))).toEqual([]);
  }
  expect(pageErrors).toEqual([]);
  expect(errors).toEqual([]);
});
