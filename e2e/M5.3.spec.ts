import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M5.3 marks review (DESIGN §6–7): after a session the GM sees each
// character's skills used (repeats flagged), confirms marks (one per skill per
// session), and upgrades the skills those marks unlock; the player gets the DING.

const GM_KEY = 'e2e-gm-key-m53-0123456789abcdef53';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M5.3');
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

test('the GM reviews a session, confirms marks and upgrades; the player gets the DING', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Marks');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const review = gm.locator('section[aria-labelledby="marks-review-heading"]');
  await openWindow(gm, 'marks-review');
  await expect(review).toContainText('No session played yet.');

  for (const [id, name] of [
    ['jake', 'Jake'],
    ['lee', 'Lee'],
  ] as const) {
    await gmCommand(gm, {
      type: 'character.create',
      id,
      name,
      className: 'Archer',
      classSkills: kit,
    });
  }
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
  const log = (characterId: string, action: string, skills: string[]) =>
    gmCommand(gm, { type: 'practice.log', characterId, action, skills });
  await log('jake', 'Shot the rope from 80 m', ['Basic Archery']);
  await log('jake', 'Read the wind before the shot', ['Archer’s Eye', 'Basic Archery']);
  await log('jake', 'shot the rope from 80 m.', ['Basic Archery']);
  await log('lee', 'Parried the pale hunter', ['Basic One-Handed Weapon']);

  const jake = review.locator('section[aria-labelledby="marks-jake"]');
  const rows = jake.getByTestId('mark-candidate');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('[Basic Archery (Inferior)]used 3× · 2/3 marks');
  await expect(rows.nth(0)).toContainText('shot the rope from 80 m. · repeat');
  await expect(rows.nth(1)).toContainText('[Archer’s Eye (Common)]used 1× · 0/4 marks');
  await openWindow(gm, 'marks-review');
  await expect(review.locator('section[aria-labelledby="marks-lee"]')).toContainText(
    '[Basic One-Handed Weapon (Inferior)]',
  );
  await expect(jake.getByTestId('upgrade-prompt')).toHaveCount(0);
  await expect(review.getByRole('list', { name: 'Jake: skills used together' })).toHaveText(
    'Used together: [Archer’s Eye] + [Basic Archery] ×1 this session · 1/3 for a merge',
  );
  await review.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-marks-review-1366x768.png') });

  // The player is watching their sheet when the upgrade lands.
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerErrors = watchErrors(player);
  await player.goto(server.url);
  await player.getByRole('link', { name: /Jake/ }).click();
  await expect(player.getByTestId('connection')).toHaveText('Connected');

  // Confirm the mark: the row says so and the upgrade prompt appears.
  await jake.getByRole('button', { name: 'Confirm mark: Jake Basic Archery' }).click();
  await openWindow(gm, 'marks-review');
  await expect(review.getByRole('status')).toHaveText('Jake: mark confirmed on [Basic Archery]');
  await expect(rows.nth(0)).toContainText('3/3 marks');
  await expect(rows.nth(0)).toContainText('Marked this session');
  // Only the GM's override (MT.7) can give a second mark this session.
  await expect(rows.nth(0).getByRole('button', { name: /^Confirm mark/ })).toHaveCount(0);
  await expect(rows.nth(0).getByRole('button', { name: /^Extra mark \(override\)/ })).toHaveCount(
    1,
  );
  const prompt = jake.getByTestId('upgrade-prompt');
  await expect(prompt).toContainText(
    'Upgrade ready: [Basic Archery (Inferior)] → Common (3/3 marks; starts again at 0)',
  );
  // Another skill can be marked from the list (not logged this session).
  await jake
    .getByLabel('Mark another skill')
    .selectOption({ label: '[Basic One-Handed Weapon (Inferior)] · 0/3 marks' });
  await jake.getByRole('button', { name: 'Confirm mark: Jake Basic One-Handed Weapon' }).click();
  await expect(review.getByRole('status')).toHaveText(
    'Jake: mark confirmed on [Basic One-Handed Weapon]',
  );
  await gm.screenshot({ path: path.join(shots, 'gm-upgrade-prompt-1366x768.png') });

  await prompt.getByRole('button', { name: 'Upgrade Jake Basic Archery' }).click();
  await expect(review.getByRole('status')).toHaveText('Jake: [Basic Archery] is now Common');
  await expect(prompt).toHaveCount(0);
  await expect(rows.nth(0)).toContainText('[Basic Archery (Common)]used 3× · 0/4 marks');

  const toast = player.getByTestId('ding-toast');
  await expect(toast).toContainText(
    "*'DING!' Skill upgraded: [Basic Archery (Inferior)] → [Basic Archery (Common)]*",
  );
  await expect(player.getByTestId('skills-class')).toContainText('Basic Archery (Common)');
  await player.screenshot({ path: path.join(shots, 'player-skill-upgrade-390x844.png') });

  // After the session ends the review stays on it; a second mark on the same skill is not offered.
  await openWindow(gm, 'session');
  await gm.getByRole('button', { name: 'End session…' }).click();
  await gm.getByRole('button', { name: 'End session 1' }).click();
  await openWindow(gm, 'marks-review');
  await expect(review.getByLabel('Session')).toHaveValue(/.+/);
  await expect(review.getByLabel('Session').locator('option')).toHaveText(['Session 1']);
  await expect(rows.nth(1).getByRole('button', { name: /Confirm mark/ })).toBeVisible();
  await rows
    .nth(1)
    .getByRole('button', { name: /Confirm mark/ })
    .click();
  await expect(review.getByRole('status')).toHaveText('Jake: mark confirmed on [Archer’s Eye]');
  await expect(rows.nth(1)).toContainText('1/4 marks');

  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});
