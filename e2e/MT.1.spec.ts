import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MT.1 (DESIGN §6, L19): the evolution builder lists each kept skill at the
// rarity it has going in; the GM sets each one and approves the list, and the
// release is refused until then. Identify is never offered below its rarity.

const GM_KEY = 'e2e-gm-key-mt1-0123456789abcdefmt1';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MT.1');
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

/** Runs one GM command over the GM page's own origin (XP award set-up only). */
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

test('the GM sets and approves the re-rating; the player sees it', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Approve');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  await gmCommand(gm, {
    type: 'xp.award',
    track: 'class',
    amount: 4 * 100,
    participants: [{ characterId: 'demo-sultan' }],
  });
  const builder = gm.locator('section[aria-labelledby="evolution-builder"]');
  await openWindow(gm, 'evolution-builder');
  await expect(builder.getByLabel('Character')).toHaveValue('demo-sultan');
  const form = builder.getByRole('form', { name: 'Evolution release' });
  await form.getByRole('group', { name: 'Option 1' }).getByLabel('Class name').fill('Far Shot');

  // Every skill starts at the rarity it has now; nothing drops on its own.
  const list = form.getByRole('list', { name: 'Re-rating' });
  const eye = list.getByLabel(/Archer.s Eye/);
  await expect(eye).toHaveValue('common');
  const identify = list.getByLabel(/Identify/);
  await expect(identify).toHaveValue('common');
  // Identify never drops: Inferior is not offered.
  expect(await identify.locator('option').allTextContents()).not.toContain('Inferior');

  // Refused until approved; any change after approving needs approving again.
  const release = form.getByRole('button', { name: 'Release evolution' });
  const problem = form.getByTestId('release-problem');
  const approve = form.getByLabel(/Approve this re-rating/);
  await expect(release).toBeDisabled();
  await expect(problem).toHaveText('Approve the skill re-rating before releasing.');
  await approve.check();
  await expect(problem).toHaveCount(0);
  await eye.selectOption({ label: 'Inferior' });
  await expect(approve).not.toBeChecked();
  await expect(release).toBeDisabled();
  await approve.check();
  await expect(release).toBeEnabled();
  await approve.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await gm.screenshot({ path: path.join(shots, 'gm-rerate-approve-1366x768.png') });
  await release.click();
  await expect(builder.getByRole('status')).toHaveText('Evolution released to Sultan');

  // The player sees the approved list: one lowered, the rest stay.
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerErrors = watchErrors(player);
  await player.goto(server.url);
  await player.getByRole('link', { name: /Sultan/ }).click();
  await player.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
  const dialog = player.getByTestId('evolution');
  const rerate = dialog.getByTestId('evolution-rerate');
  await expect(rerate).toContainText(/\[Archer.s Eye\] Common → Inferior/);
  await expect(rerate.getByRole('listitem').filter({ hasText: 'Identify' })).toHaveText(
    '[Identify] stays Common',
  );
  const lines = await rerate.getByRole('listitem').allTextContents();
  expect(lines.filter((l) => l.includes('→'))).toHaveLength(1);
  await rerate.scrollIntoViewIfNeeded();
  await player.screenshot({ path: path.join(shots, 'player-rerate-390x844.png') });
  await dialog.getByRole('button', { name: 'Choose Far Shot' }).click();
  await dialog.getByRole('button', { name: 'Evolve' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(player.getByTestId('race')).toContainText('(F)');
  await expect(player.getByTestId('skills-class')).toContainText(/Archer.s Eye \(Inferior\)/);
  await expect(player.getByTestId('skills-race')).toContainText('[Identify (Common)]');
  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});
