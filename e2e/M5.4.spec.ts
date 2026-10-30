import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M5.4 merges (DESIGN §6): the merge alert, building the merged skill and
// sending it; the player gets the System's merge DING and the new skill.

const GM_KEY = 'e2e-gm-key-m54-0123456789abcdef54';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M5.4');
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

test('the GM builds and sends a merge; the player gets the DING and the new skill', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Merges');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gmCommand(gm, {
    type: 'character.create',
    id: 'jake',
    name: 'Jake',
    className: 'Archer',
    classSkills: kit,
  });
  const builder = gm.locator('section[aria-labelledby="merge-builder-heading"]');
  await openWindow(gm, 'merge-builder');
  await expect(builder).toContainText('No merge alerts');
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
  const alerts = builder.getByRole('list', { name: 'Merge alerts' });
  await openWindow(gm, 'merge-builder');
  await expect(alerts).toHaveText('[Quick Cut] + [Side Step] · together 3× → Rare');
  const send = builder.getByRole('button', { name: 'Send merge offer' });
  await expect(send).toBeDisabled();
  // A name the character already uses is refused before Send.
  await builder.getByLabel('Merged skill name').fill('side step');
  await expect(builder.getByRole('alert')).toHaveText(
    'Jake already has a skill named [side step]; pick another name.',
  );
  await expect(send).toBeDisabled();
  await expect(builder).toContainText('At most 1 merge per character per grade.');
  await builder.getByLabel('Merged skill name').fill('Dancing Blade');
  await expect(builder.getByRole('alert')).toHaveCount(0);
  await builder.getByLabel('Description (optional)').fill('Strike and slip away in one motion.');
  await builder.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-merge-builder-1366x768.png') });

  // The GM form stays usable at phone width, before it is sent.
  await gm.setViewportSize({ width: 390, height: 844 });
  await builder.scrollIntoViewIfNeeded();
  const overflow = await gm.evaluate(() => {
    const d = (
      globalThis as unknown as {
        document: { documentElement: { scrollWidth: number; clientWidth: number } };
      }
    ).document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  await builder.screenshot({ path: path.join(shots, 'gm-merge-builder-390x844.png') });

  await gm.setViewportSize({ width: 1366, height: 768 });

  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerErrors = watchErrors(player);
  await player.goto(server.url);
  await player.getByRole('link', { name: /Jake/ }).click();
  await expect(player.getByTestId('connection')).toHaveText('Connected');

  await openWindow(gm, 'merge-builder');
  await send.click();
  // MT.2: the merge waits on the player's answer.
  await expect(builder.getByTestId('merge-pending')).toContainText(
    'Waiting on Jake: [Quick Cut] + [Side Step] → [Dancing Blade]',
  );
  await player.getByTestId('merge-offer').getByRole('button', { name: 'Accept merge' }).click();
  await expect(builder.getByTestId('merge-answer')).toHaveText(
    'Jake accepted [Quick Cut] + [Side Step] → [Dancing Blade].',
  );
  await expect(builder).toContainText('No merge alerts');
  await expect(player.getByTestId('ding-toast')).toContainText(
    "*'DING!' Skills merged: [Quick Cut] + [Side Step] → [Dancing Blade (Rare)]*",
  );
  const skills = player.getByTestId('skills-class');
  await expect(skills).toContainText('Dancing Blade (Rare)');
  await expect(skills).not.toContainText('Quick Cut');
  await player.screenshot({ path: path.join(shots, 'player-merge-390x844.png') });
  await skills.getByRole('button', { name: /\[Dancing Blade \(Rare\)\]/ }).click();
  await expect(player.getByTestId('skill-detail-description')).toHaveText(
    'Strike and slip away in one motion.',
  );

  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});
