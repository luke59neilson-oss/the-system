import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M5.1 offer builder (DESIGN §6): due selections with the capstone and
// ceiling, a menu checked against the engine before sending, passed-over
// options with Withdraw, and the character's practice log beside them.

const GM_KEY = 'e2e-gm-key-m51-0123456789abcdef51';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M5.1');
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

/** Runs one GM command over the GM page's own origin (XP award set-up only). */
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

test('the GM builds, checks and sends a menu, and withdraws a passed-over option', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Offers');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  const builder = gm.locator('section[aria-labelledby="offer-builder"]');
  await openWindow(gm, 'offer-builder');
  await builder.getByLabel('Character').selectOption({ label: 'Jake' });
  // Jake (D, level 52) has his level 50 menu open with the player.
  const due = builder.getByRole('list', { name: 'Due selections' }).getByRole('listitem');
  await expect(due).toHaveText([
    'Selection (lvl 50) · ceiling Ancient · menu sent, player choosing',
  ]);
  await expect(builder.getByTestId('pending-menu')).toContainText('Sending again replaces it');
  // His practice log sits beside the menu, with how often each skill came up.
  const practice = builder.getByRole('complementary', { name: 'Practice log' });
  await expect(practice.getByRole('listitem').first()).toBeVisible();
  await expect(practice.getByTestId('practice-counts')).toHaveText(
    'Used (whole log): Perception ×1',
  );
  const menuBox = await builder.getByRole('list', { name: 'Due selections' }).boundingBox();
  const sideBox = await practice.boundingBox();
  expect(sideBox!.x).toBeGreaterThan(menuBox!.x + menuBox!.width - 1);

  // Eight D levels: the level 60 selection comes due and is picked to build.
  await gmCommand(gm, {
    type: 'xp.award',
    track: 'class',
    amount: 8 * 2700,
    participants: [{ characterId: 'demo-jake' }],
  });
  await expect(due).toHaveText([
    'Selection (lvl 50) · ceiling Ancient · menu sent, player choosing',
    'Selection (lvl 60) · ceiling Ancient · build the menu',
  ]);
  await expect(due.nth(1).getByRole('radio')).toBeChecked();
  await expect(builder.getByTestId('pending-menu')).toHaveCount(0);

  const menu = builder.getByRole('form', { name: 'Selection menu' });
  const send = menu.getByRole('button', { name: 'Send menu' });
  const row = (n: number) => menu.getByRole('group', { name: `Option ${n}` });
  await expect(send).toBeDisabled();
  // Above the D-grade ceiling: the engine's own reason, and no sending.
  await row(1).getByLabel('Name').fill('Tempest Draw');
  await row(1).getByLabel('Rarity').selectOption({ label: 'Legendary' });
  await row(2).getByLabel('Name').fill('Thunder Volley');
  await row(2).getByLabel('Rarity').selectOption({ label: 'Epic' });
  await row(3).getByLabel('Name').fill('Tempest Draw');
  await expect(menu.getByTestId('offer-problem')).toContainText('above the D-grade ceiling');
  await expect(send).toBeDisabled();
  await row(1).getByLabel('Rarity').selectOption({ label: 'Ancient' });
  await expect(menu.getByTestId('offer-problem')).toContainText('on the menu twice');
  await row(3).getByLabel('Name').fill('Stormglass Arrow');
  await row(3).getByLabel('Description').fill('An arrow that carries the storm with it.');
  await expect(menu.getByTestId('offer-problem')).toHaveCount(0);
  // The menu size comes from the rules (3–4 by default).
  await menu.getByRole('button', { name: 'Add option' }).click();
  await expect(menu.getByRole('button', { name: 'Add option' })).toBeDisabled();
  await expect(send).toBeDisabled();
  await menu.getByRole('button', { name: 'Remove last' }).click();
  await expect(menu.getByRole('button', { name: 'Remove last' })).toBeDisabled();
  await builder.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-builder-1366x768.png') });
  await send.click();
  await expect(builder.getByRole('status')).toHaveText('Menu sent to Jake (lvl 60)');
  await expect(builder.getByTestId('pending-menu')).toContainText(
    '[Tempest Draw (Ancient)], [Thunder Volley (Epic)], [Stormglass Arrow (Inferior)]',
  );
  await expect(due.nth(1)).toHaveText(
    'Selection (lvl 60) · ceiling Ancient · menu sent, player choosing',
  );

  // Passed-over options from his earlier menus; withdraw one.
  const older = builder.locator('section[aria-labelledby="passed-over"]').getByRole('listitem');
  const before = await older.count();
  expect(before).toBeGreaterThan(1);
  const first = (await older.first().textContent()) ?? '';
  const name = /^\[(.+) \(/.exec(first)?.[1] ?? '';
  expect(name).not.toBe('');
  await older.first().getByRole('button', { name: 'Withdraw' }).click();
  await expect(builder.getByRole('status')).toHaveText(`[${name}] withdrawn`);
  await expect(older).toHaveCount(before - 1);
  await expect(older.filter({ hasText: `[${name} (` })).toHaveCount(0);
  await builder
    .locator('section[aria-labelledby="passed-over"]')
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-withdrawn-1366x768.png') });

  // Profession options only once a profession exists: Miranda (E, Cook) has
  // the Kind choice (Casper, with none, does not: the capstone test).
  // Each character and selection gets its own draft: nothing carries over.
  await builder.getByLabel('Character').selectOption({ label: 'Miranda' });
  const kind = menu.getByRole('group', { name: 'Option 1' }).getByLabel('Kind');
  await expect(kind).toBeVisible();
  await kind.selectOption('Profession');
  await row(1).getByLabel('Name').fill('Draft for Miranda');
  await builder.getByLabel('Character').selectOption({ label: 'Jake' });
  await expect(menu).toBeVisible();
  await expect(row(1).getByLabel('Name')).toHaveValue('');
  await builder.getByLabel('Character').selectOption({ label: 'Miranda' });
  await expect(row(1).getByLabel('Name')).toHaveValue('');
  await expect(kind).toHaveValue('class');

  // The player sees both open menus, the new options, and not the withdrawn one.
  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const playerErrors = watchErrors(laptop);
  await laptop.goto(server.url);
  await laptop.getByRole('link', { name: /Jake/ }).click();
  await expect(laptop.getByTestId('selection-badge')).toHaveText('2 waiting');
  await laptop.getByRole('button', { name: '[Choose]' }).click();
  const dialog = laptop.getByRole('dialog', { name: 'Skill selection' });
  await expect(dialog.getByTestId('offer').first()).toBeVisible();
  await expect(dialog).not.toContainText(`${name} (`);

  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});

test('the dashboard chip opens a capstone selection, which needs a ceiling option', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  gm.on('dialog', (d) => void d.accept());
  await gm.getByLabel('Campaign name').fill('Capstone');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  // Casper (F, level 7) gains three F levels: his level 10 capstone comes due.
  await gmCommand(gm, {
    type: 'xp.award',
    track: 'class',
    amount: 3 * 300,
    participants: [{ characterId: 'demo-casper' }],
  });
  const chip = gm
    .getByTestId('flags-demo-casper')
    .getByRole('button', { name: 'Capstone selection (lvl 10): build the menu' });
  await chip.click();

  // The chip opens the Progression tab itself.
  const builder = gm.locator('section[aria-labelledby="offer-builder"]');
  await expect(builder.getByLabel('Character')).toHaveValue('demo-casper');
  const due = builder.getByRole('list', { name: 'Due selections' }).getByRole('listitem');
  const capstone = due.filter({ hasText: 'Capstone selection (lvl 10)' });
  await expect(capstone).toHaveText('Capstone selection (lvl 10) · ceiling Rare · build the menu');
  await expect(capstone.getByRole('radio')).toBeChecked();
  await expect(builder.getByTestId('capstone-note')).toHaveText(
    'Capstone: the menu needs at least one Rare option.',
  );
  await expect(builder).toBeInViewport();

  const menu = builder.getByRole('form', { name: 'Selection menu' });
  const send = menu.getByRole('button', { name: 'Send menu' });
  const row = (n: number) => menu.getByRole('group', { name: `Option ${n}` });
  await expect(menu.getByLabel('Kind')).toHaveCount(0);
  await row(1).getByLabel('Name').fill('Gale Step');
  await row(1).getByLabel('Rarity').selectOption({ label: 'Uncommon' });
  await row(2).getByLabel('Name').fill('Rain of Needles');
  await row(2).getByLabel('Rarity').selectOption({ label: 'Common' });
  await row(3).getByLabel('Name').fill('Hunter’s Patience');
  await row(3).getByLabel('Rarity').selectOption({ label: 'Uncommon' });
  await expect(menu.getByTestId('offer-problem')).toHaveText(
    'Level 10 is the F-grade capstone: offer at least one rare option',
  );
  await expect(send).toBeDisabled();
  await row(2).getByLabel('Rarity').selectOption({ label: 'Rare' });
  await expect(menu.getByTestId('offer-problem')).toHaveCount(0);
  await builder.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-capstone-1366x768.png') });
  await send.click();
  await expect(builder.getByRole('status')).toHaveText('Menu sent to Casper (lvl 10)');
  await expect(capstone).toHaveText(
    'Capstone selection (lvl 10) · ceiling Rare · menu sent, player choosing',
  );
  // The dashboard chip now waits on the player.
  await expect(
    gm
      .getByTestId('flags-demo-casper')
      .getByRole('button', { name: 'Capstone selection (lvl 10): player choosing' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('a character with nothing due says so', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Quiet');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const builder = gm.locator('section[aria-labelledby="offer-builder"]');
  await openWindow(gm, 'offer-builder');
  await expect(builder).toContainText('No characters yet.');
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Kim');
  await create.getByRole('button', { name: 'Create character' }).click();
  await openWindow(gm, 'offer-builder');
  await expect(builder.getByTestId('no-due-selections')).toBeVisible();
  await expect(builder.getByRole('form', { name: 'Selection menu' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
