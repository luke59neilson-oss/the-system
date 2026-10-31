import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';
import { bigCampaignLines } from '../scripts/big-campaign';

// QF.52 Views stay small: a phone gets the newest messages and the start of
// each note; "Show older" and opening a note fetch the rest from the server.

const EVENTS = 3000;
const GM_KEY = 'e2e-gm-key-qf52-0123456789abcdef';
const shots = 'docs/screens/QF.52';
let dataDir: string;
let server: RunningServer | null = null;

test.beforeAll(async () => {
  test.setTimeout(60_000);
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-qf52-'));
  const dir = path.join(dataDir, 'campaigns', 'main');
  mkdirSync(dir, { recursive: true });
  mkdirSync(shots, { recursive: true });
  const lines = bigCampaignLines(EVENTS, { withNotes: true });
  writeFileSync(path.join(dir, 'events.jsonl'), `${lines.join('\n')}\n`);
  server = await startBuiltServer({ GM_KEY }, { dataDir });
});

test.afterAll(async () => {
  await server?.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

test('a phone gets small views and fetches older messages and whole notes', async ({ browser }) => {
  if (!server) throw new Error('no server');
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  phone.on('pageerror', (err) => errors.push(err.message));
  phone.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  const frames: string[] = [];
  phone.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await phone.goto(`${server.url}/play/ana`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');

  // Messages: the newest page, then the next one from the server, focused.
  const messages = phone.getByTestId('messages').locator('li');
  await expect(messages).toHaveCount(50);
  const older = phone.getByTestId('messages-older');
  await expect(older).toHaveText(/^Show older \(\d{3} more\)$/);
  await older.click();
  await expect(messages).toHaveCount(100);
  await expect(messages.nth(50)).toBeFocused();

  // Notes: a closed note carries only its start; opening it brings the rest.
  await phone.getByLabel('Show notes').selectOption('journal'); // Ana's own: she can edit them
  const note = phone.getByTestId('note').first();
  await note.locator('.note-summary').click();
  const body = note.getByTestId('note-body-view');
  await expect(note.getByTestId('note-loading')).toBeHidden();
  const text = (await body.textContent()) ?? '';
  expect(text.length).toBeGreaterThan(300);
  await expect(note.getByTestId('note-edit')).toBeEnabled();
  await note.getByTestId('note-edit').click();
  await expect(phone.getByTestId('note-body')).toHaveValue(/(What happened at step \d+\. ){16}/);
  await phone.screenshot({ path: path.join(shots, 'note-open-390x844.png') });

  // Every view frame stays small, and none carries more than one page of practice.
  const views = frames.filter((f) => f.startsWith('{"type":"view"'));
  expect(views.length).toBeGreaterThan(0);
  for (const f of views) {
    expect(f.length).toBeLessThan(150 * 1024);
    const view = (JSON.parse(f) as { view: { practice: unknown[] } }).view;
    expect(view.practice.length).toBeLessThanOrEqual(8);
  }
  expect(errors).toEqual([]);
});

test('the GM gets one whole state, then patches that keep the console current', async ({
  browser,
}) => {
  if (!server) throw new Error('no server');
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const frames: string[] = [];
  const gmErrors: string[] = [];
  gm.on('pageerror', (err) => gmErrors.push(err.message));
  gm.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await expect(gm.getByTestId('connection')).toHaveText('Connected');
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${server.url}/play/bo`);
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  // A player's practice entry reaches the GM as a patch, not a whole state.
  const states = () => frames.filter((f) => f.startsWith('{"type":"state"')).length;
  const patches = () => frames.filter((f) => f.startsWith('{"type":"statePatch"'));
  expect(states()).toBe(1);
  const practice = phone.getByTestId('practice');
  await practice.getByTestId('practice-log').locator('summary').click();
  const form = practice.getByTestId('practice-form');
  await form.getByTestId('practice-form-action').fill('QF52 probe swing');
  await form.getByRole('checkbox').nth(0).check();
  await form.getByTestId('practice-form-submit').click();
  await expect(practice.getByTestId('practice-notice')).toHaveText('Practice logged for the GM.');
  await expect.poll(() => patches().some((f) => f.includes('QF52 probe swing'))).toBe(true);
  const patch = JSON.parse(patches().find((f) => f.includes('QF52 probe swing')) ?? '{}') as {
    set: Record<string, unknown>;
  };
  expect(Object.keys(patch.set)).toContain('practice');
  expect(Object.keys(patch.set)).not.toContain('characters');
  expect(states()).toBe(1);
  expect(gmErrors).toEqual([]);
});
