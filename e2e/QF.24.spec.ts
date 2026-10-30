import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.24 (sweep B, UX): a merge offer announces itself on the owner's screen
// (toast and Notifications list); other players are told nothing.

const GM_KEY = 'e2e-gm-key-qf24-0123456789abcdef24';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.24');
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

test('a merge offer pops up for its owner and stays in their Notifications', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Offer notice');
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

  // A second player, who must hear nothing about Jake's offer.
  await gmCommand(gm, {
    type: 'character.create',
    id: 'amy',
    name: 'Amy',
    className: 'Archer',
    classSkills: [
      { name: 'Aim', rarity: 'common' },
      { name: 'Hide', rarity: 'common' },
      { name: 'Run', rarity: 'common' },
    ],
  });
  const amy = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const amyErrors = watchErrors(amy);
  await amy.goto(server.url);
  await amy.getByRole('link', { name: /Amy/ }).click();
  await expect(amy.getByTestId('connection')).toHaveText('Connected');

  await openWindow(gm, 'merge-builder');
  await builder.getByLabel('Merged skill name').fill('Stepping Cut');
  await builder.getByRole('button', { name: 'Send merge offer' }).click();
  const notice =
    '*Skill merge offered: [Quick Cut] + [Side Step] → [Stepping Cut] - Accept or decline it in the Skill Merge window*';
  await expect(player.getByTestId('ding-toast')).toHaveText(notice);
  await expect(player.getByTestId('merge-offer')).toBeVisible();
  await player.screenshot({
    path: path.join(shots, 'player-offer-notice-390x844.png'),
    animations: 'disabled',
  });
  // It stays in the Notifications list after the toast goes.
  await expect(player.getByTestId('ding-toast')).toHaveCount(0, { timeout: 10_000 });
  const history = player.getByTestId('history');
  await history.getByLabel('Show').selectOption('broadcast');
  await expect(player.getByTestId('dings').getByRole('listitem')).toContainText([notice]);
  // Amy hears nothing about it.
  await expect(amy.getByText('Skill merge offered')).toHaveCount(0);
  await expect(amy.getByTestId('ding-toast')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
  expect(amyErrors).toEqual([]);
});
