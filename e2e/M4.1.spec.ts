import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M4.1 Skill library: the GM creates and edits library skills (rarity, tags,
// description, flavour, effects); a character who gains a skill by that name
// gets its System text, including the starting race skill Identify. Effects
// text never reaches a player (D90).

const GM_KEY = 'e2e-gm-key-m41-0123456789abcdef';
const SECRET = 'GM-ONLY-EFFECTS-CANARY-41';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M4.1');
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

/** Every WebSocket frame a page receives, as text. */
function watchFrames(page: Page) {
  const frames: string[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => frames.push(String(f.payload)));
  });
  return frames;
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const d = (
      globalThis as unknown as {
        document: { documentElement: { scrollWidth: number; clientWidth: number } };
      }
    ).document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the GM builds the skill library; granted skills take its text', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Library Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();

  const library = gm.locator('section[aria-labelledby="skill-library"]');
  await expect(library.getByText('No skills yet.')).toBeVisible();
  const add = library.getByRole('button', { name: 'Add to library' });
  await expect(add).toBeDisabled();

  // Identify, the starting race skill.
  await library.getByLabel('Official name').fill('Identify');
  await library.getByLabel('Rarity').selectOption({ label: 'Common' });
  await library.getByLabel('Tags (comma-separated)').fill('Race, Utility, race');
  await library.getByLabel('Description (players see this)').fill('Learn what something is.');
  await library.getByLabel('Flavour (players see this)').fill('Knowledge is the first weapon.');
  await library.getByLabel('Effects (GM only)').fill(`${SECRET}: reveals tier text.`);
  await add.click();
  await expect(library.getByRole('status')).toHaveText('[Identify] added to the library');
  await expect(library.getByLabel('Official name')).toHaveValue('');

  // A second skill; the reserved rarity is not offered.
  await expect(library.getByLabel('Rarity').locator('option', { hasText: 'Divine' })).toHaveCount(
    0,
  );
  await library.getByLabel('Official name').fill('Arcane Bolt');
  await library.getByLabel('Rarity').selectOption({ label: 'Rare' });
  await library.getByLabel('Tags (comma-separated)').fill('Ranged, Mana');
  await add.click();
  await expect(library.getByRole('status')).toHaveText('[Arcane Bolt] added to the library');

  const list = library.getByRole('list', { name: 'Library skills' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  const identifyItem = list.getByRole('button', { name: /\[Identify\]/ });
  await expect(identifyItem).toContainText('(Common)');
  await expect(identifyItem.locator('.tag')).toHaveText(['Race', 'Utility']);

  // A clashing name is refused with a readable error.
  await library.getByLabel('Official name').fill('identify');
  await add.click();
  await expect(library.getByRole('alert')).toContainText('already has [Identify]');

  // Search by tag, rarity name and nothing.
  const search = library.getByLabel('Search');
  await search.fill('mana');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('[Arcane Bolt]');
  await search.fill('common');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('[Identify]');
  await search.fill('zzz');
  await expect(library.getByText('No skill matches “zzz”.')).toBeVisible();
  await search.fill('');

  // Edit: the form loads the entry; Save is off until something changes.
  await identifyItem.click();
  await expect(identifyItem).toHaveAttribute('aria-current', 'true');
  await expect(library.getByRole('heading', { name: 'Edit [Identify]' })).toBeVisible();
  await expect(library.getByLabel('Official name')).toHaveValue('Identify');
  await expect(library.getByLabel('Tags (comma-separated)')).toHaveValue('Race, Utility');
  const save = library.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeDisabled();
  await library.getByLabel('Flavour (players see this)').fill('Know thy prey.');
  await save.click();
  await expect(library.getByRole('status')).toHaveText('[Identify] saved');
  await expect(save).toBeDisabled();
  await library.scrollIntoViewIfNeeded();
  await noSidewaysScroll(gm);
  await gm.screenshot({ path: path.join(shots, 'gm-library-1366x768.png'), fullPage: true });

  // New character: Identify arrives with the library's text.
  await gm.getByLabel('Name', { exact: true }).fill('Jake');
  await gm.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('cell', { name: 'Jake', exact: true })).toBeVisible();

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    const player = await browser.newPage({ viewport });
    const errors = watchErrors(player);
    const frames = watchFrames(player);
    await player.goto(server.url);
    await player.getByRole('link', { name: /Jake/ }).click();
    await player.getByRole('button', { name: /\[Identify \(Common\)\]/ }).click();
    const detail = player.getByTestId('skill-detail');
    await expect(detail.getByTestId('skill-detail-description')).toHaveText(
      'Learn what something is.',
    );
    await expect(detail.getByTestId('skill-detail-flavor')).toHaveText('Know thy prey.');
    await noSidewaysScroll(player);
    await player.screenshot({
      path: path.join(shots, `player-identify-${viewport.width}x${viewport.height}.png`),
    });
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.join('\n')).not.toContain(SECRET);
    expect(frames.join('\n')).not.toContain('Arcane Bolt');
    expect(await player.content()).not.toContain(SECRET);
    expect(errors).toEqual([]);
    await player.close();
  }

  // Later library edits leave granted skills alone.
  await identifyItem.click();
  await library.getByLabel('Description (players see this)').fill('Rewritten later.');
  await library.getByRole('button', { name: 'Save changes' }).click();
  await expect(library.getByRole('status')).toHaveText('[Identify] saved');
  const check = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await check.goto(server.url);
  await check.getByRole('link', { name: /Jake/ }).click();
  await check.getByRole('button', { name: /\[Identify \(Common\)\]/ }).click();
  await expect(check.getByTestId('skill-detail-description')).toHaveText(
    'Learn what something is.',
  );
  await check.close();

  expect(gmErrors).toEqual([]);
});
