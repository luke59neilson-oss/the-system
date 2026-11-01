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
interface Node0 {
  readonly nodeType: number;
  readonly textContent: string | null;
}
interface El extends Node0 {
  readonly tagName: string;
  readonly className: string;
  readonly childNodes: ArrayLike<Node0>;
  closest(sel: string): El | null;
  getBoundingClientRect(): { width: number; height: number };
}
declare const document: { querySelectorAll(sel: string): ArrayLike<El> };

/** themes.css `.theme-platinum --metal-hi` (QF.63). */
const PLATINUM_HI = '#c4e0ff';
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

/** Every visible element with its own text under 14 px on this page. */
async function smallText(phone: Page): Promise<string[]> {
  return phone.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      // A portrait's initial is a picture, not text to read.
      if (el.closest('.portrait')) continue;
      const own = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '',
      );
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 14) out.push(`${el.tagName.toLowerCase()}.${el.className} ${px}px`);
    }
    return out;
  });
}

test('no text under 14 px on a phone; platinum highlight is blue', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await demo(gm);
  // Every demo character's whole screen: status, inventory, practice, notes,
  // bestiary and the rest all sit on the one phone page.
  for (const who of ['jake', 'miranda', 'casper', 'sultan']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${server.url}/play/demo-${who}`);
    await expect(page.getByTestId('connection')).toHaveText('Connected');
    await expect(page.getByTestId('name')).toBeVisible();
    expect(await smallText(page), who).toEqual([]);
    await page.close();
  }
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${server.url}/play/demo-jake`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  // ux-12: the toggle's name is "Sound"; its state is aria-pressed alone.
  const sound = phone.getByRole('button', { name: 'Sound', exact: true });
  await expect(sound).toHaveAttribute('aria-pressed', /true|false/);
  await expect(sound).toHaveText(/^Sound: (on|off)$/);
  // The same status window in silver, then platinum, for a side-by-side look.
  const metal = async (theme: string) => {
    await phone.getByTestId('status').evaluate((el, t) => {
      for (const c of [...el.classList]) if (c.startsWith('theme-')) el.classList.remove(c);
      el.classList.add(`theme-${t}`);
    }, theme);
    return phone
      .getByTestId('status')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--metal-hi').trim().toLowerCase());
  };
  const silverHi = await metal('silver');
  await phone.screenshot({ path: path.join(shots, 'player-silver-390x844.png') });
  const platinumHi = await metal('platinum');
  expect(platinumHi).toBe(PLATINUM_HI);
  expect(platinumHi).not.toBe(silverHi);
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
