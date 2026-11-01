import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.74: in a d20 campaign a stat with an item bonus keeps its "[+N]" modifier
// on the value's line, on a phone and at table width.

const GM_KEY = 'e2e-gm-key-qf74-0123456789abcdef0002';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.74');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

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

test('a stat with an item bonus keeps its d20 modifier beside its value', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Dice');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  await openWindow(gm, 'rules-settings');
  await gm.getByTestId('rules-rolls').getByRole('combobox').selectOption('d20');
  await expect(gm.locator('section[aria-labelledby="rules-settings"]')).toContainText(
    'Rolls: d20 + modifier.',
  );

  for (const [width, height, name] of [
    [390, 844, 'player-stat-bonus-390x844.png'],
    [1366, 768, 'player-stat-bonus-1366x768.png'],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(server.url);
    const link = page.getByRole('link', { name: /Jake/ });
    const href = (await link.getAttribute('href')) ?? '';
    const id = decodeURIComponent(href.split('/').filter(Boolean).pop() ?? '');
    if (width === 390) {
      await gmCommand(gm, {
        type: 'item.define',
        id: 'ring',
        name: 'Ring of Haste',
        rarity: 'uncommon',
        slot: 'ring',
        bonuses: [{ stat: 'agility', flat: 3 }],
      });
      await gmCommand(gm, { type: 'holdings.adjust', characterId: id, items: { ring: 1 } });
      await gmCommand(gm, { type: 'item.equip', characterId: id, itemId: 'ring', slot: 'ring' });
    }
    await link.click();
    await expect(page.getByTestId('bonus-agility')).toBeVisible();
    const mod = page.getByTestId('mod-agility');
    await expect(mod).toBeVisible();
    const value = page.getByTestId('stat-agility').locator('strong');
    const valueBox = (await value.boundingBox())!;
    const modBox = (await mod.boundingBox())!;
    // Same line, and the modifier right after the value.
    expect(
      Math.abs(modBox.y + modBox.height / 2 - (valueBox.y + valueBox.height / 2)),
    ).toBeLessThan(valueBox.height / 2);
    expect(modBox.x).toBeGreaterThanOrEqual(valueBox.x + valueBox.width);
    await page.getByTestId('stat-agility').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, name) });
  }
});
