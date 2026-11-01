import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.62: Low fixes with a screen: the transform cost hint, the reveal notice.
const GM_KEY = 'e2e-gm-key-qf62-0123456789abcdef62';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.62');
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

async function demo(gm: Page): Promise<void> {
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Lows');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
}

test('a transform that renames a spell says it loses Cast', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await demo(gm);
  await gmCommand(gm, {
    type: 'skillDef.define',
    id: 'spark-bolt',
    name: 'Spark Bolt',
    rarity: 'common',
    tags: ['spell'],
    cost: { pool: 'mp', amount: 10 },
  });
  await gmCommand(gm, {
    type: 'skill.grant',
    characterId: 'demo-sultan',
    name: 'Spark Bolt',
    rarity: 'common',
    kind: 'class',
  });
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
  const option = form.getByRole('group', { name: 'Option 1' });
  await option.getByRole('button', { name: 'Add transform' }).click();
  const row = option.getByRole('group', { name: 'Transform 1' });
  await row.getByLabel('Skill').selectOption({ label: 'Spark Bolt' });
  await row.getByLabel('New name').fill('Spark Bolt');
  await expect(option.getByTestId('transform-cost-hint')).toHaveCount(0);
  await row.getByLabel('New name').fill('Hawk Eye');
  await expect(option.getByTestId('transform-cost-hint')).toHaveText(
    '[Spark Bolt] has a cost to cast; [Hawk Eye] has none until you give it a Skill library entry, so the player cannot Cast it.',
  );
  await row.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'transform-cost-hint-1366x768.png') });
});

test('revealing an Identify entry tells the player', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await demo(gm);
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${server.url}/play/demo-sultan`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await gmCommand(gm, {
    type: 'entity.define',
    entityId: 'qf62-stalker',
    name: 'Ridge Stalker',
    grade: 'G',
    level: 2,
    tiers: [{ minRarity: 'common', text: '[Ridge Stalker]' }],
  });
  await gmCommand(gm, {
    type: 'entity.reveal',
    entityId: 'qf62-stalker',
    characterIds: ['demo-sultan'],
  });
  await expect(phone.getByText(/New Identify entry: .*Ridge Stalker/).first()).toBeVisible();
  await phone.screenshot({ path: path.join(shots, 'reveal-notice-390x844.png') });
});
