import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.11 Practice and montage: players log practice entries (action + skill
// and/or stat) and give a one-line focus when the GM offers a montage. The
// demo offers "Crossing the black marsh" to Jake and Miranda on a GM-only clock.

const GM_KEY = 'e2e-gm-key-m311-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.11');
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterAll(async () => {
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

/** Every WebSocket frame the page receives, as text. */
function watchFrames(page: Page) {
  const frames: string[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => frames.push(String(f.payload)));
  });
  return frames;
}

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

test('players log practice and give montage focuses, live', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Practice Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  // Jake: the open montage offer and his earlier practice entry.
  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(laptop);
  const jakeFrames = watchFrames(laptop);
  await laptop.goto(server.url);
  await laptop.getByRole('link', { name: /Jake/ }).click();
  const practice = laptop.getByTestId('practice');
  const montage = practice.getByTestId('montage');
  await expect(montage).toContainText('Crossing the black marsh');
  await expect(practice.getByTestId('practice-entry')).toHaveText([
    /Shot at moving targets from the trees\s+Perception · by you/,
  ]);

  // A focus needs a skill or stat; then it is sent and shown.
  await montage.getByTestId('montage-form-action').fill('Scout for dry ground ahead');
  await montage.getByTestId('montage-form-submit').click();
  await expect(montage.getByRole('alert')).toHaveText('Pick a skill or a stat');
  await montage.getByTestId('montage-form-stat').selectOption({ label: 'Perception' });
  await montage.getByTestId('montage-form-submit').click();
  await expect(montage.getByTestId('montage-focus')).toContainText('Scout for dry ground ahead');
  await expect(practice.getByTestId('practice-entry').first()).toContainText(
    'Perception · montage focus',
  );

  // A practice entry with two skills used together.
  await practice.getByTestId('practice-log').locator('summary').click();
  const form = practice.getByTestId('practice-form');
  await form.getByTestId('practice-form-action').fill('Fired while sneaking');
  const skillBoxes = form.getByRole('checkbox');
  await skillBoxes.nth(0).check();
  await skillBoxes.nth(1).check();
  await form.getByTestId('practice-form-submit').click();
  await expect(practice.getByTestId('practice-notice')).toHaveText('Practice logged for the GM.');
  await expect(practice.getByTestId('practice-entry').first()).toContainText(
    'Fired while sneaking',
  );
  await expect(form.getByTestId('practice-form-action')).toHaveValue('');
  await practice.scrollIntoViewIfNeeded();
  await laptop.screenshot({ path: path.join(shots, 'player-practice-1366x768.png') });

  // Miranda on a phone: her own offer (no focus yet), right after the quests.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  const mirandaFrames = watchFrames(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Miranda/ }).click();
  const phonePractice = phone.getByTestId('practice');
  await expect(phonePractice.getByTestId('montage-form')).toBeVisible();
  await expect(phonePractice.getByTestId('practice-entry')).toHaveCount(0);
  const order = await phone.evaluate(() => {
    const d = (
      globalThis as unknown as {
        document: {
          querySelector: (s: string) => { getBoundingClientRect: () => { top: number } } | null;
        };
      }
    ).document;
    const top = (s: string) => d.querySelector(s)?.getBoundingClientRect().top ?? -1;
    return [
      top('[data-testid=quests]'),
      top('[data-testid=practice]'),
      top('[data-testid=inventory]'),
    ];
  });
  expect(order[0]).toBeLessThan(order[1] ?? 0);
  expect(order[1]).toBeLessThan(order[2] ?? 0);
  await phonePractice.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'player-practice-390x844.png') });

  // The GM closes the montage: the offer leaves both screens live.
  await gmCommand(gm, { type: 'montage.close', montageId: 'demo-montage-marsh' });
  await expect(phonePractice.getByTestId('montage')).toHaveCount(0);
  await expect(practice.getByTestId('montage')).toHaveCount(0);

  // Players never get the GM-only clock, nor each other's practice.
  for (const frame of [...jakeFrames, ...mirandaFrames]) {
    expect(frame).not.toContain('Cross the marsh');
    expect(frame).not.toContain('demo-clock-marsh');
  }
  for (const frame of mirandaFrames) {
    expect(frame).not.toContain('Scout for dry ground');
    expect(frame).not.toContain('Fired while sneaking');
  }

  expect(errors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
