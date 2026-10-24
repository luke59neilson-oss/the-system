import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M8.1 metallic grade themes (DESIGN §3, §9, D13): every grade's metal frames
// the status window with its own colour and sheen; platinum is brushed and
// cooler than silver; diamond's prism animates unless reduced motion is on.

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

async function setTheme(page: Page, theme: string) {
  await page.getByTestId('status').evaluate((el, t) => {
    for (const c of [...el.classList]) if (c.startsWith('theme-')) el.classList.remove(c);
    el.classList.add(`theme-${t}`);
  }, theme);
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
  // The real grade (D) wears silver.
  await expect(status).toHaveClass(/theme-silver/);

  const metals = new Set<string>();
  for (const theme of THEMES) {
    await setTheme(page, theme);
    metals.add(await metalOf(page));
    await status.screenshot({ path: path.join(shots, `${theme}-1366x768.png`) });
  }
  expect(metals.size).toBe(THEMES.length);

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

  // Phones: the framed window stays single-column and readable.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${server.url}/play/demo-jake`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await phone.getByTestId('status').screenshot({ path: path.join(shots, 'silver-390x844.png') });
});
