import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MQ.14 Bonus rules (DESIGN §4): items give flat bonuses only (a percentage
// item is refused), and the total item bonus on a stat is capped at 20% of
// its base; the owner's status screen shows the capped bonus as capped.

const GM_KEY = 'e2e-gm-key-mq14-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MQ.14');
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

/** Runs one GM command over the GM page's own origin. */
async function gmCommand(gm: Page, command: Record<string, unknown>): Promise<string> {
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
  return result;
}

test('item bonuses are flat and capped at 20% of base; the status screen says so', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Bonus Rules');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByLabel('Name', { exact: true }).fill('Ada');
  await gm.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('cell', { name: 'Ada', exact: true })).toBeVisible();

  // A percentage on an item is refused.
  expect(
    await gmCommand(gm, {
      type: 'item.define',
      id: 'haste',
      name: 'Ring of Haste',
      rarity: 'rare',
      slot: 'ring',
      bonuses: [{ stat: 'agility', flat: 1, percent: 0.1 }],
    }),
  ).toContain('flat stat bonuses only');
  for (const item of [
    { id: 'band', name: 'Iron Band', slot: 'ring', flat: 3 },
    { id: 'charm', name: 'Bone Charm', slot: 'necklace', flat: 1 },
  ]) {
    expect(
      await gmCommand(gm, {
        type: 'item.define',
        id: item.id,
        name: item.name,
        rarity: 'common',
        slot: item.slot,
        bonuses: [{ stat: 'vitality', flat: item.flat }],
      }),
    ).toBe('ok');
  }
  const ada = (await gm
    .locator('[data-testid^="party-name-"]')
    .first()
    .getAttribute('data-testid'))!.replace('party-name-', '');
  expect(
    await gmCommand(gm, {
      type: 'gift.give',
      characterId: null,
      to: ada,
      items: { band: 1, charm: 1 },
    }),
  ).toBe('ok');

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    const player = await browser.newPage({ viewport });
    const errors = watchErrors(player);
    await player.goto(server.url);
    await player.getByRole('link', { name: /Ada/ }).click();
    const inv = player.getByTestId('inventory');
    const vit = player.getByTestId('stat-vitality');
    if (viewport.width === 1366) {
      // The charm alone (+0.1) is within the cap (20% of 1.0 = 0.2).
      await inv.getByRole('button', { name: 'Equip Bone Charm' }).click();
      await expect(player.getByTestId('bonus-vitality')).toHaveText(' (+0.1)');
      await expect(player.getByTestId('capped-vitality')).toHaveCount(0);
      // The band (+0.3) takes the total to +0.4: only +0.2 counts.
      await inv.getByRole('button', { name: 'Equip Iron Band' }).click();
    }
    await expect(vit.locator('strong')).toHaveText('1.2');
    await expect(player.getByTestId('bonus-vitality')).toHaveText(' (+0.2, capped)');
    await expect(player.getByTestId('bonus-vitality')).toHaveAttribute('title', /capped/);
    await expect(player.getByTestId('pool-hp')).toContainText('/120');
    await vit.scrollIntoViewIfNeeded();
    await player.screenshot({
      path: path.join(shots, `player-capped-${viewport.width}x${viewport.height}.png`),
    });
    if (viewport.width === 390) {
      // Unequipping the band lifts the cap mark.
      await inv.getByRole('button', { name: 'Unequip Iron Band' }).click();
      await expect(player.getByTestId('bonus-vitality')).toHaveText(' (+0.1)');
      await expect(player.getByTestId('pool-hp')).toContainText('/110');
    }
    expect(errors).toEqual([]);
    await player.close();
  }
  expect(gmErrors).toEqual([]);
});
