import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M5.2 evolution builder (DESIGN §2, §6): options with a one-time bonus,
// transforms, re-rating per skill, profession offers, checked by the engine,
// released; the selection warning; withdrawing an untaken offer.

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
  await option.getByText('Bonus per stat').click();
  await option.getByLabel('Strength', { exact: true }).fill('3');
  await option.getByText('Reshape the class spread').click();
  await option.getByLabel('Perception weight').fill('3');
  await expect(option.getByText('Reshape the class spread (changed)')).toBeVisible();
  // Casper, earlier in the party order, becomes ready mid-build: Sultan's draft stays.
  await gmCommand(gm, {
    type: 'xp.award',
    track: 'class',
    amount: 5000,
    participants: [{ characterId: 'demo-casper' }],
  });
  await expect(builder.getByLabel('Character').locator('option')).toHaveCount(2);
  await expect(builder.getByLabel('Character')).toHaveValue('demo-sultan');
  await expect(option.getByLabel('Class name')).toHaveValue('Storm Hunter');
  // MT.1: every skill starts at its own rarity; the GM lowers one and approves.
  await expect(form.getByTestId('release-problem')).toHaveText(
    'Approve the skill re-rating before releasing.',
  );
  await form
    .getByRole('list', { name: 'Re-rating' })
    .getByLabel(/Archer.s Eye/)
    .selectOption({ label: 'Inferior' });
  await form.getByLabel(/Approve this re-rating/).check();
  await expect(form.getByTestId('release-problem')).toHaveCount(0);
  await expect(
    form.getByRole('list', { name: 'Re-rating' }).getByRole('listitem').first(),
  ).toBeVisible();
  await builder.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-evolution-1366x768.png') });
  await form.getByRole('button', { name: 'Release evolution' }).click();
  await expect(builder.getByRole('status')).toHaveText('Evolution released to Sultan');
  await expect(builder.getByTestId('evolution-released')).toContainText('[Storm Hunter]');

  // Sultan's player chooses it: the bonus and the re-rating land.
  const player = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const playerErrors = watchErrors(player);
  await player.goto(server.url);
  await player.getByRole('link', { name: /Sultan/ }).click();
  const pending = player.getByTestId('evolution-pending');
  await pending.getByRole('button', { name: '[Evolve]' }).click();
  const dialog = player.getByTestId('evolution');
  const path1 = dialog.getByRole('listitem', { name: '[Storm Hunter]' });
  await expect(path1.getByTestId('evolution-bonus')).toContainText('+5 Strength');
  await expect(dialog.getByTestId('evolution-rerate')).toContainText(
    /Archer.s Eye\] Common → Inferior/,
  );
  await dialog.getByRole('button', { name: 'Choose Storm Hunter' }).click();
  await dialog.getByRole('button', { name: 'Evolve' }).click();
  await expect(player.getByTestId('class')).toHaveText(/^\[Storm Hunter – lvl \d+\]$/);
  await expect(player.getByTestId('skills-class')).toContainText(/Archer.s Eye \(Inferior\)/);
  // Sultan is done; the builder moves on to Casper, still waiting.
  await expect(builder.getByLabel('Character')).toHaveValue('demo-casper');
  await expect(builder.getByLabel('Character').locator('option')).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});

test('the release waits on a selection; transforms, profession offers and withdrawing one', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Evolve');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  const builder = gm.locator('section[aria-labelledby="evolution-builder"]');

  // Casper (F, Ranger 7) reaches the F top: the level 10 capstone is still owed.
  await gmCommand(gm, {
    type: 'xp.award',
    track: 'class',
    amount: 5000,
    participants: [{ characterId: 'demo-casper' }],
  });
  await builder.getByLabel('Character').selectOption('demo-casper');
  const form = builder.getByRole('form', { name: 'Evolution release' });
  await expect(form.getByTestId('evolution-waits')).toHaveText(
    'Waits on the capstone selection at lvl 10: the player must choose first.',
  );
  await expect(form.getByRole('button', { name: 'Release evolution' })).toBeDisabled();
  await form.getByTestId('evolution-waits').scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-evolution-waits-1366x768.png') });
  await gmCommand(gm, {
    type: 'selection.offer',
    characterId: 'demo-casper',
    level: 10,
    options: [
      { name: 'Hawk Step', rarity: 'rare' },
      { name: 'Quiet Draw', rarity: 'common' },
      { name: 'Trail Sign', rarity: 'common' },
    ],
  });
  await gmCommand(gm, {
    type: 'selection.choose',
    characterId: 'demo-casper',
    level: 10,
    skill: 'Quiet Draw',
  });
  await expect(form.getByTestId('evolution-waits')).toHaveCount(0);

  const option = form.getByRole('group', { name: 'Option 1' });
  await option.getByLabel('Class name').fill('Pathfinder');
  await option.getByRole('button', { name: 'Add transform' }).click();
  const row = option.getByRole('group', { name: 'Transform 1' });
  const skill = await row.getByLabel('Skill').inputValue();
  await row.getByLabel('New name').fill('Pathfinder’s Eye');
  await row.getByLabel('Rarity').selectOption('rare');
  await form.getByLabel(/Professions to offer/).fill('Cook\nAlchemist');
  await form.getByLabel(/Approve this re-rating/).check();
  await expect(form.getByTestId('release-problem')).toHaveCount(0);
  await builder.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-evolution-transform-1366x768.png') });
  await form.getByRole('button', { name: 'Release evolution' }).click();
  await expect(builder.getByRole('status')).toHaveText('Evolution released to Casper');

  // The GM withdraws one untaken offer from the waiting release.
  const offers = builder.getByRole('list', { name: 'Untaken profession offers' });
  await expect(offers).toContainText('Casper: [Cook]');
  await offers.getByRole('button', { name: 'Withdraw Alchemist from Casper' }).click();
  await expect(offers).not.toContainText('Alchemist');
  await form.getByRole('list', { name: 'Re-rating' }).scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-evolution-rerate-offers-1366x768.png') });

  const player = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const playerErrors = watchErrors(player);
  await player.goto(server.url);
  await player.getByRole('link', { name: /Casper/ }).click();
  await player.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
  const dialog = player.getByTestId('evolution');
  await expect(dialog).toContainText(`[${skill}`);
  await expect(dialog).toContainText('→ [Pathfinder’s Eye (Rare)]');
  await dialog.getByRole('button', { name: 'Choose Pathfinder' }).click();
  const profession = dialog.getByLabel('Profession');
  await expect(profession.locator('option')).toHaveText(['None for now', 'Cook']);
  await dialog.getByRole('button', { name: 'Evolve' }).click();
  await expect(player.getByTestId('skills-class')).toContainText('[Pathfinder’s Eye (Rare)]');
  // "None for now": Cook stays offered and withdrawable.
  await expect(offers).toContainText('Casper: [Cook]');
  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});
