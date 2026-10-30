import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.37 (sweep B 2026-10-30, UX; DESIGN §11, L22): the five fixed quick
// responses show their whole names at 1366×768, so the GM can find them
// without hovering. Labels wrap to a second line instead of an ellipsis.

const GM_KEY = 'e2e-gm-key-qf37-0123456789abcdef01';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.37');
const localChromium = '/opt/pw-browsers/chromium';
test.use({ launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : {} });
let server: RunningServer | null = null;
let dataDir: string;

test.beforeEach(() => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-qf37-'));
});
test.afterEach(async () => {
  await server?.stop();
  server = null;
  rmSync(dataDir, { recursive: true, force: true });
});

const names = ['Yes, and…', 'Yes, but…', 'No, but…', 'In character', 'Twist'];

test('every quick-response button shows its full name at 1366×768', async ({ browser }) => {
  test.setTimeout(90_000);
  server = await startBuiltServer({ GM_KEY, THE_SYSTEM_E2E_FAKE_AI: '1' }, { dataDir });
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  const saved = await gm.request.put(`${server.url}/api/gm/ai/key`, {
    headers: { 'x-gm-key': GM_KEY },
    data: { key: 'sk-ant-e2e-qf37-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);
  await openTab(gm, 'session');

  const quick = gm.getByTestId('quick-responses');
  const buttons = quick.getByRole('group', { name: 'Quick responses' }).getByRole('button');
  await expect(buttons).toHaveCount(5);
  for (const [i, name] of names.entries()) {
    const button = buttons.nth(i);
    await expect(button).toBeVisible();
    // Runs in the page; the e2e tsconfig has no DOM lib, hence the local types.
    const shown = await button.evaluate((raw) => {
      interface TextNode {
        nodeType: number;
        textContent: string | null;
      }
      interface Range {
        setStart(n: TextNode, at: number): void;
        setEnd(n: TextNode, at: number): void;
        getClientRects(): ArrayLike<{ top: number }>;
      }
      const el = raw as unknown as {
        innerText: string;
        scrollWidth: number;
        clientWidth: number;
        scrollHeight: number;
        clientHeight: number;
        childNodes: ArrayLike<TextNode>;
      };
      const page = globalThis as unknown as {
        getComputedStyle(e: unknown): { textOverflow: string };
        document: { createRange(): Range };
      };
      // Words split across lines (e.g. "charact|er"): a word whose range
      // spans more than one line box. Node type 3 is a text node.
      const splitWords: string[] = [];
      for (const n of Array.from(el.childNodes).filter((x) => x.nodeType === 3)) {
        for (const m of (n.textContent ?? '').matchAll(/\S+/g)) {
          const range = page.document.createRange();
          range.setStart(n, m.index);
          range.setEnd(n, m.index + m[0].length);
          const tops = Array.from(range.getClientRects()).map((r) => Math.round(r.top));
          if (new Set(tops).size > 1) splitWords.push(m[0]);
        }
      }
      return {
        text: el.innerText.replace(/\s+/g, ' ').trim(),
        clipped: el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight,
        ellipsis: page.getComputedStyle(raw).textOverflow === 'ellipsis',
        splitWords,
      };
    });
    expect(shown.text, `button ${i + 1}`).toBe(`${i + 1} ${name}`);
    expect(shown.clipped, `button ${i + 1} is clipped`).toBe(false);
    expect(shown.ellipsis, `button ${i + 1} truncates`).toBe(false);
    expect(shown.splitWords, `button ${i + 1} splits a word`).toEqual([]);
  }
  // Still one row of five, every button the same height.
  const boxes = await Promise.all(names.map((_, i) => buttons.nth(i).boundingBox()));
  expect(new Set(boxes.map((b) => Math.round(b?.y ?? -1))).size).toBe(1);
  expect(new Set(boxes.map((b) => Math.round(b?.height ?? -1))).size).toBe(1);

  await quick.scrollIntoViewIfNeeded();
  await quick.screenshot({ path: path.join(shots, 'quick-responses-1366x768.png') });
});
