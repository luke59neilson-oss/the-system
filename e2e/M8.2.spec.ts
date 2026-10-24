import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Browser } from '@playwright/test';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M8.2 evolution transition: when a character evolves, the whole player
// screen re-themes to the new grade's metal with a short animated sweep
// (frames pulse, the status ring sweeps once); reduced motion swaps the
// theme at once with nothing moving. Undo never plays it (unit test).

// The e2e tsconfig has no DOM lib; this browser global runs inside evaluate().
declare const getComputedStyle: (
  el: unknown,
  pseudo?: string,
) => { animationName: string; transitionDuration: string };

const GM_KEY = 'e2e-gm-key-m82-0123456789abcdef82';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M8.2');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

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

async function setUp(browser: Browser) {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Evolution transition');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  return gm;
}

/** Sultan (G) reaches the top of G and the GM releases one path. */
async function release(gm: Page, player: Page) {
  await gmCommand(gm, {
    type: 'xp.award',
    amount: 2000,
    track: 'class',
    participants: [{ characterId: 'demo-sultan' }],
  });
  const skill =
    (await player
      .getByTestId('skills-class')
      .getByTestId('skill')
      .first()
      .locator('button')
      .getAttribute('data-skill')) ?? '';
  expect(skill).not.toBe('');
  await gmCommand(gm, {
    type: 'evolution.release',
    characterId: 'demo-sultan',
    options: [
      {
        className: 'Longbow Adept',
        transforms: [{ skill, name: 'Long Draw', rarity: 'common' }],
      },
    ],
  });
}

async function evolve(player: Page) {
  await player.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
  const dialog = player.getByTestId('evolution');
  await dialog.getByRole('button', { name: 'Choose Longbow Adept' }).click();
  await dialog.getByRole('button', { name: 'Evolve' }).click();
  await expect(dialog).toHaveCount(0);
}

const statusAnimation = (page: Page) =>
  page.getByTestId('status').evaluate((el) => getComputedStyle(el, '::before').animationName);
const partyAnimation = (page: Page) =>
  page.getByTestId('party').evaluate((el) => getComputedStyle(el).animationName);

test('evolving re-themes the player screen with an animated sweep', async ({ browser }) => {
  const gm = await setUp(browser);
  const player = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await player.goto(`${server.url}/play/demo-sultan`);
  await expect(player.getByTestId('connection')).toHaveText('Connected');
  const grid = player.getByTestId('player-grid');
  await expect(grid).toHaveClass(/theme-aluminum/);
  await expect(grid).not.toHaveClass(/evolving/);
  expect(await statusAnimation(player)).toBe('none');

  // A level-up alone (no new grade) never plays the transition.
  await release(gm, player);
  await expect(player.getByTestId('evolution-pending')).toBeVisible();
  await expect(grid).not.toHaveClass(/evolving/);

  // The player evolves: the new metal arrives with the sweep.
  await evolve(player);
  await expect(grid).toHaveClass(/theme-bronze/);
  await expect(grid).toHaveClass(/evolving/);
  await expect(player.getByTestId('status')).toHaveClass(/theme-bronze/);
  expect(await statusAnimation(player)).toBe('evolve-ring');
  expect(await partyAnimation(player)).toBe('evolve-frame');
  await player.screenshot({ path: path.join(shots, 'player-evolving-1366x768.png') });

  // It plays once, then the screen settles in the new metal.
  await expect(grid).not.toHaveClass(/evolving/, { timeout: 5_000 });
  await expect(grid).toHaveClass(/theme-bronze/);
  expect(await statusAnimation(player)).toBe('none');
  await player.screenshot({ path: path.join(shots, 'player-evolved-1366x768.png') });
});

test('with reduced motion the new metal applies at once', async ({ browser }) => {
  const gm = await setUp(browser);
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  await phone.goto(`${server.url}/play/demo-sultan`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await release(gm, phone);
  await evolve(phone);
  const grid = phone.getByTestId('player-grid');
  await expect(grid).toHaveClass(/theme-bronze/);
  // The transition is playing (the class is on), yet nothing moves.
  await expect(grid).toHaveClass(/evolving/);
  expect(await statusAnimation(phone)).toBe('none');
  expect(await partyAnimation(phone)).toBe('none');
  expect(
    await phone.getByTestId('party').evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe('0s');
  await expect(grid).toHaveClass(/evolving/);
  await phone.screenshot({ path: path.join(shots, 'player-evolved-390x844.png') });
});
