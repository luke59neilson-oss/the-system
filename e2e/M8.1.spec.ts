import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M8.1 metallic grade themes (DESIGN §3, §9, D13): every grade's metal frames
// the status window with its own colour and sheen; platinum is brushed and
// cooler than silver; diamond's prism animates unless reduced motion is on.

// The e2e tsconfig has no DOM lib; these browser globals run inside evaluate().
declare const getComputedStyle: (
  el: unknown,
  pseudo?: string,
) => {
  getPropertyValue(name: string): string;
  animationName: string;
  color: string;
  borderTopColor: string;
  backgroundImage: string;
  paddingTop: string;
  maskComposite: string;
};
declare const document: { documentElement: { scrollWidth: number } };

const GM_KEY = 'e2e-gm-key-m81-0123456789abcdef81';
const shots = path.resolve(import.meta.dirname, '../docs/screens/themes');
const THEMES = ['aluminum', 'bronze', 'copper', 'silver', 'gold', 'platinum', 'diamond'];
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

// Wears another grade's metal on the whole player screen (the grid and the
// status window both carry the character's theme class).
async function setTheme(page: Page, theme: string) {
  for (const id of ['player-grid', 'status']) {
    await page.getByTestId(id).evaluate((el, t) => {
      for (const c of [...el.classList]) if (c.startsWith('theme-')) el.classList.remove(c);
      el.classList.add(`theme-${t}`);
    }, theme);
  }
}

// The status window with a margin, so the frame's outer glow is in the shot.
async function shoot(page: Page, theme: string) {
  const box = await page.getByTestId('status').boundingBox();
  if (!box) throw new Error('status window not laid out');
  const m = 18;
  await page.screenshot({
    path: path.join(shots, `${theme}-1366x768.png`),
    clip: {
      x: Math.max(0, box.x - m),
      y: Math.max(0, box.y - m),
      width: box.width + 2 * m,
      height: Math.min(box.height + 2 * m, 768),
    },
  });
}

const metalOf = (page: Page) =>
  page
    .getByTestId('status')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--metal').trim());

test('each grade metal frames the status window in its own colour', async ({ browser }) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Themes');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(`${server.url}/play/demo-jake`);
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  const status = page.getByTestId('status');
  // The real grade (D) wears silver, on the status window and on the grid
  // that holds every other player window.
  await expect(status).toHaveClass(/theme-silver/);
  await expect(page.getByTestId('player-grid')).toHaveClass(/theme-silver/);

  const metals = new Set<string>();
  for (const theme of THEMES) {
    await setTheme(page, theme);
    metals.add(await metalOf(page));
    await shoot(page, theme);
  }
  expect(metals.size).toBe(THEMES.length);

  // The ring is really drawn: a gradient sheen, 4px wide, masked to the
  // border so it never paints over the window's text.
  const ring = await status.evaluate((el) => {
    const r = getComputedStyle(el, '::before');
    return { bg: r.backgroundImage, pad: r.paddingTop, mask: r.maskComposite };
  });
  expect(ring.bg).toContain('linear-gradient');
  expect(ring.pad).toBe('4px');
  expect(ring.mask).toMatch(/^exclude\b/); // content box cut out of the ring

  // The metal is the accent of every player window, not only the status one:
  // the party window's heading and border follow the grade.
  const party = page.getByTestId('party');
  const look = () =>
    party.evaluate((el) => {
      const h = el.querySelector('h2');
      return {
        heading: h ? getComputedStyle(h).color : '',
        border: getComputedStyle(el).borderTopColor,
      };
    });
  await setTheme(page, 'copper');
  const copper = await look();
  await page.screenshot({ path: path.join(shots, 'player-copper-1366x768.png') });
  await setTheme(page, 'platinum');
  const platinum = await look();
  expect(copper.heading).toBe('rgb(217, 128, 79)'); // copper --metal #d9804f
  expect(platinum.heading).toBe('rgb(185, 216, 240)'); // platinum --metal #b9d8f0
  expect(copper.border).not.toBe(platinum.border);
  // Every player window (not only the party one) wears the copper frame.
  await setTheme(page, 'copper');
  const borders = await page
    .getByTestId('player-grid')
    .evaluate((grid) =>
      [...grid.querySelectorAll('.window:not(.skill-detail):not(.status-window)')].map(
        (w) => `${w.className}=${getComputedStyle(w).borderTopColor}`,
      ),
    );
  expect(borders.length).toBeGreaterThanOrEqual(6);
  const partyBorder = copper.border;
  for (const b of borders) expect(b.split('=')[1], b).toBe(partyBorder);

  // The app picks the metal from the character's real grade: Sultan (G) is
  // aluminum on every window.
  const sultan = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await sultan.goto(`${server.url}/play/demo-sultan`);
  await expect(sultan.getByTestId('connection')).toHaveText('Connected');
  await expect(sultan.getByTestId('player-grid')).toHaveClass(/theme-aluminum/);
  await expect(sultan.getByTestId('status')).toHaveClass(/theme-aluminum/);
  expect(
    await sultan
      .getByTestId('party')
      .evaluate((el) => getComputedStyle(el.querySelector('h2') ?? el).color),
  ).toBe('rgb(167, 173, 180)'); // aluminum --metal #a7adb4

  // Platinum's sheen is brushed (a repeating streak layer); silver's is not.
  const sheen = (t: string) =>
    setTheme(page, t).then(() =>
      status.evaluate((el) => getComputedStyle(el).getPropertyValue('--sheen')),
    );
  expect(await sheen('platinum')).toContain('repeating-linear-gradient');
  expect(await sheen('silver')).not.toContain('repeating-linear-gradient');

  // Diamond animates; with reduced motion it holds still.
  await setTheme(page, 'diamond');
  const animation = () => status.evaluate((el) => getComputedStyle(el, '::before').animationName);
  expect(await animation()).toBe('prism');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await animation()).toBe('none');

  // A page that loads with reduced motion already on never animates.
  const still = await browser.newPage({ reducedMotion: 'reduce' });
  await still.goto(`${server.url}/play/demo-jake`);
  await expect(still.getByTestId('connection')).toHaveText('Connected');
  await setTheme(still, 'diamond');
  expect(
    await still
      .getByTestId('status')
      .evaluate((el) => getComputedStyle(el, '::before').animationName),
  ).toBe('none');

  // Phones: the framed window stays single-column and readable.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${server.url}/play/demo-jake`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await phone.getByTestId('status').screenshot({ path: path.join(shots, 'silver-390x844.png') });
  await setTheme(phone, 'gold');
  await phone.screenshot({ path: path.join(shots, 'player-gold-390x844.png'), fullPage: true });
  const width = await phone.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});
