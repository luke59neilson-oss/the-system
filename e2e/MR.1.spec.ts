import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MR.1 Evolutions re-rate skills (DESIGN §6, L14): the player's evolution
// screen lists each skill's old → new rarity before choosing; after the
// evolution the sheet shows the new labels.

const GM_KEY = 'e2e-gm-key-mr1-0123456789abcdef01';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MR.1');
let server: RunningServer;

// One server per test, so neither viewport depends on the other's campaign.
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

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`the evolution screen shows the re-rating (${viewport.width}x${viewport.height})`, async ({
    browser,
  }) => {
    const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const gmErrors = watchErrors(gm);
    gm.on('dialog', (d) => void d.accept());
    await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
    await gm.getByLabel('Campaign name').fill(`Rerate ${viewport.width}`);
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    await gm.getByRole('button', { name: 'Load demo campaign' }).click();
    await expect(gm.getByTestId('demo-badge')).toBeVisible();

    const page = await browser.newPage({ viewport });
    const errors = watchErrors(page);
    await page.goto(server.url);
    await page.getByRole('link', { name: /Sultan/ }).click();
    await gmCommand(gm, {
      type: 'xp.award',
      amount: 2000,
      track: 'class',
      participants: [{ characterId: 'demo-sultan' }],
    });
    await expect(page.getByTestId('race')).toContainText('(G)');
    await expect(page.getByTestId('skills-race')).toContainText('[Identify (Common)]');
    // The GM keeps Identify at Common; every other skill takes the default drop.
    await gmCommand(gm, {
      type: 'evolution.release',
      characterId: 'demo-sultan',
      options: [{ className: 'Longbow Adept', description: 'Distance is a weapon.' }],
      rerate: { Identify: 'common' },
    });
    await page.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
    const dialog = page.getByTestId('evolution');
    const rerate = dialog.getByTestId('evolution-rerate');
    await expect(rerate).toContainText('Your skills are re-rated for F-grade');
    await expect(rerate).toContainText('Text and mastery marks stay');
    await expect(rerate.getByRole('listitem').filter({ hasText: 'Identify' })).toHaveText(
      '[Identify] stays Common',
    );
    const lines = await rerate.getByRole('listitem').allTextContents();
    expect(lines.length).toBeGreaterThan(1);
    const dropped = lines.filter((l) => l.includes('→'));
    expect(dropped.length).toBeGreaterThan(0);
    await page.screenshot({
      path: path.join(shots, `player-evolution-rerate-${viewport.width}x${viewport.height}.png`),
    });

    // One dropped skill, to check the sheet afterwards: "[Name] Common → Inferior".
    const match = /^\[(.+)\] (\w+) → (\w+)$/.exec(dropped[0] ?? '');
    expect(match).not.toBeNull();
    const [, name, , to] = match as unknown as [string, string, string, string];

    await dialog.getByRole('button', { name: 'Choose Longbow Adept' }).click();
    await dialog.getByRole('button', { name: 'Evolve' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('race')).toContainText('(F)');
    await expect(page.getByTestId('skills-race')).toContainText('[Identify (Common)]');
    await expect(page.getByText(`[${name} (${to})]`)).toBeVisible();

    expect(errors).toEqual([]);
    expect(gmErrors).toEqual([]);
  });
}
