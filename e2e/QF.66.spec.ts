import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.66 (DESIGN §7 backups, §9a campaigns and backups): when the GM opens a
// restored copy of the campaign, a phone whose character is in the copy is
// told its sheet now shows that copy; a phone whose character the copy lacks
// says why it is waiting, and rejoins when the GM switches back.

const GM_KEY = 'e2e-gm-key-qf66-0123456789abcdef0';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.66');
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
  { name: "Archer's Eye", rarity: 'common' },
];

async function joinAs(page: Page, name: string): Promise<void> {
  await page.goto(server.url);
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
}

test('opening a restored copy tells each phone what happened to its sheet', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gmCommand(gm, {
    type: 'character.create',
    id: 'jake',
    name: 'Jake',
    className: 'Archer',
    classSkills: kit,
  });

  // A backup that has Jake but not Kim.
  await openWindow(gm, 'campaign-backups');
  const win = gm.locator('section[aria-labelledby="campaign-backups"]');
  await win.getByRole('button', { name: 'Back up now' }).click();
  await expect(win.getByTestId('backup-row')).toHaveCount(1);
  await gmCommand(gm, {
    type: 'character.create',
    id: 'kim',
    name: 'Kim',
    className: 'Archer',
    classSkills: kit,
  });

  const jake = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const kim = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const jakeErrors = watchErrors(jake);
  const kimErrors = watchErrors(kim);
  await joinAs(jake, 'Jake');
  await joinAs(kim, 'Kim');
  await expect(jake.getByTestId('campaign-switched')).toHaveCount(0);

  // The confirm says what really happens to the phones.
  const confirms: string[] = [];
  gm.on('dialog', (d) => confirms.push(d.message()));
  await win
    .getByTestId('backup-row')
    .getByRole('button', { name: /^Restore / })
    .click();
  const restored = win.getByTestId('restored');
  await expect(restored.getByRole('status')).toContainText('Restored as campaign “main-restored”');
  await restored.getByRole('button', { name: 'Open restored campaign' }).click();
  await expect(gm.getByTestId('restored-badge')).toHaveText('Restored campaign “main-restored”');
  expect(confirms.join('\n')).toContain(
    "a character in this copy shows this copy's sheet; a character not in it waits until you switch back",
  );

  // Jake is in the copy: his phone follows it and says so.
  const notice = jake.getByTestId('campaign-switched');
  await expect(notice).toContainText(
    '[The GM opened another copy of the campaign. Your sheet now shows that copy.]',
  );
  await expect(jake.getByTestId('connection')).toHaveText('Connected');
  await jake.screenshot({ path: path.join(shots, 'player-campaign-switched-390x844.png') });
  // Kim is not: her phone says why it waits, with a way out.
  await expect(kim.getByText(/which does not have your character/)).toHaveText(
    'The GM has opened another campaign, which does not have your character. This screen rejoins when they switch back; or use Switch character.',
  );
  await expect(kim.getByRole('link', { name: 'Switch character' })).toBeVisible();
  await kim.screenshot({ path: path.join(shots, 'player-not-in-copy-390x844.png') });
  await gm.screenshot({ path: path.join(shots, 'gm-restored-open-1366x768.png') });

  // OK clears Jake's notice.
  await notice.getByRole('button', { name: 'OK' }).click();
  await expect(notice).toHaveCount(0);

  // Back to the main campaign: Kim rejoins on her own; Jake is told again.
  await gm.getByRole('button', { name: 'Back to my campaign' }).click();
  await expect(gm.getByTestId('restored-badge')).toHaveCount(0);
  await expect(kim.getByTestId('connection')).toHaveText('Connected', { timeout: 15_000 });
  await expect(kim.getByText(/which does not have your character/)).toHaveCount(0);
  await expect(notice).toBeVisible();

  expect(gmErrors).toEqual([]);
  expect(jakeErrors).toEqual([]);
  expect(kimErrors).toEqual([]);
});
