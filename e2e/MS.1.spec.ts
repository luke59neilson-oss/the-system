import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';
import { openWindow } from './helpers/gmTabs';

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

  const createCharacter = async (name: string) => {
    await page.getByLabel('Name', { exact: true }).fill(name);
    await expect(page.getByLabel('Starting class').locator('option:checked')).toHaveText('Archer');
    await page.getByRole('button', { name: 'Create character' }).click();
  };
  for (const name of ['Jake', 'Miranda']) {
    await createCharacter(name);
    await expect(page.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  // Bad input is refused with the engine's reason, without the event id.
  await createCharacter('   ');
  await expect(page.getByRole('alert')).toHaveText('Name: must not be blank');
  await createCharacter('Casper');
  await expect(page.getByText('Character created')).toBeVisible();
  await expect(page.getByTestId(/^party-class-/).filter({ hasText: /^Archer$/ })).toHaveCount(3);

  const characters = (await (await fetch(`${server.url}/api/characters`)).json()) as {
    id: string;
    name: string;
  }[];
  const idOf = (name: string) => characters.find((c) => c.name === name)?.id ?? '';
  const wsUrl = `ws://${new URL(server.url).host}/ws`;
  const player = await page.context().newPage();
  await player.goto(server.url);
  /** Joins as a player over a real socket; resolves with the first broadcast and the latest view. */
  const listen = (id: string, wantBroadcast: boolean) =>
    player.evaluate(
      ({ id, wsUrl, wantBroadcast }) =>
        new Promise<{ broadcast: string | null; messages: string[] }>((resolve, reject) => {
          const ws = new WebSocket(wsUrl);
          const timer = setTimeout(() => reject(new Error(`nothing for ${id}`)), 10_000);
          let broadcast: string | null = null;
          ws.onmessage = (event) => {
            const m = JSON.parse(String(event.data)) as {
              type: string;
              items?: { notification: { kind: string; text?: string } }[];
              view?: { messages: { text: string }[] };
            };
            if (m.type === 'hello')
              ws.send(JSON.stringify({ type: 'join', role: 'player', characterId: id }));
            const hit = m.items?.find((i) => i.notification.kind === 'broadcast');
            if (hit?.notification.text) broadcast = hit.notification.text;
            if (m.view && (!wantBroadcast || broadcast !== null)) {
              clearTimeout(timer);
              ws.close();
              resolve({ broadcast, messages: m.view.messages.map((x) => x.text) });
            }
          };
        }),
      { id, wsUrl, wantBroadcast },
    );
  const live = listen(idOf('Jake'), true);

  // Even split preview, then the award levels every character live.
  await openWindow(page, 'award-xp');
  await page.getByLabel('Amount').fill('301');
  await expect(page.getByTestId(/^share-/)).toHaveText([' · 101 XP', ' · 100 XP', ' · 100 XP']);
  await page.getByLabel('Reason (GM only)').fill('Pale hunter pack');
  await page.getByRole('button', { name: 'Award XP' }).click();
  await expect(page.getByText('XP awarded')).toBeVisible();
  for (const c of characters) await expect(page.getByTestId(`class-level-${c.id}`)).toHaveText('1');
  await expect(page.getByText("*'DING!' Class: [Archer] has reached level 1")).toHaveCount(3);

  const all = 'The world is dying. Find what is killing it.';
  await page.getByLabel('Message').fill(all);
  await page.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(page.getByText('Broadcast sent')).toBeVisible();
  // One feed row for a broadcast to everyone.
  const feed = page.locator('[data-window="feed"]');
  await expect(feed.getByRole('listitem').filter({ hasText: all })).toHaveText(`Everyone ${all}`);
  expect((await live).broadcast).toBe(all);

  // A whisper to Jake reaches Jake only, and stays in his view after reconnecting.
  await page.getByLabel('Message').fill('You feel watched.');
  await page.getByLabel('Recipients').selectOption({ label: 'Jake' });
  await page.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(feed.getByRole('listitem').filter({ hasText: 'You feel watched.' })).toHaveText(
    'Jake You feel watched.',
  );
  expect((await listen(idOf('Jake'), false)).messages).toEqual([all, 'You feel watched.']);
  expect((await listen(idOf('Miranda'), false)).messages).toEqual([all]);

  await page.getByLabel('Message').fill('Day 2 dawns over the Crown.');
  await page.getByLabel('Recipients').selectOption('all');
  await page.getByRole('button', { name: 'Send broadcast' }).click();
  await expect(page.getByText('Broadcast sent')).toBeVisible();
  await page.screenshot({ path: path.join(shots, 'gm-1366x768.png') });
  await page.screenshot({ path: path.join(shots, 'gm-1366-full.png'), fullPage: true });
  await player.close();
  expect(errors).toEqual([]);
});
