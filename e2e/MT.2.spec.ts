import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MT.2 (DESIGN §6, Q62): the GM sends a merge as an offer; the player declines
// it (both skills stay) or accepts it (the merge DING); the GM sees each answer.

const GM_KEY = 'e2e-gm-key-mt2-0123456789abcdef02';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MT.2');
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
  { name: 'Quick Cut', rarity: 'uncommon' },
  { name: 'Side Step', rarity: 'uncommon' },
  { name: 'Archer’s Eye', rarity: 'common' },
];

test('a merge offer: the player declines, then accepts a second offer', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Offers');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gmCommand(gm, {
    type: 'character.create',
    id: 'jake',
    name: 'Jake',
    className: 'Archer',
    classSkills: kit,
  });
  await openWindow(gm, 'session');
  await gm.getByRole('button', { name: 'Start session 1' }).click();
  for (const action of ['Cut and step', 'Step then cut', 'Spinning cut']) {
    await gmCommand(gm, {
      type: 'practice.log',
      characterId: 'jake',
      action,
      skills: ['Quick Cut', 'Side Step'],
    });
  }
  const builder = gm.locator('section[aria-labelledby="merge-builder-heading"]');
  await openWindow(gm, 'merge-builder');
  await expect(builder).toContainText('Jake accepts or declines on their screen.');

  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerErrors = watchErrors(player);
  await player.goto(server.url);
  await player.getByRole('link', { name: /Jake/ }).click();
  await expect(player.getByTestId('connection')).toHaveText('Connected');
  await expect(player.getByTestId('merge-offer')).toHaveCount(0);

  // 1. The GM sends an offer; it waits on Jake and nothing is merged yet.
  await openWindow(gm, 'merge-builder');
  await builder.getByLabel('Merged skill name').fill('Stepping Cut');
  await builder.getByLabel('Description (optional)').fill('Cut as you slip aside.');
  await builder.getByRole('button', { name: 'Send merge offer' }).click();
  await expect(builder.getByTestId('merge-pending')).toContainText(
    'Waiting on Jake: [Quick Cut] + [Side Step] → [Stepping Cut]',
  );
  const card = player.getByTestId('merge-offer');
  await expect(card).toContainText(
    'The System offers to merge [Quick Cut] and [Side Step] into [Stepping Cut (Rare)].',
  );
  await expect(card).toContainText('Cut as you slip aside.');
  const skills = player.getByTestId('skills-class');
  await expect(skills).toContainText('Quick Cut');
  await builder.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-offer-waiting-1366x768.png') });
  // On a phone the open offer leads the single column (no scrolling needed).
  await expect(card).toBeInViewport();
  await player.screenshot({ path: path.join(shots, 'player-offer-390x844.png') });

  // 2. Jake declines: both skills stay, and the GM sees the answer.
  await card.getByRole('button', { name: 'Decline' }).click();
  await expect(card).toHaveCount(0);
  await expect(builder.getByTestId('merge-answer')).toHaveText(
    'Jake declined [Quick Cut] + [Side Step] → [Stepping Cut]; both skills stay.',
  );
  await expect(skills).toContainText('Quick Cut');
  await expect(skills).toContainText('Side Step');
  await gm.screenshot({ path: path.join(shots, 'gm-offer-declined-1366x768.png') });
  // The answer is campaign state, so it survives a GM reload.
  await gm.reload();
  await openWindow(gm, 'merge-builder');
  await expect(builder.getByTestId('merge-answer')).toHaveText(
    'Jake declined [Quick Cut] + [Side Step] → [Stepping Cut]; both skills stay.',
  );

  // 3. The GM offers again under another name; Jake accepts on a laptop view.
  await player.setViewportSize({ width: 1366, height: 768 });
  await builder.getByLabel('Merged skill name').fill('Dancing Blade');
  await builder.getByRole('button', { name: 'Send merge offer' }).click();
  await expect(card).toContainText('[Dancing Blade (Rare)]');
  await card.scrollIntoViewIfNeeded();
  await player.screenshot({ path: path.join(shots, 'player-offer-1366x768.png') });
  await card.getByRole('button', { name: 'Accept merge' }).click();
  await expect(player.getByTestId('ding-toast')).toContainText(
    "*'DING!' Skills merged: [Quick Cut] + [Side Step] → [Dancing Blade (Rare)]*",
  );
  await expect(skills).toContainText('Dancing Blade (Rare)');
  await expect(skills).not.toContainText('Quick Cut');
  await expect(builder.getByTestId('merge-answer')).toHaveText(
    'Jake accepted [Quick Cut] + [Side Step] → [Dancing Blade].',
  );
  await expect(builder).toContainText('No merge alerts');
  await player.screenshot({ path: path.join(shots, 'player-accepted-1366x768.png') });

  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});
