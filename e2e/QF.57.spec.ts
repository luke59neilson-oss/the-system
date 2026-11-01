import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.57: plain words for players (evolution text and log, the practice form).
const GM_KEY = 'e2e-gm-key-qf57-0123456789abcdef57';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.57');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

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

test('the evolution says what happens to skills in plain words', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Words');
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
  await builder.getByLabel('Class only (one choice)').check();
  const form = builder.getByRole('form', { name: 'Evolution release' });
  await form.getByRole('group', { name: 'Option 1' }).getByLabel('Class name').fill('Far Shot');
  const list = form.getByRole('list', { name: 'Re-rating' });
  await list.getByLabel(/Archer.s Eye/).selectOption({ label: 'Inferior' });
  await form.getByLabel(/Approve this re-rating/).check();
  await form.getByRole('button', { name: 'Release evolution' }).click();
  await expect(builder.getByRole('status')).toHaveText('Evolution released to Sultan');

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${server.url}/play/demo-sultan`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await phone.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
  const rerate = phone.getByTestId('evolution').getByTestId('evolution-rerate');
  // ML.3: Luke's re-rating words, word for word (DESIGN §6, Q97).
  await expect(rerate.getByTestId('rerate-message')).toHaveText(
    'While once powerful and rare for your previous grade, the power and rarity of your skills are less in comparison to your current grade. Some skill rarities have been adjusted to amend this.',
  );
  await expect(rerate).toContainText(
    'Your skills keep their text and progress; their rarity label changes for F-grade.',
  );
  await expect(rerate).toContainText('An upgrade starts that skill’s progress at 0.');
  await expect(rerate).toContainText(/\[Archer.s Eye\] is now Inferior \(was Common\)/);
  const text = (await rerate.textContent()) ?? '';
  for (const jargon of ['re-rated', 'transforms', 'mastery marks', '→']) {
    expect(text, `no "${jargon}" for players`).not.toContain(jargon);
  }
  await rerate.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'evolution-words-390x844.png') });
});

test('the practice form shows its problem only after a submit', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Words');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${server.url}/play/demo-jake`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await phone.getByTestId('practice-log').locator('summary').click();
  const form = phone.getByTestId('practice-form');
  await expect(form.getByTestId('practice-form-action')).toBeVisible();
  await expect(form.getByRole('alert')).toHaveCount(0);
  await form.getByTestId('practice-form-submit').click();
  await expect(form.getByRole('alert')).toHaveText('Say what you did');
  await form.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'practice-submit-390x844.png') });
});
