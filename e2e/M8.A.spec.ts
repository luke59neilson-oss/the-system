import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M8.A milestone acceptance (look and feel): one Archer climbs from G to A the
// real way (XP, every skill selection, a released evolution at each top) while
// the player's laptop listens. Each evolution re-themes the screen in the new
// grade's metal (M8.1, M8.2) and plays the swell (M8.4); every theme is
// screenshotted on the real screen at 1366×768 and 390×844 in
// docs/screens/themes/, and no page error or console error shows up.

const GM_KEY = 'e2e-gm-key-m8a-0123456789abcdef8a';
const shots = path.resolve(import.meta.dirname, '../docs/screens/themes');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

// The climb, from DESIGN §3: each grade's metal, top level, selection levels
// and rarity ceiling (the capstone menu must offer one at the ceiling).
const GRADES = [
  { grade: 'G', metal: 'aluminum', top: 4, levels: [] as number[], ceiling: 'rare' },
  { grade: 'F', metal: 'bronze', top: 14, levels: [5, 10], ceiling: 'rare' },
  { grade: 'E', metal: 'copper', top: 49, levels: [15, 20, 25, 30, 35, 40, 45], ceiling: 'epic' },
  { grade: 'D', metal: 'silver', top: 99, levels: [50, 60, 70, 80, 90], ceiling: 'ancient' },
  { grade: 'C', metal: 'gold', top: 149, levels: [100, 110, 120, 130, 140], ceiling: 'legendary' },
  {
    grade: 'B',
    metal: 'platinum',
    top: 199,
    levels: [150, 160, 170, 180, 190],
    ceiling: 'legendary',
  },
  {
    grade: 'A',
    metal: 'diamond',
    top: 240,
    levels: [200, 210, 220, 230, 240],
    ceiling: 'mythical',
  },
] as const;

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
  expect(result, JSON.stringify(command)).toBe('ok');
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** The player's laptop, with Web Audio replaced by a note counter per sound. */
async function listening(page: Page) {
  await page.addInitScript(() => {
    const w = globalThis as unknown as { notes: number[]; AudioContext: unknown };
    w.notes = [];
    w.AudioContext = class {
      currentTime = 0;
      destination = {};
      resume() {
        return Promise.resolve();
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect: (n: unknown) => n,
        };
      }
      createOscillator() {
        const osc = {
          type: 'sine',
          frequency: { value: 0 },
          connect: (n: unknown) => n,
          start() {
            w.notes.push(osc.frequency.value);
          },
          stop() {},
        };
        return osc;
      }
    };
  });
}

const notes = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { notes: number[] }).notes);

async function shoot(page: Page, metal: string) {
  // Clear the DING queue first (a click skips to the next), so the toast does
  // not cover the theme.
  const toast = page.getByTestId('ding-toast');
  for (let i = 0; i < 30 && (await toast.count()) > 0; i += 1) await toast.click();
  await expect(toast).toHaveCount(0);
  await page.evaluate(() =>
    (globalThis as unknown as { scrollTo(x: number, y: number): void }).scrollTo(0, 0),
  );
  await page.screenshot({ path: path.join(shots, `evolved-${metal}-1366x768.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('status')).toBeVisible();
  const width = await page.evaluate(
    () =>
      (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document
        .documentElement.scrollWidth,
  );
  expect(width, `${metal}: no sideways scroll on a phone`).toBeLessThanOrEqual(390);
  await page.screenshot({ path: path.join(shots, `evolved-${metal}-390x844.png`) });
  await page.setViewportSize({ width: 1366, height: 768 });
}

test('an Archer climbs G to A: each evolution re-themes the real screen in its metal and plays the swell', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Look and feel');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gmCommand(gm, {
    type: 'character.create',
    id: 'wren',
    name: 'Wren',
    className: 'Archer',
    classSkills: [
      { name: 'Basic Archery', rarity: 'inferior' },
      { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
      { name: 'Archer’s Eye', rarity: 'common' },
    ],
  });

  const player = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const playerErrors = watchErrors(player);
  await listening(player);
  await player.goto(`${server.url}/play/wren`);
  await expect(player.getByTestId('connection')).toHaveText('Connected');
  await player.getByTestId('sound').click();
  const status = player.getByTestId('status');
  const grid = player.getByTestId('player-grid');

  // G: the starting screen in dull aluminum.
  await expect(status).toHaveClass(/theme-aluminum/);
  await shoot(player, 'aluminum');

  for (let i = 0; i < GRADES.length - 1; i += 1) {
    const here = GRADES[i]!;
    const next = GRADES[i + 1]!;
    // XP to the top of this grade (the rest is lost: no profession to take it).
    await gmCommand(gm, {
      type: 'xp.award',
      amount: 5_000_000,
      track: 'class',
      participants: [{ characterId: 'wren' }],
    });
    await expect(player.getByText(new RegExp(`– lvl ${here.top}\\]`)).first()).toBeVisible();
    // Every selection earned on the way, the capstone with a ceiling option.
    for (const level of here.levels) {
      await gmCommand(gm, {
        type: 'selection.offer',
        characterId: 'wren',
        level,
        options: [
          { name: `Draw ${level}`, rarity: 'common' },
          { name: `Mark ${level}`, rarity: 'uncommon' },
          { name: `Peak ${level}`, rarity: here.ceiling },
        ],
      });
      await gmCommand(gm, {
        type: 'selection.choose',
        characterId: 'wren',
        level,
        skill: `Draw ${level}`,
      });
    }
    await expect(player.getByTestId('selection-badge')).toHaveCount(0);
    // The GM releases one path; the player takes it on their own screen.
    const className = `Archer of ${next.grade}`;
    await gmCommand(gm, {
      type: 'evolution.release',
      characterId: 'wren',
      options: [{ className }],
    });
    const before = (await notes(player)).length;
    await player.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
    const dialog = player.getByTestId('evolution');
    await dialog.getByRole('button', { name: `Choose ${className}` }).click();
    await dialog.getByRole('button', { name: 'Evolve' }).click();
    await expect(dialog).toHaveCount(0);

    // The re-theme runs (M8.2), the swell plays (M8.4), and the new metal stays.
    await expect(grid).toHaveClass(/evolving/);
    // (The evolution's own DINGs may play around it.)
    await expect
      .poll(async () => (await notes(player)).slice(before).join(','))
      .toContain('220,330,440,554,880,1320,1760');
    await expect(grid).not.toHaveClass(/evolving/, { timeout: 5_000 });
    await expect(status).toHaveClass(new RegExp(`theme-${next.metal}`));
    await expect(grid).toHaveClass(new RegExp(`theme-${next.metal}`));
    await expect(player.getByText(`[${className} – lvl ${here.top}]`)).toBeVisible();
    await shoot(player, next.metal);
  }

  // A: the top of the campaign, every selection taken.
  await gmCommand(gm, {
    type: 'xp.award',
    amount: 5_000_000,
    track: 'class',
    participants: [{ characterId: 'wren' }],
  });
  await expect(player.getByText('[Archer of A – lvl 240]')).toBeVisible();
  expect(playerErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
