import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// ML.1 (DESIGN §9a "Campaigns home", L28): the GM app starts on a list of
// campaigns with nothing open; Delete asks for the name and moves a campaign
// to Deleted campaigns (Restore puts it back); phones wait for the GM to open
// one, then join as before.

const GM_KEY = 'e2e-gm-key-ml1-0123456789abcdef01';
const shots = path.resolve(import.meta.dirname, '../docs/screens/ML.1');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY }, { home: true });
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

/** New campaign on the home; the console opens on it, named. */
async function newCampaign(gm: Page, name: string) {
  const form = gm.locator('form.home-new');
  await form.getByLabel('Campaign name').fill(name);
  await form.getByRole('button', { name: 'Create campaign' }).click();
  await expect(gm.getByTestId('connection')).toHaveText('Connected');
  await expect(gm.getByTestId('close-campaign')).toBeVisible();
  // The console names the new campaign once joined (no second form).
  await expect(gm.locator('form[aria-labelledby="new-campaign"]')).toHaveCount(0);
}

async function closeCampaign(gm: Page) {
  await gm.getByTestId('close-campaign').click();
  await expect(gm.getByRole('heading', { name: 'Campaigns', exact: true })).toBeVisible();
}

test('create two, delete one, restore it, open the other; a phone waits, then joins', async ({
  browser,
}) => {
  // Two campaigns, a character, delete, restore and two phone hand-overs.
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);

  // Nothing is open at start: the home, and a waiting phone.
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await expect(gm.getByRole('heading', { name: 'Campaigns', exact: true })).toBeVisible();
  await expect(gm.getByText('No campaigns yet. Start one below.')).toBeVisible();
  await phone.goto(server.url);
  await expect(phone.getByTestId('waiting-campaign')).toHaveText(
    'Waiting for the GM to open a campaign',
  );
  await phone.screenshot({ path: path.join(shots, 'phone-waiting-390.png') });

  // Two campaigns, the second with a character.
  await newCampaign(gm, 'Tutorial Floor');
  await closeCampaign(gm);
  await newCampaign(gm, 'Second Run');
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(create.getByRole('status')).toHaveText('Character created');
  await closeCampaign(gm);

  const tutorial = gm.getByTestId('campaign-tutorial-floor');
  const second = gm.getByTestId('campaign-second-run');
  await expect(tutorial).toContainText('Tutorial Floor');
  await expect(tutorial).toContainText('No characters yet');
  await expect(tutorial).toContainText('Last opened');
  await expect(second).toContainText('Jake');
  await gm.screenshot({ path: path.join(shots, 'home-1366.png') });

  // Delete asks for the name; a wrong name keeps the button off.
  await tutorial.getByRole('button', { name: 'Delete' }).click();
  const confirm = tutorial.getByTestId('delete-confirm');
  await expect(confirm).toBeFocused();
  await confirm.fill('tutorial');
  await expect(tutorial.getByRole('button', { name: 'Delete campaign' })).toBeDisabled();
  await confirm.fill('Tutorial Floor');
  await gm.screenshot({ path: path.join(shots, 'delete-confirm-1366.png') });
  await tutorial.getByRole('button', { name: 'Delete campaign' }).click();
  await expect(gm.getByRole('status')).toContainText('moved to Deleted campaigns');
  await expect(tutorial).toHaveCount(0);
  const deleted = gm.getByTestId('deleted-campaigns');
  await expect(deleted).toContainText('Tutorial Floor');
  await gm.screenshot({ path: path.join(shots, 'deleted-list-1366.png') });

  // Restore puts it back on the list.
  await deleted.getByTestId('undelete-tutorial-floor').click();
  await expect(gm.getByTestId('campaign-tutorial-floor')).toBeVisible();
  await expect(gm.getByTestId('deleted-campaigns')).toHaveCount(0);

  // Open the other; the waiting phone now lists its character and joins.
  await second.getByRole('button', { name: 'Open' }).click();
  await expect(gm.getByTestId('connection')).toHaveText('Connected');
  await expect(gm.getByTestId('close-campaign')).toBeVisible();
  await expect(phone.getByTestId('waiting-campaign')).toHaveCount(0, { timeout: 10_000 });
  await phone.getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await expect(phone.getByTestId('name')).toHaveText('Jake');

  // An open campaign cannot be deleted from here: the GM closes it first.
  const status = await gm.evaluate(
    async (key) =>
      (
        await fetch('/api/gm/campaigns/second-run/delete', {
          method: 'POST',
          headers: { 'x-gm-key': key },
        })
      ).status,
    GM_KEY,
  );
  expect(status).toBe(409);

  // Closing sends the phone back to waiting.
  await closeCampaign(gm);
  await expect(phone.getByTestId('waiting-campaign')).toBeVisible({ timeout: 10_000 });

  // The one expected error: the browser logs the refused delete's 409 above.
  expect(errors.filter((e) => !/status of 409/.test(e))).toEqual([]);
  expect(phoneErrors).toEqual([]);
});
