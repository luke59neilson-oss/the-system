import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MS.1 Minimal GM screen: create a character from a starter class, award XP
// with the even split, send a System broadcast.

const GM_KEY = 'e2e-gm-key-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MS.1');
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterAll(async () => {
  await server.stop();
});

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('without a key, or with a wrong one, the GM screen does not connect', async ({ page }) => {
  await page.goto(`${server.url}/gm`);
  await expect(page.getByRole('heading', { name: 'GM key needed' })).toBeVisible();
  await page.goto(`${server.url}/gm#key=wrong-key-0123456789`);
  await expect(page.getByText('GM key rejected')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
});

test('GM creates a campaign and characters, awards XP, and broadcasts', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`${server.url}/gm#key=${GM_KEY}`);
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  // The key leaves the address bar at once (never in history or bookmarks).
  expect(page.url()).not.toContain(GM_KEY);

  await page.getByLabel('Campaign name').fill('Tutorial: The Whale');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByRole('heading', { name: 'Tutorial: The Whale · Party' })).toBeVisible();

  for (const name of ['Jake', 'Miranda']) {
    await page.getByLabel('Name', { exact: true }).fill(name);
    await expect(page.getByLabel('Starting class')).toHaveValue('archer');
    await page.getByRole('button', { name: 'Create character' }).click();
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('cell', { name: '[Archer]' })).toHaveCount(2);

  // A player joins so we can see the broadcast arrive on a player socket.
  const characters = (await (await fetch(`${server.url}/api/characters`)).json()) as {
    id: string;
    name: string;
  }[];
  const jakeId = characters.find((c) => c.name === 'Jake')?.id ?? '';
  const player = await page.context().newPage();
  await player.goto(server.url);
  const received = player.evaluate(
    ({ id, wsUrl }) =>
      new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        const timer = setTimeout(() => reject(new Error('no broadcast')), 10_000);
        ws.onmessage = (event) => {
          const m = JSON.parse(String(event.data)) as {
            type: string;
            items?: { notification: { kind: string; text?: string } }[];
          };
          if (m.type === 'hello')
            ws.send(JSON.stringify({ type: 'join', role: 'player', characterId: id }));
          const hit = m.items?.find((i) => i.notification.kind === 'broadcast');
          if (hit?.notification.text) {
            clearTimeout(timer);
            resolve(hit.notification.text);
          }
        };
      }),
    { id: jakeId, wsUrl: `ws://${new URL(server.url).host}/ws` },
  );

  // Even split preview, then the award levels both characters live.
  await page.getByLabel('Amount').fill('301');
  await expect(page.getByTestId(/^share-/)).toHaveText([' · 151 XP', ' · 150 XP']);
  await page.getByLabel('Reason (GM only)').fill('Pale hunter pack');
  await page.getByRole('button', { name: 'Award XP' }).click();
  await expect(page.getByText('XP awarded')).toBeVisible();
  for (const c of characters) await expect(page.getByTestId(`class-level-${c.id}`)).toHaveText('1');
  await expect(page.getByText("*'DING!' Class: [Archer] has reached level 1")).toHaveCount(2);

  await page.getByLabel('Message').fill('The world is dying. Find what is killing it.');
  await page.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(page.getByText('Broadcast sent')).toBeVisible();
  await expect(page.getByText('The world is dying. Find what is killing it.')).toHaveCount(2);
  expect(await received).toBe('The world is dying. Find what is killing it.');

  // Bad input is refused with the engine's reason.
  await page.getByLabel('Name', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'Create character' }).click();
  await expect(page.getByRole('alert')).toContainText('must not be blank');

  await page.screenshot({ path: path.join(shots, 'gm-1366x768.png'), fullPage: true });
  await player.close();
  expect(errors).toEqual([]);
});
