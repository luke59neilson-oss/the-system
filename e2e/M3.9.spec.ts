import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.9 Identify: choose a known entity and read the tier text the
// character's own Identify rarity unlocks. The demo trains Casper's Identify to
// Uncommon, so he reads "[Fever]" where Miranda (Common) reads
// "[Malignant Miasma]"; the Drum is known to nobody until the GM reveals it.

const GM_KEY = 'e2e-gm-key-m39-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.9');
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

/** GM-only text from the demo: GM names, deeper tiers and the unrevealed Drum. */
const GM_ONLY = ['immune', 'Immune', 'The Host’s Response', 'whale’s heart'];
/** The Drum's tier: nobody may receive it before the GM reveals it. */
const DRUM_TIER = 'Heart of the World';

test('players Identify known entities at their own tier, live', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Identify Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(laptop);
  const casperFrames = watchFrames(laptop);
  await laptop.goto(server.url);
  await laptop.getByRole('link', { name: /Casper/ }).click();
  const panel = laptop.getByTestId('identify');
  const targets = panel.getByRole('group', { name: 'Choose what to Identify' });
  await expect(targets.getByRole('button')).toHaveText(['The black miasma', 'Pale hunter']);
  await expect(panel.getByTestId('identify-text')).toHaveCount(0);
  await targets.getByRole('button', { name: 'The black miasma' }).click();
  await expect(targets.getByRole('button', { name: 'The black miasma' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(panel.getByTestId('identify-text')).toHaveText(/^\[Fever\]\s+The world runs hotter/);
  await panel.scrollIntoViewIfNeeded();
  await laptop.screenshot({ path: path.join(shots, 'player-identify-1366x768.png') });
  await targets.getByRole('button', { name: 'Pale hunter' }).click();
  await expect(panel.getByTestId('identify-text')).toContainText('It does not hunt for food.');

  // Miranda (Identify Common) knows only the miasma, and reads the first tier.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  const mirandaFrames = watchFrames(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Miranda/ }).click();
  const phonePanel = phone.getByTestId('identify');
  await expect(phonePanel.getByTestId('identify-target')).toHaveText(['The black miasma']);
  await phonePanel.getByRole('button', { name: 'The black miasma' }).click();
  await expect(phonePanel.getByTestId('identify-text')).toHaveText(
    /^\[Malignant Miasma\]\s+A corrupting energy/,
  );
  // One column: Identify sits after the inventory and before the notifications.
  const order = await phone.evaluate(() => {
    const d = (
      globalThis as unknown as {
        document: {
          querySelector: (s: string) => { getBoundingClientRect: () => { top: number } } | null;
        };
      }
    ).document;
    const top = (s: string) => d.querySelector(s)?.getBoundingClientRect().top ?? -1;
    return [
      top('[data-testid=inventory]'),
      top('[data-testid=identify]'),
      top('[data-testid=history]'),
    ];
  });
  expect(order[0]).toBeLessThan(order[1] ?? 0);
  expect(order[1]).toBeLessThan(order[2] ?? 0);
  await phonePanel.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'player-identify-390x844.png') });

  // Live: the GM reveals the Drum to Miranda only and rewrites a tier.
  const beforeReveal = mirandaFrames.length;
  await gmCommand(gm, {
    type: 'entity.reveal',
    entityId: 'demo-drum',
    characterIds: ['demo-miranda'],
  });
  await expect(phonePanel.getByTestId('identify-target')).toHaveText([
    'The black miasma',
    'The Drum',
  ]);
  await expect(targets.getByRole('button')).toHaveCount(2);
  await gmCommand(gm, {
    type: 'entity.edit',
    entityId: 'demo-curse',
    label: 'Black fog',
    tiers: [
      { minRarity: 'common', text: '[Malignant Miasma]' },
      { minRarity: 'uncommon', text: '[Fever]\nIt is getting warmer.' },
    ],
  });
  await expect(phonePanel.getByTestId('identify-text')).toHaveText('[Malignant Miasma]');
  await expect(phonePanel.getByRole('button', { name: 'Black fog' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await targets.getByRole('button', { name: 'Black fog' }).click();
  await expect(panel.getByTestId('identify-text')).toContainText('It is getting warmer.');

  // No player frame ever carried GM-only text; Miranda never got Casper's tier or hunter.
  for (const frame of [...casperFrames, ...mirandaFrames]) {
    for (const secret of GM_ONLY) expect(frame).not.toContain(secret);
  }
  for (const frame of mirandaFrames) {
    expect(frame).not.toContain('[Fever]');
    expect(frame).not.toContain('Pale hunter');
  }
  for (const frame of [...casperFrames, ...mirandaFrames.slice(0, beforeReveal)]) {
    expect(frame).not.toContain(DRUM_TIER);
  }
  for (const frame of casperFrames) expect(frame).not.toContain('The Drum');
  expect(casperFrames.length).toBeGreaterThan(0);

  expect(errors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
