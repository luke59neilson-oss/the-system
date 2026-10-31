import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { usePreMeRules } from './helpers/preMeRules';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.4 Free points: a player spreads points, reviews, confirms; assigned
// points lock (DESIGN §4, D38) and the stats update live. Since MV.1 the panel
// covers every unassigned point (any amount at once; MV.1.spec.ts).

const GM_KEY = 'e2e-gm-key-m34-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.4');
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

/** Runs one GM command over the GM page's own origin (no console form for it yet). */
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

const focusedText = (page: Page) =>
  page.evaluate(
    () =>
      (globalThis as unknown as { document: { activeElement: { textContent: string } | null } })
        .document.activeElement?.textContent ?? '',
  );

async function award(gm: Page, amount: number) {
  const form = gm.locator('form[aria-labelledby="award-xp"]');
  await openWindow(gm, 'award-xp');
  await gm.getByLabel('Amount').fill(String(amount));
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(form.getByRole('status').or(form.getByRole('alert'))).toHaveText(
    /^Awarded [\d,]+ (class|profession) XP to /,
  );
}

test('a player assigns a free-point batch, which then locks', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Points Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await openWindow(gm, 'create-character');
  await gm.getByLabel('Name', { exact: true }).fill('Jake');
  await gm.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  // The batch mechanics with the numbers of a campaign created before ME
  // (2 free points per race level; ME.1.spec covers the new budgets).
  await usePreMeRules(gm, GM_KEY);
  // Two race levels: two batches of 2 points.
  await award(gm, 200);

  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(laptop);
  await laptop.goto(server.url);
  await laptop.getByRole('link', { name: /Jake/ }).click();
  await expect(laptop.getByTestId('free-points')).toHaveText('4');
  const agility = laptop.getByTestId('stat-agility');
  const agilityBefore = (await agility.locator('strong').innerText()).trim();

  // Keyboard: Enter on [Assign] lands on the panel heading.
  await laptop.getByRole('button', { name: '[Assign]' }).focus();
  await laptop.keyboard.press('Enter');
  const panel = laptop.getByTestId('assign');
  await expect(panel.getByTestId('assign-total')).toHaveText(
    '4 points to assign from 2 level-ups. Spend any number; the rest wait for later.',
  );
  await expect.poll(() => focusedText(laptop)).toBe('Assign free points');
  await expect(laptop.getByTestId('points-left')).toHaveText('Points left: 4');
  const review = panel.getByRole('button', { name: 'Review' });
  await expect(review).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Remove a point from Agility' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Add a point to Agility' }).click();
  await panel.getByRole('button', { name: 'Add a point to Perception' }).click();
  await expect(laptop.getByTestId('points-left')).toHaveText('Points left: 2');
  // A point can be taken back.
  await panel.getByRole('button', { name: 'Remove a point from Perception' }).click();
  await panel.getByRole('button', { name: 'Add a point to Agility' }).click();
  await expect(panel.getByTestId('assign-agility')).toContainText('(+2)');
  await laptop.screenshot({ path: path.join(shots, 'player-assign-1366x768.png'), fullPage: true });
  await review.click();
  await expect(laptop.getByTestId('assign-review')).toHaveText(
    'Assign +2 Agility? Assigned points lock; only the GM can change them. 2 points stay unassigned for later.',
  );
  await expect.poll(() => focusedText(laptop)).toBe('Confirm');
  await panel.scrollIntoViewIfNeeded();
  await laptop.screenshot({ path: path.join(shots, 'player-review-1366x768.png') });
  await panel.getByRole('button', { name: 'Back' }).click();
  await expect.poll(() => focusedText(laptop)).toBe('Review');
  await review.click();
  await panel.getByRole('button', { name: 'Confirm' }).click();

  // Locked: the stat rose live, the batch is listed as assigned.
  await expect(panel).toHaveCount(0);
  await expect(laptop.getByTestId('assign-notice')).toHaveCount(0);
  await expect(laptop.getByTestId('free-points')).toHaveText('2');
  await expect.poll(() => focusedText(laptop)).toBe('[Assign]');
  await expect(agility.locator('strong')).not.toHaveText(agilityBefore);
  const locked = laptop.getByTestId('locked-points');
  await locked.getByText('Assigned points (locked)').click();
  await expect(locked).toContainText('Race level 1: +2 Agility');

  // Cancel leaves the rest alone.
  await laptop.getByRole('button', { name: '[Assign]' }).click();
  await expect(panel.getByTestId('assign-total')).toContainText('2 points to assign.');
  await panel.getByRole('button', { name: 'Add a point to Willpower' }).click();
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).toHaveCount(0);
  await expect(laptop.getByTestId('free-points')).toHaveText('2');

  // A reload keeps the lock; the second batch goes to Perception.
  await laptop.reload();
  await expect(laptop.getByTestId('free-points')).toHaveText('2');
  await laptop.getByRole('button', { name: '[Assign]' }).click();
  await panel.getByRole('button', { name: 'Add a point to Perception' }).click();
  await panel.getByRole('button', { name: 'Add a point to Perception' }).click();
  await panel.getByRole('button', { name: 'Review' }).click();
  await panel.getByRole('button', { name: 'Confirm' }).click();
  await expect(laptop.getByTestId('free-points')).toHaveText('0');
  await expect(laptop.getByRole('button', { name: '[Assign]' })).toHaveCount(0);
  await locked.getByText('Assigned points (locked)').click();
  await expect(locked).toContainText('Race level 2: +2 Perception');
  await laptop.screenshot({ path: path.join(shots, 'player-1366x768.png') });

  // A new batch. The GM's View-as pane never offers [Assign].
  await award(gm, 100);
  await expect(laptop.getByTestId('free-points')).toHaveText('2');
  const pane = await browser.newPage({ viewport: { width: 340, height: 600 } });
  await pane.goto(`${laptop.url()}?pane=1`);
  await expect(pane.getByTestId('free-points')).toHaveText('2');
  await expect(pane.getByRole('button', { name: '[Assign]' })).toHaveCount(0);
  await pane.close();

  // Phone: 390 wide, no sideways scroll. The GM assigns the last points while
  // the panel is open: it closes with a notice.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(laptop.url());
  await expect(phone.getByTestId('free-points')).toHaveText('2');
  await phone.getByRole('button', { name: '[Assign]' }).click();
  const phonePanel = phone.getByTestId('assign');
  await expect(phonePanel.getByTestId('assign-total')).toContainText('2 points to assign.');
  await phonePanel.getByRole('button', { name: 'Add a point to Strength' }).click();
  await phonePanel.getByRole('button', { name: 'Add a point to Endurance' }).click();
  const width = await phone.locator('html').evaluate((el) => el.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await phone.screenshot({ path: path.join(shots, 'player-assign-390x844.png'), fullPage: true });
  const characterId = new URL(laptop.url()).pathname.split('/').at(-1);
  await gmCommand(gm, {
    type: 'freePoints.override',
    characterId,
    raceLevel: 3,
    allocation: { vitality: 2 },
  });
  await expect(phonePanel).toHaveCount(0);
  await expect(phone.getByTestId('assign-notice')).toHaveText(
    'Your free points were changed by the GM; your draft was discarded.',
  );
  await expect(phone.getByTestId('free-points')).toHaveText('0');
  await expect(laptop.getByTestId('free-points')).toHaveText('0');
  await phone.getByText('Assigned points (locked)').click();
  await expect(phone.getByTestId('locked-points')).toContainText('Race level 3: +2 Vitality');

  expect(errors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
