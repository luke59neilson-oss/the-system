import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openTab, openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.56: the home dashboard and phones work at the table.
const GM_KEY = 'e2e-gm-key-qf56-0123456789abcdef56';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.56');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

test('the join address and QR show without scrolling at 1366x768', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Table');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  // The demo load reconnects the socket; the demo party proves it is back.
  await expect(
    gm.getByRole('navigation', { name: 'View as' }).getByRole('button', { name: 'Jake' }),
  ).toBeVisible();
  await expect(gm.getByTestId('connection')).toHaveText('Connected');
  const qr = gm.locator('.join-qr').first();
  await expect(qr).toBeVisible();
  const box = await qr.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height, 'QR bottom edge').toBeLessThanOrEqual(768);
  await expect(gm.getByTestId('join-url').first()).toBeInViewport();
  await gm.screenshot({ path: path.join(shots, 'home-1366x768.png') });
});

test('phone buttons are 44 px tap targets', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Table');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${server.url}/play/demo-jake`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await expect(phone.getByTestId('status')).toBeVisible();
  expect(await smallTargets(phone), 'tap targets under 44 px tall').toEqual([]);
  // The Assign panel's +/- buttons (a rule of their own) are targets too.
  const assign = phone.getByRole('button', { name: '[Assign]' });
  if (await assign.count()) {
    await assign.click();
    await expect(phone.locator('.assign-stats button').first()).toBeVisible();
    expect(await smallTargets(phone), 'Assign panel targets under 44 px').toEqual([]);
  }
  await phone.screenshot({ path: path.join(shots, 'player-390x844.png'), fullPage: true });
});

/** Visible buttons, fields, disclosure rows and button-like links under 44 px tall. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(
    `[...document.querySelectorAll(
      "button, select, input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), summary, a.tap-link"
    )]
      .filter((b) => b.checkVisibility() && b.getBoundingClientRect().height < 44)
      .map((b) => b.tagName + ' ' + (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 30) + ' ' + b.getBoundingClientRect().height)`,
  );
}

/** Runs one GM command over the GM page's own origin (set-up only). */
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

test('the card says at the grade’s top; the phone evolution shows the paths and keeps Evolve on screen', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Table');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  const card = gm.getByTestId('xp-demo-sultan');
  await expect(card).toContainText(' / ');
  await gmCommand(gm, {
    type: 'xp.award',
    track: 'class',
    amount: 4 * 100,
    participants: [{ characterId: 'demo-sultan' }],
  });
  // At G's top XP overflows (DESIGN §2): no "0 / 100" that reads as progress.
  await expect(card).toContainText('at the grade’s top');
  await expect(card).not.toContainText(' / ');

  const builder = gm.locator('section[aria-labelledby="evolution-builder"]');
  await openWindow(gm, 'evolution-builder');
  await expect(builder.getByLabel('Character')).toHaveValue('demo-sultan');
  await builder.getByLabel('Class only (one choice)').check();
  const form = builder.getByRole('form', { name: 'Evolution release' });
  await form.getByRole('group', { name: 'Option 1' }).getByLabel('Class name').fill('Far Shot');
  await form.getByLabel(/Approve this re-rating/).check();
  await form.getByRole('button', { name: 'Release evolution' }).click();
  await expect(builder.getByRole('status')).toHaveText('Evolution released to Sultan');

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${server.url}/play/demo-sultan`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await phone.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
  const dialog = phone.getByTestId('evolution');
  const choose = dialog.getByRole('button', { name: 'Choose Far Shot' });
  const rerate = dialog.getByTestId('evolution-rerate');
  await expect(rerate).toBeVisible();
  // The paths come before the re-rating list, and the first one is on screen.
  const pathsFirst = await choose.evaluate(
    (el, other) => Boolean(el.compareDocumentPosition(other!) & 4),
    await rerate.elementHandle(),
  );
  expect(pathsFirst, 'Choose comes before the re-rating list').toBe(true);
  await expect(choose).toBeInViewport();
  expect(await smallTargets(phone), 'evolution dialog targets under 44 px').toEqual([]);
  await phone.screenshot({ path: path.join(shots, 'evolution-paths-390x844.png') });
  await choose.click();
  const evolve = dialog.getByRole('button', { name: 'Evolve', exact: true });
  await expect(evolve).toBeInViewport();
  await phone.screenshot({ path: path.join(shots, 'evolution-review-390x844.png') });
  await evolve.click();
  await expect(dialog).toHaveCount(0);
  await expect(phone.getByTestId('race')).toContainText('(F)');
});

test('the XP award names the typical-session amount on its button', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Table');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  await openTab(gm, 'session');
  const award = gm.getByRole('form', { name: 'Award class XP' });
  const fill = award.getByRole('button', {
    name: /^Fill [\d,]+ XP \(typical session, \d+ players?\)$/,
  });
  await expect(fill.first()).toBeVisible();
  const label = (await fill.first().textContent()) ?? '';
  const amount = Number(/Fill ([\d,]+) XP/.exec(label)![1]!.replace(/,/g, ''));
  await fill.first().click();
  await expect(award.getByLabel('Amount')).toHaveValue(String(amount));
  await fill.first().scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'xp-award-1366x768.png') });
});
