import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MU.4 Spells: skills with costs (DESIGN §6). The GM makes a spell in the
// skill library form (cost pool and amount, cooldown, range, casting notes,
// the "spell" tag); its owner sees the cost on their skill list and the
// details in the skill dialog; other players never receive them.

const GM_KEY = 'e2e-gm-key-mu4-0123456789abcdef';
const CANARY = 'CASTING-NOTES-CANARY-MU4';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MU.4');
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

function watchFrames(page: Page) {
  const frames: string[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => frames.push(String(f.payload)));
  });
  return frames;
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const d = (
      globalThis as unknown as {
        document: { documentElement: { scrollWidth: number; clientWidth: number } };
      }
    ).document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

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

test('the GM creates a spell; its owner sees the cost, other players never do', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Spell Test');
  await gm.getByLabel(/Start with the default classes/).uncheck();
  await gm.getByRole('button', { name: 'Create campaign' }).click();

  const library = gm.locator('section[aria-labelledby="skill-library"]');
  await openWindow(gm, 'skill-library');
  await library.getByLabel('Official name').fill('Arcane Bolt');
  await library.getByLabel('Rarity').selectOption({ label: 'Common' });
  await library.getByLabel('Description (players see this)').fill('A bolt of raw mana.');
  const spell = library.getByTestId('spell-fields');
  await spell.getByRole('checkbox', { name: /Spell/ }).check();
  await spell.getByLabel('Cost pool').selectOption({ label: 'Mana Points (MP)' });
  // A cost that is not a whole number is refused before anything is sent.
  await spell.getByLabel('Cost per use').fill('1.5');
  await expect(spell.getByRole('alert')).toHaveText(/whole number/);
  await expect(library.getByRole('button', { name: 'Add to library' })).toBeDisabled();
  await spell.getByLabel('Cost per use').fill('15');
  await expect(spell.getByRole('alert')).toHaveCount(0);
  await spell.getByLabel(/^Cooldown/).fill('10 seconds');
  await spell.getByLabel('Range').fill('30 m');
  await spell.getByLabel('Casting notes').fill(CANARY);
  await library.screenshot({ path: path.join(shots, 'gm-spell-form-1366x768.png') });
  await library.getByRole('button', { name: 'Add to library' }).click();
  await expect(library.getByRole('status')).toHaveText('[Arcane Bolt] added to the library');
  const list = library.getByRole('list', { name: 'Library skills' });
  const entry = list.getByRole('button', { name: /\[Arcane Bolt\]/ });
  await expect(entry).toContainText('15 Mana Points (MP)');
  await expect(entry).toContainText('spell');

  for (const [id, name, skill] of [
    ['jake', 'Jake', 'Arcane Bolt'],
    ['kim', 'Kim', 'Basic Archery'],
  ] as const) {
    await gmCommand(gm, {
      type: 'character.create',
      id,
      name,
      className: 'Caster',
      classSkills: [
        { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
        { name: 'Basic Stealth', rarity: 'inferior' },
        { name: skill, rarity: 'common' },
      ],
    });
  }

  const kim = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const kimErrors = watchErrors(kim);
  const kimFrames = watchFrames(kim);
  await kim.goto(server.url);
  await kim.getByRole('link', { name: /Kim/ }).click();
  await expect(kim.getByRole('button', { name: /\[Basic Archery \(Common\)\]/ })).toBeVisible();

  // Jake's phone: the cost beside the name, details in the dialog.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  const bolt = phone.getByTestId('skills-class').getByRole('button', { name: /Arcane Bolt/ });
  await expect(bolt.getByTestId('skill-cost')).toHaveText('· 15 MP');
  await noSidewaysScroll(phone);
  await phone.screenshot({ path: path.join(shots, 'player-skills-390x844.png'), fullPage: true });
  await bolt.click();
  const detail = phone.getByTestId('skill-detail');
  await expect(detail.getByTestId('skill-detail-cost')).toHaveText('15 MP per use');
  await expect(detail.getByTestId('skill-detail-cooldown')).toHaveText('10 seconds');
  await expect(detail.getByTestId('skill-detail-range')).toHaveText('30 m');
  await expect(detail.getByTestId('skill-detail-notes')).toHaveText(CANARY);
  await noSidewaysScroll(phone);
  await phone.screenshot({ path: path.join(shots, 'player-spell-390x844.png') });

  // The GM raises the cost; Jake's open dialog follows live.
  await entry.click();
  await spell.getByLabel('Cost per use').fill('20');
  await library.getByRole('button', { name: 'Save changes' }).click();
  await expect(library.getByRole('status')).toHaveText('[Arcane Bolt] saved');
  await expect(detail.getByTestId('skill-detail-cost')).toHaveText('20 MP per use');

  // Jake on a laptop.
  const jake = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const jakeErrors = watchErrors(jake);
  await jake.goto(server.url);
  await jake.getByRole('link', { name: /Jake/ }).click();
  await jake
    .getByTestId('skills-class')
    .getByRole('button', { name: /Arcane Bolt/ })
    .click();
  await expect(jake.getByTestId('skill-detail-casting')).toBeVisible();
  await jake.screenshot({ path: path.join(shots, 'player-spell-1366x768.png') });

  // Kim never received Jake's spell details.
  expect(kimFrames.length).toBeGreaterThan(0);
  expect(kimFrames.join('\n')).not.toContain(CANARY);
  expect(await kim.content()).not.toContain(CANARY);
  expect(kimFrames.join('\n')).not.toContain('10 seconds');

  expect(gmErrors).toEqual([]);
  expect(kimErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(jakeErrors).toEqual([]);
});
