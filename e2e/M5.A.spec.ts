import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M5.A milestone acceptance (DESIGN §2, §6, §7): one character goes through
// the four skill loops between the GM console and the player's screen, in
// play order: the G→F evolution (with re-rating), the level 5 selection, a
// mark upgrade from the session review, and a merge of two skills the player
// logged together. Every step is driven from the UI on both sides; only the
// character and its earlier marks are set up by command.

const GM_KEY = 'e2e-gm-key-m5a-0123456789abcdef5a';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M5.A');
const REASON = 'GM-ONLY-REASON-CANARY-M5A';
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
  await server.stop();
});

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

/** Runs one GM command over the GM page's own origin (set-up only). */
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

async function awardClassXp(gm: Page, amount: number, reason: string): Promise<void> {
  const award = gm.getByRole('form', { name: 'Award class XP' });
  await award.getByLabel('Amount').fill(String(amount));
  await award.getByLabel('Reason (GM only)').fill(reason);
  await award.getByRole('button', { name: 'Award XP' }).click();
}

test('selection, evolution, mark upgrade and merge between the GM and the player', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmWatch = watch(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('M5 Acceptance');
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
  // Three marks on Archer's Eye from earlier sessions: one more upgrades it.
  for (const session of ['old-1', 'old-2', 'old-3']) {
    await gmCommand(gm, {
      type: 'skill.awardMark',
      characterId: 'jake',
      skill: 'Archer’s Eye',
      session,
    });
  }

  const player = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const playerWatch = watch(player);
  await player.goto(server.url);
  await player.getByRole('link', { name: /Jake/ }).click();
  await expect(player.getByTestId('connection')).toHaveText('Connected');
  await expect(player.getByTestId('race')).toHaveText(/\(G\) – lvl 0\]/);
  const skills = player.getByTestId('skills-class');
  // DINGs queue as toasts one at a time, so assert on the notification history.
  const dings = player.getByTestId('dings');

  // 1. Evolution: four G levels reach the top of G; the GM releases the F
  // evolution, keeping Archer's Eye at Common; the player evolves.
  await awardClassXp(gm, 4 * 100, REASON);
  await expect(player.getByTestId('class')).toHaveText(/lvl 4\]$/);
  const evolution = gm.locator('section[aria-labelledby="evolution-builder"]');
  await expect(evolution.getByLabel('Character')).toHaveValue('jake');
  const release = evolution.getByRole('form', { name: 'Evolution release' });
  const path1 = release.getByRole('group', { name: 'Option 1' });
  await path1.getByLabel('Class name').fill('Storm Archer');
  await path1.getByLabel('Bonus to all stats').fill('1');
  const rerate = release.getByRole('list', { name: 'Re-rating' });
  await expect(rerate).toContainText('[Archer’s Eye] Common →');
  await rerate.getByLabel(/Archer.s Eye/).selectOption({ label: 'Common' });
  await expect(release.getByTestId('release-problem')).toHaveCount(0);
  await evolution.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-evolution-1366x768.png') });
  await release.getByRole('button', { name: 'Release evolution' }).click();
  await expect(evolution.getByRole('status')).toHaveText('Evolution released to Jake');

  await player.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
  const evolve = player.getByTestId('evolution');
  // The GM's keep reaches the player; Inferior is the floor.
  const rerateLines = evolve.getByTestId('evolution-rerate').getByRole('listitem');
  await expect(rerateLines.filter({ hasText: 'Archer’s Eye' })).toHaveText(
    '[Archer’s Eye] stays Common',
  );
  await expect(rerateLines.filter({ hasText: 'Basic Archery' })).toHaveText(
    '[Basic Archery] stays Inferior',
  );
  await evolve.getByRole('button', { name: 'Choose Storm Archer' }).click();
  await evolve.getByRole('button', { name: 'Evolve' }).click();
  await expect(player.getByTestId('class')).toHaveText('[Storm Archer – lvl 4]');
  await expect(player.getByTestId('race')).toHaveText(/\(F\) – lvl 4\]/);
  await expect(skills).toContainText('[Archer’s Eye (Common)]');
  await expect(evolution.getByTestId('no-evolution')).toBeVisible();
  await player.screenshot({ path: path.join(shots, 'player-evolved-1366x768.png') });

  // 2. Selection: one F level brings the level 5 selection; the GM builds
  // and sends the menu; the player takes Gale Step.
  await awardClassXp(gm, 300, REASON);
  await expect(player.getByTestId('class')).toHaveText('[Storm Archer – lvl 5]');
  const offers = gm.locator('section[aria-labelledby="offer-builder"]');
  await offers.getByLabel('Character').selectOption({ label: 'Jake' });
  const due = offers.getByRole('list', { name: 'Due selections' }).getByRole('listitem');
  await expect(due).toHaveText(['Selection (lvl 5) · ceiling Rare · build the menu']);
  const menu = offers.getByRole('form', { name: 'Selection menu' });
  const row = (n: number) => menu.getByRole('group', { name: `Option ${n}` });
  await row(1).getByLabel('Name').fill('Gale Step');
  await row(1).getByLabel('Rarity').selectOption({ label: 'Uncommon' });
  await row(1).getByLabel('Description').fill('Step with the wind and leave no footing to read.');
  await row(2).getByLabel('Name').fill('Rain of Needles');
  await row(2).getByLabel('Rarity').selectOption({ label: 'Common' });
  await row(3).getByLabel('Name').fill('Hunter’s Patience');
  await row(3).getByLabel('Rarity').selectOption({ label: 'Common' });
  await expect(menu.getByTestId('offer-problem')).toHaveCount(0);
  await menu.getByRole('button', { name: 'Send menu' }).click();
  await expect(offers.getByRole('status')).toHaveText('Menu sent to Jake (lvl 5)');

  await expect(player.getByTestId('selection-badge')).toHaveText('1 waiting');
  await player.getByRole('button', { name: '[Choose]' }).click();
  const choose = player.getByRole('dialog', { name: 'Skill selection' });
  await expect(choose.getByTestId('offer')).toHaveCount(3);
  await player.screenshot({ path: path.join(shots, 'player-selection-1366x768.png') });
  await choose.getByRole('button', { name: 'Choose Gale Step' }).click();
  await choose.getByRole('button', { name: 'Confirm' }).click();
  await expect(choose).toHaveCount(0);
  await expect(skills).toContainText('[Gale Step (Uncommon)]');
  await expect(player.getByTestId('selection-badge')).toHaveCount(0);
  await expect(offers.getByTestId('no-due-selections')).toBeVisible();

  // 3. Practice in session 1: the player logs Archer's Eye and Gale Step
  // together three times; the GM reviews the entries.
  await gm.getByRole('button', { name: 'Start session 1' }).click();
  const practice = player.getByTestId('practice');
  await practice.getByTestId('practice-log').locator('summary').click();
  const form = practice.getByTestId('practice-form');
  for (const action of [
    'Read the gust and slipped aside',
    'Spotted the gap, stepped through',
    'Wind-read dodge',
  ]) {
    await form.getByTestId('practice-form-action').fill(action);
    await form.getByRole('checkbox', { name: 'Archer’s Eye' }).check();
    await form.getByRole('checkbox', { name: 'Gale Step' }).check();
    await form.getByTestId('practice-form-submit').click();
    await expect(practice.getByTestId('practice-notice')).toHaveText('Practice logged for the GM.');
    await expect(form.getByTestId('practice-form-action')).toHaveValue('');
  }
  const capture = gm.locator('section[aria-labelledby="practice-capture-heading"]');
  await expect(capture).toContainText('To review (3)');
  // The merge alert says its uses are not reviewed yet (and Archer's Eye is
  // still Common, so the engine refuses it for now).
  const merge = gm.locator('section[aria-labelledby="merge-builder-heading"]');
  await expect(merge.getByTestId('merge-unreviewed')).toHaveText(
    '3 of these 3 uses not reviewed yet (Practice window).',
  );
  await capture.getByRole('button', { name: 'Mark all reviewed' }).click();
  await expect(capture).toContainText('To review (0)');
  await expect(merge.getByTestId('merge-unreviewed')).toHaveCount(0);

  // 4. Mark upgrade: the GM confirms the session's mark on Archer's Eye
  // (4/4) and upgrades it; the player gets the DING.
  const marks = gm.locator('section[aria-labelledby="marks-review-heading"]');
  const jakeMarks = marks.locator('section[aria-labelledby="marks-jake"]');
  await jakeMarks.getByRole('button', { name: 'Confirm mark: Jake Archer’s Eye' }).click();
  await expect(marks.getByRole('status')).toHaveText('Jake: mark confirmed on [Archer’s Eye]');
  const upgrade = jakeMarks.getByTestId('upgrade-prompt');
  await expect(upgrade).toContainText(
    'Upgrade ready: [Archer’s Eye (Common)] → Uncommon (4/4 marks; starts again at 0)',
  );
  await marks.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-marks-1366x768.png') });
  await upgrade.getByRole('button', { name: 'Upgrade Jake Archer’s Eye' }).click();
  await expect(marks.getByRole('status')).toHaveText('Jake: [Archer’s Eye] is now Uncommon');
  await expect(dings).toContainText(
    "*'DING!' Skill upgraded: [Archer’s Eye (Common)] → [Archer’s Eye (Uncommon)]*",
  );
  await expect(skills).toContainText('[Archer’s Eye (Uncommon)]');

  // 5. Merge: both skills are Uncommon and were used together 3 times; the
  // GM builds the merge and sends it; the player gets the merged skill.
  await expect(merge.getByRole('list', { name: 'Merge alerts' })).toHaveText(
    '[Archer’s Eye] + [Gale Step] · together 3× → Rare',
  );
  await merge.getByLabel('Merged skill name').fill('Windreader’s Step');
  await merge.getByLabel('Description (optional)').fill('Read the air and move with it.');
  await merge.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await gm.screenshot({ path: path.join(shots, 'gm-merge-1366x768.png') });
  await merge.getByRole('button', { name: 'Send merge' }).click();
  await expect(merge.getByRole('status')).toHaveText(
    'Jake: [Archer’s Eye] + [Gale Step] → [Windreader’s Step] sent',
  );
  await expect(dings).toContainText(
    "*'DING!' Skills merged: [Archer’s Eye] + [Gale Step] → [Windreader’s Step (Rare)]*",
  );
  await expect(skills).toContainText('[Windreader’s Step (Rare)]');
  await expect(skills).not.toContainText('Gale Step');
  await expect(skills).not.toContainText('Archer’s Eye');
  await player.screenshot({ path: path.join(shots, 'player-merged-1366x768.png') });

  // Everything holds after a reload, and on a phone.
  await player.reload();
  await expect(player.getByTestId('class')).toHaveText('[Storm Archer – lvl 5]');
  await expect(skills).toContainText('[Windreader’s Step (Rare)]');
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneWatch = watch(phone);
  await phone.goto(`${server.url}/play/jake`);
  await expect(phone.getByTestId('skills-class')).toContainText('[Windreader’s Step (Rare)]');
  await expect(phone.getByTestId('race')).toHaveText(/\(F\) – lvl 5\]/);
  await phone.screenshot({ path: path.join(shots, 'player-final-390x844.png') });

  // The GM-only XP reason never reached a player's browser.
  for (const w of [playerWatch, phoneWatch]) {
    expect(w.frames.length).toBeGreaterThan(0);
    expect(w.frames.some((f) => f.includes(REASON) || f.includes(GM_KEY))).toBe(false);
    expect(w.errors).toEqual([]);
  }
  expect(gmWatch.errors).toEqual([]);
});
