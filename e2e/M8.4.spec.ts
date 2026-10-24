import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Browser } from '@playwright/test';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M8.4 sound: three original sounds made in code (DING, selection,
// evolution), a volume per browser, and Sound: off as the mute. Web Audio is
// replaced by a recorder, so the spec hears which notes play and how loud.

const GM_KEY = 'e2e-gm-key-m84-0123456789abcdef84';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M8.4');
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

interface Played {
  freq: number;
  wave: string;
  peak: number;
}

/** A page whose Web Audio records every note instead of playing it. */
async function listening(browser: Browser, id: string) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.addInitScript(() => {
    const w = globalThis as unknown as { played: Played[]; AudioContext: unknown };
    w.played = [];
    class Recorder {
      currentTime = 0;
      destination = {};
      resume() {
        return Promise.resolve();
      }
      createGain() {
        const note: { peak: number } = { peak: 0 };
        const gain = {
          setValueAtTime() {},
          exponentialRampToValueAtTime(v: number) {
            note.peak = Math.max(note.peak, v);
          },
        };
        return { gain, note, connect: (n: unknown) => n };
      }
      createOscillator() {
        const osc = {
          type: 'sine',
          frequency: { value: 0 },
          out: null as null | { note: { peak: number } },
          connect(n: { note: { peak: number } }) {
            osc.out = n;
            return n;
          },
          start() {
            w.played.push({
              freq: osc.frequency.value,
              wave: osc.type,
              peak: osc.out?.note.peak ?? 0,
            });
          },
          stop() {},
        };
        return osc;
      }
    }
    w.AudioContext = Recorder;
  });
  await page.goto(`${server.url}/play/${id}`);
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  return page;
}

const played = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { played: Played[] }).played);
const clear = (page: Page) =>
  page.evaluate(() => {
    (globalThis as unknown as { played: Played[] }).played = [];
  });

test('DING, selection and evolution each play their own sound at the chosen volume', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const gm = await setUp(browser);
  const player = await listening(browser, 'demo-sultan');

  // Off by default: a DING plays nothing.
  await gmCommand(gm, {
    type: 'xp.award',
    amount: 100,
    track: 'class',
    participants: [{ characterId: 'demo-sultan' }],
  });
  await expect(player.getByTestId('ding-toast')).toBeVisible();
  expect(await played(player)).toEqual([]);

  // Sound on shows the volume; it starts at 70 and is remembered.
  const sound = player.getByTestId('sound');
  await sound.click();
  const volume = player.getByTestId('volume');
  await expect(volume).toHaveValue('70');
  await volume.fill('50');
  await player.getByTestId('player-grid').scrollIntoViewIfNeeded();
  await player.screenshot({
    path: path.join(shots, 'volume-1366x768.png'),
    clip: { x: 0, y: 0, width: 1366, height: 120 },
  });
  await player.reload();
  await expect(player.getByTestId('connection')).toHaveText('Connected');
  await expect(player.getByTestId('volume')).toHaveValue('50');

  // Evolution: Sultan reaches the top of G and evolves; the swell plays with
  // the re-theme, at half volume.
  await release(gm, player);
  await clear(player);
  await evolve(player);
  await expect(player.getByTestId('player-grid')).toHaveClass(/evolving/);
  await expect.poll(async () => (await played(player)).length).toBeGreaterThan(0);
  const evo = await played(player);
  expect(evo.map((n) => n.freq)).toEqual([220, 330, 440, 554, 880, 1320, 1760]);
  expect(evo[0]!.peak).toBeCloseTo(0.05, 5); // 0.1 at full volume, halved

  // Selection: the next class level (F, level 5) earns a skill selection and
  // the GM offers its menu; the rising triangle notes play when it arrives.
  await clear(player);
  await gmCommand(gm, {
    type: 'xp.award',
    amount: 300,
    track: 'class',
    participants: [{ characterId: 'demo-sultan' }],
  });
  await expect(player.getByText('[Longbow Adept – lvl 5]')).toBeVisible();
  await gmCommand(gm, {
    type: 'selection.offer',
    characterId: 'demo-sultan',
    level: 5,
    options: [
      { name: 'Quick Nock', rarity: 'common' },
      { name: 'Steady Aim', rarity: 'uncommon' },
      { name: 'Wind Read', rarity: 'rare' },
    ],
  });
  await expect(player.getByTestId('selection-badge')).toHaveText('1 waiting');
  await expect
    .poll(async () => (await played(player)).filter((n) => n.wave === 'triangle').length)
    .toBe(3);
  const sel = (await played(player)).filter((n) => n.wave === 'triangle');
  expect(sel.map((n) => n.freq)).toEqual([660, 880, 1100]);
  await expect
    .poll(async () => (await played(player)).filter((n) => n.wave === 'sine').map((n) => n.freq))
    .toEqual([880, 1320]); // the DING
  for (const n of await played(player)) expect(n.peak).toBeLessThanOrEqual(0.075 + 1e-9);

  // Mute: Sound: off plays nothing, and the volume control goes away.
  await clear(player);
  await sound.click();
  await expect(player.getByTestId('volume')).toHaveCount(0);
  await gmCommand(gm, {
    type: 'xp.award',
    amount: 300,
    track: 'class',
    participants: [{ characterId: 'demo-sultan' }],
  });
  await expect(player.getByTestId('ding-toast')).toBeVisible();
  expect(await played(player)).toEqual([]);

  // A page that loads with a selection already waiting stays quiet.
  await sound.click();
  await clear(player);
  await player.reload();
  await expect(player.getByTestId('connection')).toHaveText('Connected');
  await expect(player.getByTestId('selection-badge')).toHaveText('1 waiting');
  expect(await played(player)).toEqual([]);
});
