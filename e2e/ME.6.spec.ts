import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// ME.6 (ME.A review fixes, DESIGN §2, §9): (b) the GM offers a profession
// from the console before any evolution, with its per-level stats and bonus,
// and the player sees and takes it; (c) the GM sets a character's per-level
// stats per track; (a, e) a profession taken while a release waits stays as
// it is, and the phone review lists each pick in one column with its bonus.

const GM_KEY = 'e2e-gm-key-me6-0123456789abcdefme6';
const shots = path.resolve(import.meta.dirname, '../docs/screens/ME.6');
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

/** Runs one GM command over the GM page's own origin (set-up only). */
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

const kit = [
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
  { name: 'Archer’s Eye', rarity: 'common' },
];

async function join(page: Page, name: string) {
  await page.goto(server.url);
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
}

async function campaign(gm: Page, names: readonly [string, string][]) {
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  for (const [id, name] of names) {
    await gmCommand(gm, {
      type: 'character.create',
      id,
      name,
      className: 'Archer',
      classSkills: kit,
    });
  }
}

const opt = (
  id: string,
  name: string,
  stats: Record<string, number>,
  free: number,
  bonus: Record<string, number>,
) => ({
  id,
  name,
  rarity: 'uncommon',
  description: `${name} text.`,
  distribution: { stats, free },
  statBonus: bonus,
});

test('the GM offers a profession with its stats before any evolution, and sets per-level stats', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await campaign(gm, [
    ['kim', 'Kim'],
    ['jo', 'Jo'],
  ]);
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerErrors = watchErrors(player);
  await join(player, 'Kim');
  const jo = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await join(jo, 'Jo');

  // (b) Progression → Professions: offer Herbalist with per-level stats and a bonus.
  await openTab(gm, 'progression');
  const window = gm.locator('section[aria-labelledby="gm-professions-heading"]');
  await window.getByLabel('Character').selectOption('kim');
  await window.getByLabel('Profession name').fill('Herbalist');
  await window.getByLabel('Set its per-level stats and one-time bonus').check();
  await window.getByLabel('Per level Wisdom', { exact: true }).fill('2');
  await window.getByLabel('Per level Vitality', { exact: true }).fill('1');
  await window.getByLabel('Per level free points').fill('2');
  await expect(window.getByTestId('profession-offer-total')).toHaveText('Total 5 of 5 per level');
  await window.getByText('One-time bonus when taken').click();
  await window.getByLabel('Bonus Wisdom', { exact: true }).fill('3');
  await window.screenshot({ path: path.join(shots, 'gm-offer-1366x768.png') });
  await window.getByRole('button', { name: 'Offer profession' }).click();
  await expect(window.getByRole('status')).toHaveText('Offered [Herbalist] to Kim.');
  await expect(window.getByTestId('profession-offers')).toContainText('[Herbalist]');
  await expect(window.getByTestId('profession-offers')).toContainText('+2 Wisdom');
  // The form resets after use.
  await expect(window.getByLabel('Profession name')).toHaveValue('');
  await gm.screenshot({ path: path.join(shots, 'gm-professions-1366x768.png') });

  // Kim sees the offer and what it brings; Jo sees nothing of it (canary).
  const professions = player.getByTestId('professions');
  await expect(professions.getByTestId('profession-offer-card')).toHaveText(
    'Per level: Vitality 1 · Wisdom 2 · Free points 2; one-time bonus: Wisdom +3',
  );
  await professions.scrollIntoViewIfNeeded();
  await player.screenshot({ path: path.join(shots, 'player-offer-390x844.png') });
  await expect(jo.locator('body')).not.toContainText('Herbalist');

  // Kim takes it; the bonus lands now and the GM window locks the offers.
  await professions.getByRole('button', { name: 'Take Herbalist' }).click();
  await professions.getByRole('button', { name: 'Confirm' }).click();
  await expect(professions.getByTestId('professions-locked')).toContainText('[Herbalist]');
  await expect(player.getByTestId('status')).toContainText('Herbalist');
  await expect(window.getByTestId('gm-professions-locked')).toContainText('[Herbalist]');

  // (c) Progression → Per-level stats: the profession shows the offer's, the
  // GM sets Kim's race and later resets it.
  const stats = gm.locator('section[aria-labelledby="track-stats-heading"]');
  await stats.getByLabel('Character').selectOption('kim');
  await stats.getByLabel('Track').selectOption('profession');
  await expect(stats.getByLabel('Per level Wisdom', { exact: true })).toHaveValue('2');
  await expect(stats.getByTestId('track-stats-current')).toContainText('Set by the GM');
  await stats.getByLabel('Track').selectOption('race');
  await expect(stats.getByTestId('track-stats-current')).toContainText(
    'every point is a free point',
  );
  await stats.getByLabel('Per level Perception', { exact: true }).fill('2');
  await stats.getByLabel('Per level Intelligence', { exact: true }).fill('2');
  await stats.getByLabel('Per level free points').fill('1');
  await expect(stats.getByTestId('track-stats-total')).toHaveText('Total 5 of 5 per level');
  await stats.getByRole('button', { name: 'Save per-level stats' }).click();
  await expect(stats.getByRole('status')).toContainText('race per-level stats saved');
  await stats.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-track-stats-1366x768.png') });

  await stats.getByRole('button', { name: 'Reset to default' }).click();
  await expect(stats.getByRole('status')).toContainText('back to the default');
  await expect(stats.getByLabel('Per level Perception', { exact: true })).toHaveValue('');
  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});

test('a profession taken while the release waits stays as it is; the phone review is one column with bonuses', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await campaign(gm, [['kim', 'Kim']]);
  await gmCommand(gm, { type: 'profession.offer', characterId: 'kim', profession: 'Cook' });
  await gmCommand(gm, {
    type: 'xp.award',
    track: 'class',
    amount: 400,
    participants: [{ characterId: 'kim' }],
  });
  // F budgets: class 11, profession 7, race 6.
  await gmCommand(gm, {
    type: 'evolution.release',
    characterId: 'kim',
    rerateApproved: true,
    steps: {
      class: [
        opt('c1', 'Storm Archer of the Long Reach', { perception: 6, agility: 3 }, 2, {
          perception: 2,
        }),
      ],
      profession: [opt('p1', 'Herbalist', { wisdom: 5 }, 2, { wisdom: 2 })],
      race: [opt('r1', 'Human (F)', {}, 6, { vitality: 2 })],
    },
  });
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerErrors = watchErrors(player);
  await join(player, 'Kim');
  // Kim takes the Cook offer from her Professions list before evolving.
  const professions = player.getByTestId('professions');
  await professions.getByRole('button', { name: 'Take Cook' }).click();
  await professions.getByRole('button', { name: 'Confirm' }).click();
  await expect(professions.getByTestId('professions-locked')).toContainText('[Cook]');

  const panel = player.getByTestId('evolution-panel');
  await panel.getByRole('button', { name: /your evolution/ }).click();
  const dialog = player.getByTestId('evolution');
  await dialog.getByRole('button', { name: 'Choose Storm Archer of the Long Reach' }).click();
  // No profession step: Cook stays; straight to the race.
  await expect(dialog.getByRole('heading', { name: 'Race: choose one' })).toBeVisible();
  await expect(dialog.getByLabel('Evolution steps')).not.toContainText('Profession');
  await dialog.getByRole('button', { name: 'Choose Human (F)' }).click();
  const review = dialog.getByTestId('evolution-review');
  await expect(review.getByTestId('evolution-review-profession')).toHaveText(
    '[Cook]Stays as it is.',
  );
  const bonuses = review.getByTestId('evolution-review-bonus');
  await expect(bonuses).toHaveText([
    'One-time bonus: +2 Perception',
    'One-time bonus: +2 Vitality',
  ]);
  // One column: each pick sits below the one before, inside the dialog.
  const rows = review.locator(':scope > div');
  await expect(rows).toHaveCount(3);
  const boxes = await rows.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, bottom: r.bottom, right: r.right };
    }),
  );
  for (let i = 1; i < boxes.length; i += 1) {
    expect(boxes[i]!.x).toBeCloseTo(boxes[0]!.x, 0);
    expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom - 1);
  }
  for (const b of boxes) expect(b.right).toBeLessThanOrEqual(390);
  await player.screenshot({ path: path.join(shots, 'player-review-390x844.png') });

  await dialog.getByRole('button', { name: 'Evolve' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(player.getByTestId('status')).toContainText('Cook');
  await expect(player.getByTestId('status')).not.toContainText('Herbalist');
  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});
