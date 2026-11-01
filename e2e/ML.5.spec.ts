import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// ML.5 (DESIGN §6, Q85): a hand-written copy carries its own cost, cooldown,
// range and casting notes; Cast spends the copy's cost; Use library text
// returns it to the library's.

const GM_KEY = 'e2e-gm-key-ml5-0123456789abcdef0005';
const shots = path.resolve(import.meta.dirname, '../docs/screens/ML.5');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});
test.afterEach(async () => {
  await server.stop();
});

test("the GM gives one character's copy its own cost; Use library text returns it", async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Copy');
  await gm.getByLabel(/Start with the default classes/).uncheck();
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await expect(gm.getByRole('tablist', { name: 'Console tabs' })).toBeVisible();
  const command = (c: Record<string, unknown>) =>
    gm.evaluate(
      ({ key, c }) =>
        new Promise<string>((resolve) => {
          const ws = new WebSocket(
            `ws://${(globalThis as unknown as { location: { host: string } }).location.host}/ws`,
          );
          ws.onmessage = (e) => {
            const m = JSON.parse(String(e.data)) as { type: string; ok?: boolean; error?: string };
            if (m.type === 'hello')
              ws.send(JSON.stringify({ type: 'join', role: 'gm', gmKey: key }));
            if (m.type === 'joined')
              ws.send(JSON.stringify({ type: 'command', requestId: 'x', command: c }));
            if (m.type === 'result') {
              ws.close();
              resolve(m.ok ? 'ok' : (m.error ?? 'failed'));
            }
          };
        }),
      { key: GM_KEY, c },
    );
  expect(
    await command({
      type: 'skillDef.define',
      id: 'bolt',
      name: 'Arcane Bolt',
      rarity: 'common',
      tags: ['spell'],
      description: 'A bolt of raw mana.',
      cost: { pool: 'mp', amount: 40 },
      cooldown: '1 round',
    }),
  ).toBe('ok');
  expect(
    await command({
      type: 'character.create',
      id: 'jake',
      name: 'Jake',
      className: 'Caster',
      classSkills: [
        { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
        { name: 'Basic Stealth', rarity: 'inferior' },
        { name: 'Arcane Bolt', rarity: 'common' },
      ],
    }),
  ).toBe('ok');

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await phone
    .getByTestId('skills-class')
    .getByRole('button', { name: /Arcane Bolt/ })
    .click();
  const detail = phone.getByTestId('skill-detail');
  const cast = detail.getByTestId('skill-cast');
  await expect(cast).toHaveText('Cast (40 MP)');

  await openWindow(gm, 'skill-text');
  const form = gm.locator('form[aria-labelledby="skill-text"]');
  await form.getByLabel('Character').selectOption({ label: 'Jake' });
  await form.getByLabel('Skill').selectOption('Arcane Bolt');
  const own = form.getByTestId('copy-casting');
  await expect(own.getByTestId('copy-casting-source')).toContainText('Follows the library');
  await expect(own.getByLabel('Cost per use')).toHaveValue('40');
  await own.getByLabel('Cost per use').fill('nope');
  await expect(own.getByRole('alert')).toContainText('whole cost');
  await expect(own.getByRole('button', { name: 'Save own casting' })).toBeDisabled();
  await own.getByLabel('Cost per use').fill('5');
  await own.getByLabel('Cooldown (shown, not enforced)').fill('2 rounds');
  await own.getByRole('button', { name: 'Save own casting' }).click();
  await expect(own.getByTestId('copy-casting-source')).toContainText('own casting');
  await expect(form.getByTestId('skill-text-source')).toHaveText('Hand-written text.');
  await own.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-own-casting-1366x768.png') });

  // The phone follows; Cast spends the copy's cost.
  await expect(cast).toHaveText('Cast (5 MP)');
  await expect(detail.getByTestId('skill-detail-cooldown')).toHaveText('2 rounds');
  await cast.click();
  await expect(detail.getByTestId('skill-cast-pool')).toHaveText('MP 95/100');
  await phone.screenshot({ path: path.join(shots, 'player-own-cost-390x844.png') });

  // Use library text returns the library's cost, and the fields follow it.
  await form.getByRole('button', { name: 'Use library text' }).click();
  await expect(own.getByTestId('copy-casting-source')).toContainText('Follows the library');
  await expect(own.getByLabel('Cost per use')).toHaveValue('40');
  await expect(cast).toHaveText('Cast (40 MP)');
  await expect(detail.getByTestId('skill-detail-cooldown')).toHaveText('1 round');
});
