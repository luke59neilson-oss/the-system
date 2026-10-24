import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M9.5 Tutorial content pack: the GM imports docs/content-packs/tutorial.json
// into a new campaign; the player sees the 30-day quest with World Stability,
// and nothing GM-only (the reveal, region notes, GM notes) reaches them.

const GM_KEY = 'e2e-gm-key-m95-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M9.5');
const pack = path.resolve(import.meta.dirname, '../docs/content-packs/tutorial.json');
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

test('the GM imports the tutorial pack and the player sees the quest', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('The Host');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gmCommand(gm, {
    type: 'character.create',
    id: 'jake',
    name: 'Jake',
    className: 'Archer',
    classSkills: [
      { name: 'Basic Archery', rarity: 'inferior' },
      { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
      { name: 'Archer’s Eye', rarity: 'common' },
    ],
  });

  const panel = gm.locator('section[aria-labelledby="import-heading"]');
  await panel.getByLabel('Content file (.json)').setInputFiles(pack);
  await expect(panel).toContainText('Tutorial: The Host');
  await expect(panel.getByText('Quest: The World Is Dying')).toBeVisible();
  await expect(panel.getByText('Region: Red Rivers')).toBeVisible();
  await expect(panel.getByText('Hunger tracker')).toBeVisible();
  const boxes = panel.getByRole('checkbox');
  const count = await boxes.count();
  expect(count).toBeGreaterThan(30);
  // Every entry applies on a new campaign: all ticked, none marked.
  await expect(panel.locator('.err')).toHaveCount(0);
  await panel.screenshot({ path: path.join(shots, 'gm-import-tutorial-1366x768.png') });
  await panel.getByRole('button', { name: `Apply ${count}` }).click();
  await expect(panel.getByRole('status')).toHaveText(`Applied ${count} entries`);

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  const quest = phone.getByTestId('quests').getByRole('article', { name: 'The World Is Dying' });
  await expect(quest).toContainText('Delve to the heart of the world and purge the infection.');
  await expect(quest.getByTestId('quest-time')).toHaveText('Time remaining: 30 days');
  await expect(quest.getByTestId('stability-value')).toHaveText('100%');
  await quest.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'player-tutorial-quest-390x844.png') });
  // The reveal and the GM's notes stay with the GM.
  const html = await phone.content();
  for (const secret of ['you are what it is defending against', 'immune response', 'Clotmother']) {
    expect(html).not.toContain(secret);
  }
  await phone.close();
  await gm.close();
});
