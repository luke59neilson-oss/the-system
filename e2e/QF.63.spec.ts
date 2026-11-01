import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.63: Low fixes on screens (deep review ux-9, ux-10): a 14 px floor for
// the small text on phones; platinum's ring highlight reads blue, not white;
// change-log rows with no Undo say why (ux-11).
// The e2e tsconfig has no DOM lib; these browser globals run inside evaluate().
declare const getComputedStyle: (el: unknown) => {
  fontSize: string;
  getPropertyValue(name: string): string;
};
declare const document: { querySelectorAll(sel: string): ArrayLike<unknown> };

const GM_KEY = 'e2e-gm-key-qf63-0123456789abcdef63';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.63');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

async function demo(gm: Page): Promise<void> {
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Screens');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
}

const SMALL = [
  '.choices .tag',
  '.pane-mode .skills',
  '.feed .when',
  '.sound-toggle',
  '.ding-more',
  '.stats .stat-bonus',
  '.library-tags .tag',
  '.flag-owner',
  '.faction-revealed',
];

test('no small text under 14 px on a phone; platinum highlight is blue', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await demo(gm);
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${server.url}/play/demo-jake`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  const sizes = await phone.evaluate((selectors) => {
    const out: { sel: string; px: number }[] = [];
    for (const sel of selectors)
      for (const el of Array.from(document.querySelectorAll(sel)))
        out.push({ sel, px: parseFloat(getComputedStyle(el).fontSize) });
    return out;
  }, SMALL);
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.filter((s) => s.px < 14)).toEqual([]);
  await phone.getByTestId('status').evaluate((el) => {
    for (const c of [...el.classList]) if (c.startsWith('theme-')) el.classList.remove(c);
    el.classList.add('theme-platinum');
  });
  const hi = await phone
    .getByTestId('status')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--metal-hi').trim());
  expect(hi.toLowerCase()).toBe('#d6ecff');
  await phone.screenshot({ path: path.join(shots, 'player-platinum-390x844.png') });
  await gm.close();
});

test('a change-log row with no Undo says why', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Fresh');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await openWindow(gm, 'change-log');
  const log = gm.locator('section[aria-labelledby="change-log"]');
  await expect(log.getByTestId('no-undo').first()).toHaveText('No undo: it starts the campaign');
  await log.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'change-log-no-undo-1366x768.png') });
});
