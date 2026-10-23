import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MQ.8 Identify range (DESIGN §7): lower grade always, higher never, same
// grade up to 1.5 × the viewer's level; otherwise `[??? – lvl ???]`.

const GM_KEY = 'e2e-gm-key-mq8-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MQ.8');
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

/** Every WebSocket frame the page receives, as text. */
function watchFrames(page: Page) {
  const frames: string[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => frames.push(String(f.payload)));
  });
  return frames;
}

/** Runs one GM command over the GM page's own origin. */
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

test('Identify shows only targets within range', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Identify Range Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  // An E-grade beast lord: below Jake (D), above Casper (F).
  await gmCommand(gm, {
    type: 'entity.define',
    entityId: 'mq8-lord',
    name: 'SECRET Beast Lord of the Stormlung',
    label: 'Stormlung Beast Lord',
    tiers: [{ minRarity: 'common', text: 'TIER A storm-bred predator of the airways.' }],
    knownBy: ['demo-jake', 'demo-casper'],
    grade: 'E',
    level: 20,
  });

  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(laptop);
  await laptop.goto(server.url);
  await laptop.getByRole('link', { name: /Jake/ }).click();
  const jakeId = laptop.getByTestId('identify');
  await jakeId.getByRole('button', { name: 'Stormlung Beast Lord' }).click();
  await expect(jakeId.getByTestId('identify-header')).toHaveText(
    '[Stormlung Beast Lord (E) – lvl 20]',
  );
  await expect(jakeId.getByTestId('identify-text')).toHaveText(
    'TIER A storm-bred predator of the airways.',
  );
  await jakeId.scrollIntoViewIfNeeded();
  await laptop.screenshot({ path: path.join(shots, 'player-identify-in-range-1366x768.png') });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  const casperFrames = watchFrames(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Casper/ }).click();
  const casperId = phone.getByTestId('identify');
  await casperId.getByRole('button', { name: 'Stormlung Beast Lord' }).click();
  await expect(casperId.getByTestId('identify-header')).toHaveText('[??? – lvl ???]');
  await expect(casperId.getByTestId('identify-text')).toHaveCount(0);
  await casperId.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'player-identify-out-of-range-390x844.png') });

  // Same grade: Casper (F, race 7) sees an F up to level 10, not 11; live.
  await gmCommand(gm, { type: 'entity.edit', entityId: 'mq8-lord', grade: 'F', level: 10 });
  await expect(casperId.getByTestId('identify-header')).toHaveText(
    '[Stormlung Beast Lord (F) – lvl 10]',
  );
  await expect(casperId.getByTestId('identify-text')).toBeVisible();
  await gmCommand(gm, { type: 'entity.edit', entityId: 'mq8-lord', level: 11 });
  await expect(casperId.getByTestId('identify-header')).toHaveText('[??? – lvl ???]');
  await expect(casperId.getByTestId('identify-text')).toHaveCount(0);
  await expect(jakeId.getByTestId('identify-header')).toHaveText(
    '[Stormlung Beast Lord (F) – lvl 11]',
  );

  // Casper's frames never carried the tier text or the GM name while out of range,
  // and never the GM name at all.
  const firstShown = casperFrames.findIndex((f) => f.includes('TIER A storm-bred'));
  expect(firstShown).toBeGreaterThan(0);
  for (const f of casperFrames.slice(0, firstShown)) expect(f).not.toContain('TIER A');
  for (const f of casperFrames) expect(f).not.toContain('SECRET');
  expect(casperFrames.at(-1)).not.toContain('TIER A');

  expect(errors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
