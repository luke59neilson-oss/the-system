import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M5.2 evolution builder (DESIGN §2, §6; in progress): options with a
// one-time bonus, re-rating per skill, checked by the engine, released.

const GM_KEY = 'e2e-gm-key-m52-0123456789abcdef52';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M5.2');
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

test('the GM builds and releases an evolution with re-rating', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Evolve');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  const builder = gm.locator('section[aria-labelledby="evolution-builder"]');
  await expect(builder.getByTestId('no-evolution')).toBeVisible();

  // Sultan (G, level 0) reaches the top of G: the F evolution is available.
  await gmCommand(gm, {
    type: 'xp.award',
    track: 'class',
    amount: 4 * 100,
    participants: [{ characterId: 'demo-sultan' }],
  });
  await expect(builder.getByLabel('Character')).toHaveValue('demo-sultan');
  const form = builder.getByRole('form', { name: 'Evolution release' });
  const option = form.getByRole('group', { name: 'Option 1' });
  await option.getByLabel('Class name').fill('Storm Hunter');
  await option.getByLabel('Bonus to all stats').fill('2');
  await expect(
    form.getByRole('list', { name: 'Re-rating' }).getByRole('listitem').first(),
  ).toBeVisible();
  await builder.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-evolution-1366x768.png') });
  await form.getByRole('button', { name: 'Release evolution' }).click();
  await expect(builder.getByRole('status')).toHaveText('Evolution released to Sultan');
  expect(errors).toEqual([]);
});
