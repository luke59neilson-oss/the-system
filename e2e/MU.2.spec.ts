import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MU.2 (DESIGN §7 "Player log"): a GM change to a character reaches the
// player as a pop-up and a running-log line, and View as shows the same.

const GM_KEY = 'e2e-gm-key-mu2-0123456789abcdef0002';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MU.2');
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

test('the GM gives an item: a pop-up and a log line on the phone and in View as', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Player log');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gmCommand(gm, {
    type: 'character.create',
    id: 'jake',
    name: 'Jake',
    className: 'Archer',
    classSkills: kit,
  });
  await gmCommand(gm, { type: 'item.define', id: 'fang', name: 'Hunter Fang', rarity: 'common' });

  // Jake's phone is open.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  const log = phone.getByTestId('running-log');
  await expect(log).toContainText('What the System does to you shows here');

  // The GM looks through Jake's eyes while giving the item.
  await gm
    .getByRole('navigation', { name: 'View as' })
    .getByRole('button', { name: 'Jake' })
    .click();
  const pane = gm.frameLocator('iframe[title="Jake (player view)"]');
  await expect(pane.getByTestId('connection')).toHaveText('Connected');

  await gm.getByRole('navigation', { name: 'View as' }).getByRole('button', { name: 'GM' }).click();
  await openWindow(gm, 'item-library');
  const items = gm.locator('[data-window="item-library"]');
  await items
    .getByRole('list', { name: 'Library items' })
    .getByRole('button', { name: /Hunter Fang/ })
    .click();
  const give = items.getByRole('group', { name: 'Give or take [Hunter Fang]' });
  await give.getByLabel('Character').selectOption({ label: 'Jake' });
  await give.getByLabel('Count').fill('2');
  await give.getByLabel('Reason (the player sees this)').fill('Spoils of the hunt');
  await give.getByRole('button', { name: 'Give' }).click();

  const line = 'You received [Hunter Fang] ×2 from the GM: Spoils of the hunt';
  // The phone: a pop-up and the newest log line.
  await expect(phone.getByTestId('ding-toast')).toContainText(line);
  await expect(log.getByRole('listitem').first()).toContainText(line);
  await phone.screenshot({ path: path.join(shots, 'player-log-390x844.png') });
  await expect(phone.getByTestId('full-history')).toHaveAttribute('href', '#dings');

  // A sheet change the GM makes is in the log too, newest first.
  await gmCommand(gm, { type: 'character.setStats', characterId: 'jake', stats: { strength: 14 } });
  await expect(log.getByRole('listitem').first()).toContainText(
    'The GM set your stats: Strength 1.0 → 1.4',
  );
  await expect(log.getByRole('listitem').nth(1)).toContainText(line);

  // View as: the same log, and pop-ups (muted) for what arrives while it is open.
  await gm
    .getByRole('navigation', { name: 'View as' })
    .getByRole('button', { name: 'Jake' })
    .click();
  const paneLog = pane.getByTestId('running-log');
  await expect(paneLog.getByRole('listitem').first()).toContainText('The GM set your stats');
  await expect(paneLog.getByRole('listitem').nth(1)).toContainText(line);
  await gmCommand(gm, {
    type: 'holdings.adjust',
    characterId: 'jake',
    items: { fang: 1 },
    reason: 'One more',
  });
  const more = 'You received [Hunter Fang] from the GM: One more';
  await expect(pane.getByTestId('ding-toast')).toContainText(more);
  await expect(paneLog.getByRole('listitem').first()).toContainText(more);
  await expect(log.getByRole('listitem').first()).toContainText(more);
  await gm.screenshot({ path: path.join(shots, 'gm-view-as-1366x768.png') });

  expect(gmErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
});
