import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M5.5 practice capture (DESIGN §7): the GM's quick-add (Alt+P), the
// end-of-scene prompt, and the review of player entries (correct, remove,
// mark reviewed).

const GM_KEY = 'e2e-gm-key-m55-0123456789abcdef55';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M5.5');
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

/** Runs one command as the GM, or as a player when `as` is set (set-up only). */
async function command(
  gm: Page,
  command: Record<string, unknown>,
  as: string | null = null,
): Promise<void> {
  const result = await gm.evaluate(
    ({ key, command, as }) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(
          `ws://${(globalThis as unknown as { location: { host: string } }).location.host}/ws`,
        );
        ws.onmessage = (e) => {
          const m = JSON.parse(String(e.data)) as { type: string; ok?: boolean; error?: string };
          if (m.type === 'hello')
            ws.send(
              JSON.stringify(
                as === null
                  ? { type: 'join', role: 'gm', gmKey: key }
                  : { type: 'join', role: 'player', characterId: as },
              ),
            );
          if (m.type === 'joined')
            ws.send(JSON.stringify({ type: 'command', requestId: 'x', command }));
          if (m.type === 'result') {
            ws.close();
            resolve(m.ok ? 'ok' : (m.error ?? 'failed'));
          }
        };
      }),
    { key: GM_KEY, command, as },
  );
  expect(result).toBe('ok');
}

const kit = [
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
  { name: 'Archer’s Eye', rarity: 'common' },
];

test('the GM quick-adds practice, walks the end-of-scene prompt and reviews player entries', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Practice');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  for (const [id, name] of [
    ['jake', 'Jake'],
    ['kim', 'Kim'],
  ] as const) {
    await command(gm, {
      type: 'character.create',
      id,
      name,
      className: 'Archer',
      classSkills: kit,
    });
  }
  await gm.getByRole('button', { name: 'Start session 1' }).click();
  const win = gm.locator('section[aria-labelledby="practice-capture-heading"]');
  await expect(win).toContainText('To review (0)');

  // Two player entries arrive for review.
  await command(
    gm,
    {
      type: 'practice.log',
      characterId: 'jake',
      action: 'Shto the eel',
      skills: ['Basic Archery'],
    },
    'jake',
  );
  await command(
    gm,
    { type: 'practice.log', characterId: 'jake', action: 'Oops twice', stat: 'agility' },
    'jake',
  );
  await expect(win).toContainText('To review (2)');
  const review = win.getByRole('list', { name: 'Practice to review' });
  await expect(review.getByRole('listitem')).toHaveCount(2);
  await expect(review.getByRole('listitem').nth(0)).toContainText(
    'Jake: Shto the eel · [Basic Archery]',
  );
  await win.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-practice-review-1366x768.png') });

  await review.getByRole('listitem').nth(0).getByRole('button', { name: 'Edit' }).click();
  await review.getByLabel('Action').fill('Shot the eel');
  await review.getByRole('checkbox', { name: '[Basic One-Handed Weapon]' }).check();
  await review.getByRole('checkbox', { name: '[Basic Archery]' }).uncheck();
  await review.getByRole('button', { name: 'Save' }).click();
  await expect(win.getByRole('status')).toHaveText('Corrected: Shot the eel');
  await review.getByRole('listitem').nth(0).getByRole('button', { name: 'Remove' }).click();
  await expect(win.getByRole('status')).toHaveText('Removed: Oops twice');
  await expect(win).toContainText('To review (0)');

  // Quick-add from anywhere with Alt+P; the GM's own entries need no review.
  await gm.keyboard.press('Alt+p');
  const actionField = win.getByLabel(/^Action/);
  await expect(actionField).toBeFocused();
  await actionField.fill('Covered the retreat');
  await win.getByRole('checkbox', { name: '[Archer’s Eye]' }).check();
  await win.getByRole('button', { name: 'Log practice', exact: true }).click();
  await expect(win.getByRole('status')).toHaveText('Logged for Jake: Covered the retreat');
  await expect(win).toContainText('To review (0)');

  // End of scene: one character at a time, then done.
  await win.getByRole('button', { name: 'End scene: log practice' }).click();
  const prompt = win.getByTestId('scene-prompt');
  await expect(prompt).toContainText('what did Jake practise? (1 of 2)');
  await actionField.fill('Climbed the rib');
  await win.getByLabel('Stat').selectOption('endurance');
  await win.getByRole('button', { name: 'Log practice', exact: true }).click();
  await expect(prompt).toContainText('what did Kim practise? (2 of 2)');
  await expect(win.getByLabel('Character')).toHaveValue('kim');
  await gm.screenshot({ path: path.join(shots, 'gm-scene-prompt-1366x768.png') });
  await win.getByRole('button', { name: 'Nothing for Kim' }).click();
  await expect(prompt).toHaveCount(0);

  // Phone width: no sideways scroll.
  await gm.setViewportSize({ width: 390, height: 844 });
  await win.scrollIntoViewIfNeeded();
  const overflow = await gm.evaluate(() => {
    const d = (
      globalThis as unknown as {
        document: { documentElement: { scrollWidth: number; clientWidth: number } };
      }
    ).document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  await win.screenshot({ path: path.join(shots, 'gm-practice-390x844.png') });
  expect(errors).toEqual([]);
});
