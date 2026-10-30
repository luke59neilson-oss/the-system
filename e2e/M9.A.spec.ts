import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M9.A milestone acceptance (Claude bridge and content packs): the whole loop
// from DESIGN §7 "Logging for Claude" and D9. The GM imports the tutorial
// pack into a new campaign, plays a session (Jake reaches the top of G),
// ends it, copies the report for Claude and reads it as JSON, imports the
// evolution file Claude drafts back from it, and the player takes one of
// the drafted paths on a phone. Nothing GM-only reaches the player.

const GM_KEY = 'e2e-gm-key-m9a-0123456789abcdef9a';
const REASON = 'GM-SECRET-m9a-crown-ambush';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M9.A');
const pack = path.resolve(import.meta.dirname, '../docs/content-packs/tutorial.json');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});
test.afterEach(async () => {
  await server.stop();
});

/** Runs one GM command over the GM page's own origin. */
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

function watch(page: Page) {
  const errors: string[] = [];
  const frames: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  return { errors, frames };
}

const clipboard = (page: Page) =>
  page.evaluate(() =>
    (
      globalThis as unknown as { navigator: { clipboard: { readText: () => Promise<string> } } }
    ).navigator.clipboard.readText(),
  );

/** What Claude drafts back from the report: Jake's F-grade evolution. */
const drafted = {
  format: 'the-system/content',
  version: 1,
  title: 'Jake: F-grade evolution',
  evolutions: [
    {
      character: 'Jake',
      options: [
        {
          className: 'Crown Skirmisher',
          description: 'Shoots from the knolls and is gone before the hunters turn.',
          classWeights: { perception: 2, agility: 2, endurance: 1 },
          statBonus: { agility: 5, perception: 5 },
        },
        {
          className: 'Canyon Marksman',
          description: 'Patience in the old scars, and one shot that counts.',
          transforms: [{ skill: 'Archer’s Eye', name: 'Marksman’s Eye', rarity: 'uncommon' }],
          statBonus: { perception: 10 },
        },
      ],
    },
  ],
};

// Words from the pack and the session the player must never receive.
const SECRETS = [
  REASON,
  'you are what it is defending against',
  'Decide what you are',
  'immune response',
  'Clotmother',
  'Ossuary King',
  'kill-pale-hunter',
  'Tutorial overview',
  "The Host's Response",
  'Old scar canyons from something',
  'warm under the n',
];

test('tutorial pack → session → report for Claude → drafted evolution → player', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const gm = await context.newPage();
  const gmWatch = watch(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('The Host');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gmCommand(gm, {
    type: 'character.create',
    id: 'jake',
    name: 'Jake',
    className: 'Archer',
    classSkills: [
      { name: 'Basic Archery', rarity: 'inferior' },
      { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
      { name: 'Archer’s Eye', rarity: 'common' },
    ],
  });

  // 1. The tutorial pack applies whole.
  const panel = gm.locator('section[aria-labelledby="import-heading"]');
  await openWindow(gm, 'import');
  await panel.getByLabel('Content file (.json)').setInputFiles(pack);
  const apply = panel.getByRole('button', { name: /^Apply \d+$/ });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(panel.getByRole('status')).toContainText('Applied');

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneWatch = watch(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await expect(phone.getByTestId('quests')).toContainText('The World Is Dying');

  // 2. Session 1: Jake takes 400 XP to the top of G (class 4 = race 4).
  const session = gm.locator('section[aria-labelledby="session-heading"]');
  await openWindow(gm, 'session');
  await session.getByRole('button', { name: 'Start session 1' }).click();
  await expect(session.getByRole('status')).toHaveText('Session 1 started');
  await gm.getByLabel('Amount').fill('400');
  await gm.getByLabel('Reason (GM only)').fill(REASON);
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(phone.getByTestId('class')).toHaveText('[Archer – lvl 4]', { timeout: 2000 });
  await session.getByRole('button', { name: 'End session…' }).click();
  await session.getByRole('button', { name: 'End session 1' }).click();
  await expect(session.getByRole('status')).toHaveText(
    'Session 1 ended: backup saved, report written',
  );

  // 3. The report for Claude: markdown on the clipboard, JSON from the API.
  const row = session.getByRole('table').getByRole('row').nth(1);
  await row.getByRole('button', { name: 'Copy session 1 report for Claude' }).click();
  await expect(session.getByRole('status')).toHaveText(
    'Session 1 report copied: paste it into Claude',
  );
  const markdown = await clipboard(gm);
  expect(markdown).toMatch(/^# Session 1 report: The Host$/m);
  expect(markdown).toContain(REASON);
  // The party sheet gives Claude the exact names to draft against.
  expect(markdown).toContain('- Class: [Archer – lvl 4]');
  expect(markdown).toContain('[Archer’s Eye (Common)]');
  const report = (await gm.evaluate(
    async ({ url, key }) => (await fetch(url, { headers: { 'x-gm-key': key } })).json(),
    { url: `${server.url}/api/gm/session-report?n=1&format=json`, key: GM_KEY },
  )) as { format: string; report: boolean; entries: { kind: string; text: string }[] };
  expect(report).toMatchObject({ format: 'the-system/session-report', report: true });
  const levels = report.entries.filter((e) => e.kind === 'level').map((e) => e.text);
  expect(levels).toContain('Jake: class Archer 0 → 4');
  expect(levels.join('\n')).toMatch(/^Jake: race Human 0 → 4/m);
  await session.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-report-copied-1366x768.png') });

  // 4. Claude drafts Jake's evolution; the GM previews it and applies it.
  await panel.getByLabel('Content file (.json)').setInputFiles({
    name: 'jake-f-evolution.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(drafted)),
  });
  await expect(panel).toContainText('Jake: F-grade evolution');
  await expect(panel.locator('.err')).toHaveCount(0);
  // The GM sees whose screen it goes to and what Jake will be offered.
  await expect(panel).toContainText(
    "Goes to Jake's screen on Apply: [Crown Skirmisher], [Canyon Marksman]",
  );
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: path.join(shots, 'gm-import-evolution-1366x768.png') });
  await panel.getByRole('button', { name: 'Apply 1' }).click();
  await expect(panel.getByRole('status')).toHaveText('Applied 1 entry');

  // 5. The player takes a drafted path on the phone.
  await phone.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
  const dialog = phone.getByTestId('evolution');
  await expect(dialog).toContainText('Crown Skirmisher');
  await expect(dialog).toContainText('Canyon Marksman');
  await phone.screenshot({ path: path.join(shots, 'player-evolution-choice-390x844.png') });
  await dialog.getByRole('button', { name: 'Choose Canyon Marksman' }).click();
  await dialog.getByRole('button', { name: 'Evolve' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(phone.getByTestId('class')).toHaveText('[Canyon Marksman – lvl 4]');
  await expect(phone.getByTestId('status')).toContainText('Marksman’s Eye');
  await expect(phone.getByTestId('status')).toHaveClass(/theme-bronze/, { timeout: 5000 });
  await phone.screenshot({ path: path.join(shots, 'player-evolved-390x844.png') });
  const width = await phone.evaluate(
    () =>
      (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document
        .documentElement.scrollWidth,
  );
  expect(width).toBeLessThanOrEqual(390);

  // 6. Nothing GM-only reached the player, on the socket or the page.
  const seen = `${phoneWatch.frames.join('\n')}\n${await phone.content()}`;
  for (const secret of SECRETS) expect(seen, secret).not.toContain(secret);
  expect(phoneWatch.errors).toEqual([]);
  expect(gmWatch.errors).toEqual([]);
  await phone.close();
  await context.close();
});
