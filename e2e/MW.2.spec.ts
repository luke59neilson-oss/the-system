import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MW.2 (DESIGN §6, §11): the co-DM (recorded fake) drafts options from a stat;
// they land as editable rows, the flagged spell blocks sending until it has a
// cost, and the edited menu reaches the player.

const GM_KEY = 'e2e-gm-key-mw2-0123456789abcdef0002';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MW.2');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY, THE_SYSTEM_E2E_FAKE_AI: '1' });
});

test.afterEach(async () => {
  await server.stop();
});

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

test('draft from Perception, fix the flag, edit, offer; the player sees the menu', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Offers');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  const saved = await gm.request.put(`${server.url}/api/gm/ai/key`, {
    headers: { 'x-gm-key': GM_KEY },
    data: { key: 'sk-ant-e2e-mw2-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);
  await gmCommand(gm, {
    type: 'xp.award',
    track: 'class',
    amount: 8 * 2700,
    participants: [{ characterId: 'demo-jake' }],
  });

  const frames: string[] = [];
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  phone.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');

  const builder = gm.locator('section[aria-labelledby="offer-builder"]');
  await openWindow(gm, 'offer-builder');
  await builder.getByLabel('Character').selectOption({ label: 'Jake' });
  const menu = builder.getByRole('form', { name: 'Selection menu' });
  const row = (n: number) => menu.getByRole('group', { name: `Option ${n}`, exact: true });
  const send = menu.getByRole('button', { name: 'Send menu' });

  await menu.getByTestId('offer-drafts').getByLabel('Stat').selectOption({ label: 'Perception' });
  await menu.getByRole('button', { name: 'Draft from stat' }).click();
  await expect(menu.getByTestId('draft-note')).toContainText('3 drafts added');
  await expect(row(1).getByLabel('Name')).toHaveValue('Keen Sight');
  await expect(row(3).getByLabel('Name')).toHaveValue('Mana Lens');

  // The spell has no cost: flagged, and the menu cannot go.
  await expect(menu.getByTestId('draft-flags-2')).toContainText('A spell needs a cost');
  await expect(send).toBeDisabled();
  await builder.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-drafts-flagged-1366x768.png') });

  await row(3).getByRole('textbox', { name: 'Option 3 cost' }).fill('5');
  await expect(menu.getByTestId('draft-flags-2')).toHaveCount(0);
  await row(1).getByLabel('Name').fill('Keener Sight');
  await expect(send).toBeEnabled();
  const framesBeforeSend = frames.length;
  await send.click();
  await expect(builder.getByRole('status')).toContainText('Menu sent to Jake');
  await expect(builder.getByTestId('pending-menu')).toContainText('[Keener Sight');

  // The player sees the edited menu; drafts never went out before it was sent.
  // Older selections from the demo and the award come first: settle them.
  await expect(phone.getByRole('button', { name: '[Choose]' })).toBeVisible();
  const dialog = phone.getByRole('dialog');
  const edited = dialog.getByRole('button', { name: 'Choose Keener Sight' });
  for (let opened = 0; ; opened += 1) {
    expect(opened).toBeLessThan(12);
    await phone.getByRole('button', { name: '[Choose]' }).click();
    await expect(dialog.getByRole('button', { name: /^Choose / }).first()).toBeVisible();
    if (await edited.isVisible()) break;
    await dialog
      .getByRole('button', { name: /^Choose / })
      .first()
      .click();
    await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(dialog).toHaveCount(0);
  }
  await expect(dialog.getByRole('button', { name: 'Choose Mana Lens' })).toBeVisible();
  expect(frames.slice(0, framesBeforeSend).join('')).not.toContain('Mana Lens');
  expect(frames.join('')).not.toContain('Keen Sight');
  await phone.screenshot({ path: path.join(shots, 'player-menu-390x844.png') });

  // The spell's cost reached its library entry: once chosen, it can be cast.
  await dialog.getByRole('button', { name: 'Choose Mana Lens' }).click();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(dialog).toHaveCount(0);
  await phone.getByRole('button', { name: /Mana Lens/ }).click();
  await expect(
    phone.getByTestId('skill-detail').getByRole('button', { name: /^Cast/ }),
  ).toHaveText(/^Cast \(5 /);
});
