import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.6 Skill selection: a pending badge on the sheet, the offered skills side
// by side, pick, review, confirm (DESIGN §6). Uses the demo's open menus (D70).

const GM_KEY = 'e2e-gm-key-m36-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.6');
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

test('a player chooses a skill from the offered menu', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Selection Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  // Jake (D, level 52) has his level 50 menu open.
  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(laptop);
  await laptop.goto(server.url);
  await laptop.getByRole('link', { name: /Jake/ }).click();
  await expect(laptop.getByTestId('class')).toHaveText('[Tempest Warden – lvl 52]');
  await expect(laptop.getByTestId('selection-badge')).toHaveText('1 waiting');
  const skillsBefore = await laptop.getByTestId('skills-class').getByTestId('skill').count();
  await laptop.screenshot({ path: path.join(shots, 'player-badge-1366x768.png') });

  // Keyboard: Enter on [Choose] opens the dialog on its heading.
  await laptop.getByRole('button', { name: '[Choose]' }).focus();
  await laptop.keyboard.press('Enter');
  const dialog = laptop.getByRole('dialog', { name: 'Skill selection' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => focusedText(laptop)).toBe('Skill selection');
  await expect(dialog.getByTestId('selection-level')).toHaveText(
    'Class level 50: choose one of 3 skills',
  );
  const offers = dialog.getByTestId('offer');
  await expect(offers).toHaveCount(3);
  // Side by side on a laptop: one row, left to right.
  const boxes = await offers.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y };
    }),
  );
  expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1);
  expect(boxes.map((b) => b.x)).toEqual([...boxes.map((b) => b.x)].sort((a, b) => a - b));
  // Each card shows its rarity-coloured name, kind, rarity and text (the
  // demo offers Epic, Epic and a Rare profession skill at D-grade).
  await expect(offers.first()).toContainText('(Epic)]');
  await expect(offers.first()).toContainText('Class skill · Epic');
  await expect(offers.first()).toContainText('A System skill.');
  await expect(offers.first()).toHaveClass(/rarity-epic/u);
  await expect(offers.nth(2)).toContainText('Profession skill · Rare');
  const names = (await offers.locator('h4').allInnerTexts()).map((t) =>
    t.replace(/^\[(.*) \([^)]*\)\]$/u, '$1'),
  );
  await laptop.screenshot({ path: path.join(shots, 'player-offers-1366x768.png') });

  // Pick the second, go Back (focus returns to it), then take the first.
  await dialog.getByRole('button', { name: `Choose ${names[1]}` }).click();
  await expect(dialog.getByTestId('selection-review')).toContainText(
    `Take [${names[1]} (Epic)]? The choice is final; the other options will be gone.`,
  );
  await expect.poll(() => focusedText(laptop)).toBe('Confirm');
  await dialog.getByRole('button', { name: 'Back' }).click();
  await expect(offers).toHaveCount(3);
  await expect.poll(() => focusedText(laptop)).toBe('Choose');
  await dialog.getByRole('button', { name: `Choose ${names[0]}` }).click();
  await laptop.screenshot({ path: path.join(shots, 'player-review-1366x768.png') });
  await dialog.getByRole('button', { name: 'Confirm' }).click();

  // Granted: the dialog and badge are gone, the skill is on the sheet and focused.
  await expect(dialog).toHaveCount(0);
  await expect(laptop.getByTestId('selection-badge')).toHaveCount(0);
  await expect(laptop.getByRole('button', { name: '[Choose]' })).toHaveCount(0);
  await expect(laptop.getByTestId('skills-class').getByTestId('skill')).toHaveCount(
    skillsBefore + 1,
  );
  await expect(laptop.getByTestId('skills-class')).toContainText(`[${names[0]} (Epic)]`);
  await expect.poll(() => focusedText(laptop)).toBe(`[${names[0]} (Epic)]`);
  await expect(laptop.getByTestId('selection-notice')).toHaveCount(0);
  // It stays chosen after a reload.
  await laptop.reload();
  await expect(laptop.getByTestId('skills-class')).toContainText(`[${names[0]} (Epic)]`);
  await expect(laptop.getByTestId('selection-badge')).toHaveCount(0);

  // Miranda (E, level 22) on a phone. The GM's View-as pane shows the badge
  // but never offers [Choose].
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Miranda/ }).click();
  await expect(phone.getByTestId('selection-badge')).toHaveText('1 waiting');
  const pane = await browser.newPage({ viewport: { width: 340, height: 600 } });
  await pane.goto(`${phone.url()}?pane=1`);
  await expect(pane.getByTestId('selection-badge')).toHaveText('1 waiting');
  await expect(pane.getByRole('button', { name: '[Choose]' })).toHaveCount(0);
  await pane.close();

  await phone.getByRole('button', { name: '[Choose]' }).click();
  const phoneDialog = phone.getByRole('dialog', { name: 'Skill selection' });
  await expect(phoneDialog.getByTestId('selection-level')).toHaveText(
    'Class level 20: choose one of 3 skills',
  );
  // Escape leaves the choice for later.
  await phone.keyboard.press('Escape');
  await expect(phoneDialog).toHaveCount(0);
  await expect(phone.getByTestId('selection-badge')).toHaveText('1 waiting');
  await expect.poll(() => focusedText(phone)).toBe('[Choose]');

  // The GM re-offers the menu while it is open: it closes with a notice
  // instead of switching menus under the player's thumb.
  await phone.getByRole('button', { name: '[Choose]' }).click();
  await expect(phoneDialog.getByTestId('offer')).toHaveCount(3);
  const characterId = new URL(phone.url()).pathname.split('/').at(-1);
  await gmCommand(gm, {
    type: 'selection.offer',
    characterId,
    level: 20,
    options: [
      { name: 'Gale Step', rarity: 'epic', description: 'Step on the wind for a moment.' },
      { name: 'Thunder Hook', rarity: 'rare', description: 'A barbed bolt that drags.' },
      { name: 'Rain Sense', rarity: 'uncommon' },
      { name: 'Hearth Ward', rarity: 'rare', kind: 'profession' },
    ],
  });
  await expect(phoneDialog).toHaveCount(0);
  await expect(phone.getByTestId('selection-notice')).toHaveText(
    'The GM changed the level 20 skill menu; open it again to see the new options.',
  );

  // The new menu: four cards stacked in one column, no sideways scroll.
  await phone.getByRole('button', { name: '[Choose]' }).click();
  await expect(phone.getByTestId('selection-notice')).toHaveCount(0);
  const phoneOffers = phoneDialog.getByTestId('offer');
  await expect(phoneOffers).toHaveCount(4);
  await expect(phoneOffers.nth(3)).toContainText('Profession skill · Rare');
  await expect(phoneOffers.nth(2)).toContainText('No description.');
  const xs = await phoneOffers.evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().x)),
  );
  expect(new Set(xs).size).toBe(1);
  const width = await phone.locator('html').evaluate((el) => el.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await phone.screenshot({ path: path.join(shots, 'player-offers-390x844.png') });
  await phoneDialog.getByRole('button', { name: 'Choose Gale Step' }).click();
  await phone.screenshot({ path: path.join(shots, 'player-review-390x844.png') });
  await phoneDialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(phoneDialog).toHaveCount(0);
  await expect(phone.getByTestId('skills-class')).toContainText('[Gale Step (Epic)]');
  await expect(phone.getByTestId('selection-badge')).toHaveCount(0);
  await phone.screenshot({ path: path.join(shots, 'player-390x844.png'), fullPage: true });

  expect(errors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
