import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M4.7 System broadcast: a System-style message to one, several or all, now
// or scheduled for a later in-game day. A scheduled message stays GM-only
// until the day counter reaches it.

const GM_KEY = 'e2e-gm-key-m47-0123456789abcdef47';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M4.7');
const SECRET = 'The pale hunters gather beneath the Crown.';
let dataDir: string;
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-m47-'));
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

test('the GM sends to several now and schedules messages for later days', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watch(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Broadcast Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const name of ['Jake', 'Kim', 'Ada']) {
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  const idOf = async (name: string) => {
    const ids = await gm
      .locator('[data-testid^="party-name-"]')
      .evaluateAll((els) =>
        els.map((e) => [e.textContent, e.getAttribute('data-testid')!.slice('party-name-'.length)]),
      );
    return ids.find(([n]) => n?.includes(name))![1]!;
  };
  const kimId = await idOf('Kim');
  const jakeId = await idOf('Jake');

  // Kim's player screen, recording every frame the server sends it.
  const kim = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const kimErrors = watch(kim);
  const frames: string[] = [];
  kim.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await kim.goto(`${server.url}/play/${kimId}`);
  await expect(kim.getByRole('heading', { name: 'System messages' })).toBeVisible();

  const form = gm.locator('form[aria-labelledby="broadcast"]');
  // Now, to several: Kim and Ada.
  await form.getByLabel('Message').fill('You hear the Host breathe.');
  await form.getByLabel('Recipients').selectOption('several');
  await expect(form.getByRole('button', { name: 'Send broadcast' })).toBeDisabled();
  await form.getByRole('checkbox', { name: 'Kim' }).check();
  await form.getByRole('checkbox', { name: 'Ada' }).check();
  await form.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(form.getByRole('status')).toHaveText('Broadcast sent');
  await expect(kim.getByTestId('messages')).toContainText('You hear the Host breathe.');

  // Scheduled: Kim on day 2, everyone on day 3, Jake on day 4 (then cancelled).
  await form.getByLabel('When').selectOption('day');
  await expect(form.getByText('Today is day 1.')).toBeVisible();
  await form.getByRole('spinbutton', { name: 'Send on day' }).fill('1');
  await expect(form.getByRole('alert')).toContainText('Pick a whole day after day 1');
  await expect(form.getByRole('button', { name: 'Schedule broadcast' })).toBeDisabled();
  await form.getByLabel('Message').fill(SECRET);
  await form.getByLabel('Recipients').selectOption({ label: 'Kim' });
  await form.getByRole('spinbutton', { name: 'Send on day' }).fill('2');
  await form.getByRole('button', { name: 'Schedule broadcast' }).click();
  await expect(form.getByRole('status')).toHaveText('Scheduled for day 2');
  await form.getByLabel('Message').fill('Day 3 dawns over the Host.');
  await form.getByLabel('Recipients').selectOption({ label: 'Everyone' });
  await form.getByRole('spinbutton', { name: 'Send on day' }).fill('3');
  await form.getByRole('button', { name: 'Schedule broadcast' }).click();
  await expect(form.getByRole('status')).toHaveText('Scheduled for day 3');
  await form.getByLabel('Message').fill('Never sent.');
  await form.getByLabel('Recipients').selectOption({ label: 'Jake' });
  await form.getByRole('spinbutton', { name: 'Send on day' }).fill('4');
  await form.getByRole('button', { name: 'Schedule broadcast' }).click();
  const list = form.getByRole('region', { name: 'Scheduled (GM only until sent)' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list.getByRole('listitem').first()).toContainText('Day 2 · to Kim:');
  await form.screenshot({ path: path.join(shots, 'gm-broadcast-1366x768.png') });
  await list.getByRole('button', { name: 'Cancel the day 4 broadcast to Jake' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);

  // Nothing about the schedule has reached Kim's browser.
  await kim.waitForTimeout(300);
  expect(frames.join('\n')).not.toContain(SECRET);
  await expect(kim.getByTestId('messages')).not.toContainText(SECRET);

  // Day 2: Kim gets her message; Jake's screen never does.
  const day = gm.getByRole('form', { name: 'In-game day' });
  await expect(day.getByTestId('due-broadcasts')).toHaveText(
    'Sends 1 scheduled System message (see System broadcast).',
  );
  await day.getByRole('button', { name: /Advance/ }).click();
  await expect(gm.getByTestId('day')).toHaveText('2');
  await expect(
    gm.locator('section[aria-labelledby="session-heading"]').getByRole('status'),
  ).toHaveText('It is now day 2; 1 scheduled System message sent');
  await expect(kim.getByTestId('messages')).toContainText(SECRET);
  await expect(list.getByRole('listitem')).toHaveCount(1);
  const jake = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await jake.goto(`${server.url}/play/${jakeId}`);
  await expect(jake.getByRole('heading', { name: 'System messages' })).toBeVisible();
  await expect(jake.locator('section[aria-labelledby="messages"]')).not.toContainText(SECRET);

  // Day 3: the message for everyone arrives on both screens; the list empties.
  await day.getByRole('button', { name: /Advance/ }).click();
  await expect(gm.getByTestId('day')).toHaveText('3');
  await expect(kim.getByTestId('messages')).toContainText('Day 3 dawns over the Host.');
  await expect(jake.getByTestId('messages')).toContainText('Day 3 dawns over the Host.');
  await expect(jake.getByTestId('messages')).not.toContainText('Never sent.');
  await expect(form.getByRole('region', { name: 'Scheduled (GM only until sent)' })).toHaveCount(0);
  await kim.locator('section[aria-labelledby="messages"]').scrollIntoViewIfNeeded();
  await kim.screenshot({ path: path.join(shots, 'player-messages-390x844.png') });
  await gm.screenshot({ path: path.join(shots, 'gm-1366x768.png'), fullPage: true });

  expect(errors).toEqual([]);
  expect(kimErrors).toEqual([]);
});
