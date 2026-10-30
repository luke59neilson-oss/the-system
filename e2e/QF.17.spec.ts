import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.17: a Table-view pane pins the newest DING of every kind (level-up,
// profession, skill upgrade, merge), the same set as the history's DING
// filter, not only level-ups.

const GM_KEY = 'e2e-gm-key-qf17-0123456789abcdef17';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.17');
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

const pane = (gm: Page, name: string) =>
  gm.frameLocator(`iframe[title="${name} (player view)"]:visible`);

test('a Table-view pane pins a skill-upgrade DING, not only level-ups', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Table DINGs');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gmCommand(gm, {
    type: 'character.create',
    id: 'jake',
    name: 'Jake',
    className: 'Archer',
    classSkills: kit,
  });
  // Two marks on Basic Archery from earlier sessions; one more upgrades it.
  for (const session of ['old-1', 'old-2']) {
    await gmCommand(gm, {
      type: 'skill.awardMark',
      characterId: 'jake',
      skill: 'Basic Archery',
      session,
    });
  }
  await openWindow(gm, 'session');
  await gm.getByRole('button', { name: 'Start session 1' }).click();
  await gmCommand(gm, {
    type: 'practice.log',
    characterId: 'jake',
    action: 'Shot the rope from 80 m',
    skills: ['Basic Archery'],
  });

  // Table view: Jake's pane is a live player client.
  const bar = gm.getByRole('navigation', { name: 'View as' });
  await bar.getByRole('button', { name: 'Table view' }).click();
  const jake = pane(gm, 'Jake');
  await expect(jake.getByTestId('connection')).toHaveText('Connected');
  await expect(jake.getByTestId('latest-ding')).toHaveCount(0);

  // A level-up DING lands first and is pinned.
  await gm.getByLabel('Amount').fill('100');
  await gm.getByLabel('Reason (GM only)').fill('QF.17 rope shot');
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(jake.getByTestId('latest-ding')).toHaveText(
    "*'DING!' Race: [Human] has reached level 1 - +2 free points*",
  );

  // The GM confirms the mark and upgrades the skill from the console beside the panes.
  const review = gm.locator('section[aria-labelledby="marks-review-heading"]');
  const row = review.locator('section[aria-labelledby="marks-jake"]');
  await row.getByRole('button', { name: 'Confirm mark: Jake Basic Archery' }).click();
  await row
    .getByTestId('upgrade-prompt')
    .getByRole('button', { name: 'Upgrade Jake Basic Archery' })
    .click();
  await openWindow(gm, 'marks-review');
  await expect(review.getByRole('status')).toHaveText('Jake: [Basic Archery] is now Common');

  // The pane's pinned DING is now the upgrade.
  const upgrade = "*'DING!' Skill upgraded: [Basic Archery (Inferior)] → [Basic Archery (Common)]*";
  await expect(jake.getByTestId('latest-ding')).toHaveText(upgrade);
  await expect(jake.getByTestId('latest-ding')).toBeInViewport();
  await gm.screenshot({ path: path.join(shots, 'table-view-upgrade-ding-1366x768.png') });
  expect(errors).toEqual([]);
});
