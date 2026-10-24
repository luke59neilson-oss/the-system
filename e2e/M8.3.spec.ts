import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';
import { contrastFailures } from './helpers/contrast';

// M8.3 accessibility (DESIGN §9): text contrast ≥ 4.5:1 in all 7 grade
// themes, keyboard navigation, reduced motion. (Silver vs platinum ΔE ≥ 10 is
// a unit test on the theme tokens: apps/web/test/themes.test.ts.)

const GM_KEY = 'e2e-gm-key-m83-0123456789abcdef83';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M8.3');
const THEMES = ['aluminum', 'bronze', 'copper', 'silver', 'gold', 'platinum', 'diamond'];
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

async function demo(page: Page) {
  page.on('dialog', (d) => void d.accept());
  await page.goto(`${server.url}/gm#key=${GM_KEY}`);
  await page.getByLabel('Campaign name').fill('Access');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await page.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(page.getByTestId('demo-badge')).toBeVisible();
}

async function setTheme(page: Page, theme: string) {
  for (const id of ['player-grid', 'status']) {
    await page.getByTestId(id).evaluate((el, t) => {
      for (const c of [...el.classList]) if (c.startsWith('theme-')) el.classList.remove(c);
      el.classList.add(`theme-${t}`);
    }, theme);
  }
}

test('every text on the player screen and GM console reads at 4.5:1 or better', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await demo(gm);
  const bad: string[] = [];
  const note = (label: string, scan: Awaited<ReturnType<typeof contrastFailures>>) => {
    for (const f of scan.failures)
      bad.push(`${label}: ${f.where} "${f.text}" ${f.fg} on ${f.bg} = ${f.ratio}`);
  };
  const gmScan = await contrastFailures(gm);
  expect(gmScan.checked).toBeGreaterThan(50);
  note('gm', gmScan);

  for (const who of ['demo-jake', 'demo-sultan']) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.goto(`${server.url}/play/${who}`);
    await expect(page.getByTestId('connection')).toHaveText('Connected');
    for (const theme of THEMES) {
      await setTheme(page, theme);
      const scan = await contrastFailures(page);
      expect(scan.checked).toBeGreaterThan(40);
      note(`${who} ${theme}`, scan);
    }
    // An open dialog (a skill's details) over each metal, too.
    await page.locator('.skill-open').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    for (const theme of THEMES) {
      await setTheme(page, theme);
      note(`${who} ${theme} skill details`, await contrastFailures(page, { root: 'dialog[open]' }));
    }
    await page.screenshot({ path: path.join(shots, `${who}-skill-detail-diamond-1366x768.png`) });
    await page.keyboard.press('Escape');
    await setTheme(page, 'bronze');
    await page.screenshot({ path: path.join(shots, `${who}-bronze-1366x768.png`), fullPage: true });
  }

  // Phones: the single column reads as well.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${server.url}/play/demo-jake`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  for (const theme of THEMES) {
    await setTheme(phone, theme);
    note(`phone ${theme}`, await contrastFailures(phone));
  }
  await phone.screenshot({ path: path.join(shots, 'player-diamond-390x844.png'), fullPage: true });
  expect(bad, bad.join('\n')).toEqual([]);

  // The scan can fail: dim text planted in a window is caught.
  await phone
    .getByTestId('party')
    .evaluate((el) => el.insertAdjacentHTML('beforeend', '<p style="color:#3a4250">dim</p>'));
  const planted = await contrastFailures(phone);
  expect(planted.failures.map((f) => f.text)).toEqual(['dim']);
});

// Marks every visible keyboard stop with data-kb="<n>" and reports those
// counts plus problems that need no tabbing: positive tabindex (breaks the
// reading order) and pointer-cursor elements a keyboard cannot reach.
const MARK = `(() => {
  const sel = 'a[href], button, input, select, textarea, summary, [tabindex]';
  const stops = [];
  for (const el of document.querySelectorAll(sel)) {
    if (el.matches(':disabled') || el.getAttribute('tabindex') === '-1') continue;
    if (el.closest('[inert], [hidden], dialog:not([open])')) continue;
    // checkVisibility: also false inside a closed <details>.
    if (!el.checkVisibility({ visibilityProperty: true })) continue;
    el.setAttribute('data-kb', String(stops.length));
    stops.push(el);
  }
  const positive = [...document.querySelectorAll('[tabindex]')]
    .filter((el) => Number(el.getAttribute('tabindex')) > 0)
    .map((el) => el.outerHTML.slice(0, 80));
  const unreachable = [];
  for (const el of document.querySelectorAll('body *')) {
    if (getComputedStyle(el).cursor !== 'pointer' || !el.checkVisibility()) continue;
    if (el.closest(sel + ', label')) continue;
    unreachable.push(el.outerHTML.slice(0, 80));
  }
  return { stops: stops.length, positive, unreachable };
})()`;

// The focused element: its keyboard-stop number and whether a focus ring
// shows (an outline of 2px or more, or a box-shadow ring).
const FOCUSED = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
  return {
    kb: el.getAttribute('data-kb'),
    ring: outline || cs.boxShadow !== 'none',
    label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
  };
})()`;

async function tabThrough(page: Page) {
  const marked = await page.evaluate<{ stops: number; positive: string[]; unreachable: string[] }>(
    MARK,
  );
  expect(marked.positive, 'positive tabindex').toEqual([]);
  expect(marked.unreachable, 'pointer cursor without a keyboard stop').toEqual([]);
  const reached = new Set<string>();
  const noRing: string[] = [];
  for (let i = 0; i < marked.stops + 5; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate<{ kb: string | null; ring: boolean; label: string } | null>(
      FOCUSED,
    );
    if (!f?.kb) continue;
    reached.add(f.kb);
    if (!f.ring) noRing.push(f.label);
  }
  expect(noRing, 'focused without a visible ring').toEqual([]);
  const missed = await page.evaluate<string[]>(
    `[...document.querySelectorAll('[data-kb]')].filter((el) => !${JSON.stringify([
      ...reached,
    ])}.includes(el.getAttribute('data-kb'))).map((el) => el.outerHTML.slice(0, 80))`,
  );
  expect(missed, 'never reached by Tab').toEqual([]);
  return marked.stops;
}

test('the player screen and GM console work from the keyboard alone', async ({ browser }) => {
  test.setTimeout(120_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await demo(gm);
  expect(await tabThrough(gm)).toBeGreaterThan(20);

  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(`${server.url}/play/demo-jake`);
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  expect(await tabThrough(page)).toBeGreaterThan(20);

  // Keyboard only: tab to a skill, Enter opens its details, Escape closes
  // them and focus returns to the skill.
  const skill = page.locator('.skill-open').first();
  await skill.focus();
  await expect(skill).toBeFocused();
  await page.screenshot({ path: path.join(shots, 'focus-ring-1366x768.png') });
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((d) => d.contains(d.ownerDocument.activeElement))).toBe(true);
  await page.screenshot({ path: path.join(shots, 'skill-detail-keyboard-1366x768.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(skill).toBeFocused();
});

// Every element and pseudo-element: running animations and non-zero
// transitions. Empty means nothing on the page moves.
const MOVING = `(() => {
  const moving = [];
  for (const el of document.querySelectorAll('*')) {
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      const t = cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0);
      if (cs.animationName !== 'none' || t)
        moving.push(el.tagName + (pseudo || '') + '.' + String(el.className) + ' ' + cs.animationName);
    }
  }
  return { moving, running: document.getAnimations().length };
})()`;

test('with reduced motion nothing on any screen moves', async ({ browser }) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    reducedMotion: 'reduce',
  });
  await demo(gm);
  const gmMotion = await gm.evaluate<{ moving: string[]; running: number }>(MOVING);
  expect(gmMotion).toEqual({ moving: [], running: 0 });

  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    reducedMotion: 'reduce',
  });
  await page.goto(`${server.url}/play/demo-jake`);
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  for (const theme of THEMES) {
    await setTheme(page, theme);
    // The evolution re-theme is on (M8.2) and diamond's prism is the theme:
    // the two motions the app plays on its own.
    await page.getByTestId('player-grid').evaluate((el) => el.classList.add('evolving'));
    const m = await page.evaluate<{ moving: string[]; running: number }>(MOVING);
    expect(m, theme).toEqual({ moving: [], running: 0 });
  }

  // The same page with motion allowed does animate (the check can fail).
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const free = await page.evaluate<{ moving: string[]; running: number }>(MOVING);
  expect(free.moving.length).toBeGreaterThan(0);
});
