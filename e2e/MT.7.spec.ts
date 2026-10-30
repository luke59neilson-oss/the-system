import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MT.7 (DESIGN §7 GM authority, Q60): where the app enforces a rule on the GM,
// the GM has a way through, as a logged, undoable event: a skill's rarity, a
// skill outside selections, an early profession, a second mark in a session,
// a merge past the merge rules, an early montage, and an evolution released
// before the waiting selections are chosen.

const GM_KEY = 'e2e-gm-key-mt7-0123456789abcdef07';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MT.7');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterEach(async () => {
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

const kit = [
  { name: 'Quick Cut', rarity: 'common' },
  { name: 'Side Step', rarity: 'common' },
  { name: 'Keen Eye', rarity: 'common' },
];

async function setUp(gm: Page, campaign: string) {
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill(campaign);
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gmCommand(gm, {
    type: 'character.create',
    id: 'jake',
    name: 'Jake',
    className: 'Archer',
    classSkills: kit,
  });
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
}

async function joinAsJake(page: Page) {
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
}

test('sheet overrides, an extra mark and a merge past the rules', async ({ browser }) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await setUp(gm, 'Overrides');
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerErrors = watchErrors(player);
  await joinAsJake(player);

  // 1. Sheet: a rarity past the G-grade ceiling, a skill outside selections,
  //    and a profession before E-grade, each with its warning first.
  const party = gm.locator('section[aria-labelledby="party"]');
  const card = party.locator('[data-testid^="row-"]', { hasText: 'Jake' });
  await openWindow(gm, 'party');
  await card.getByRole('button', { name: 'Edit sheet' }).click();
  const box = card.getByRole('group', { name: 'Skill and profession overrides' });
  const rarity = box.getByRole('group', { name: 'Set a skill’s rarity' });
  await rarity.getByLabel('Skill').selectOption('Keen Eye');
  await rarity.getByLabel('New rarity').selectOption({ label: 'Legendary' });
  await expect(rarity.getByTestId('rarity-override-notes')).toHaveText(
    'Override: above the G-grade ceiling (Rare); raised without marks; it starts at 0 marks, as every upgrade does.',
  );
  await rarity.getByRole('button', { name: 'Set rarity' }).click();
  await expect(box.getByRole('status')).toHaveText('[Keen Eye] is now Legendary');
  await expect(player.getByTestId('skills-class')).toContainText('[Keen Eye (Legendary)]');

  const give = box.getByRole('group', { name: 'Give a skill' });
  await give.getByLabel('Give a skill').fill('Star Shot');
  await give.getByLabel('Rarity').selectOption({ label: 'Epic' });
  await expect(give.getByTestId('grant-override-notes')).toHaveText(
    'Override: outside the selection schedule; above the G-grade ceiling (Rare).',
  );
  await give.getByRole('button', { name: 'Give skill' }).click();
  await expect(box.getByRole('status')).toHaveText('Jake gained [Star Shot] (Epic)');
  await expect(player.getByTestId('skills-class')).toContainText('[Star Shot (Epic)]');

  const profession = box.getByRole('group', { name: 'Grant a profession' });
  await profession.getByLabel('Grant a profession now').fill('Alchemist');
  await expect(profession.getByTestId('profession-override-notes')).toContainText(
    'professions unlock at E-grade; Jake is G-grade',
  );
  await box.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-sheet-overrides-1366x768.png') });
  await profession.getByRole('button', { name: 'Grant profession' }).click();
  await expect(box.getByRole('status')).toHaveText('Jake is now a [Alchemist]');
  await expect(player.getByText('Alchemist').first()).toBeVisible();
  await card.getByRole('button', { name: 'Close editor' }).click();

  // 2. A second mark in one session.
  await openWindow(gm, 'session');
  await gm.getByRole('button', { name: 'Start session 1' }).click();
  for (const action of ['Cut and step', 'Step then cut', 'Spinning cut']) {
    await gmCommand(gm, {
      type: 'practice.log',
      characterId: 'jake',
      action,
      skills: ['Quick Cut', 'Side Step'],
    });
  }
  const marks = gm.locator('section[aria-labelledby="marks-review-heading"]');
  await openWindow(gm, 'marks-review');
  await marks.getByRole('button', { name: 'Confirm mark: Jake Quick Cut' }).click();
  await marks.getByRole('button', { name: 'Extra mark (override): Jake Quick Cut' }).click();
  await expect(marks.getByRole('status')).toHaveText(
    'Jake: extra mark on [Quick Cut] (GM override)',
  );
  await expect(marks).toContainText('2/4 marks');

  // 3. A merge of two Common skills (the rule asks for Uncommon), then the
  //    player accepts it on their screen.
  const builder = gm.locator('section[aria-labelledby="merge-builder-heading"]');
  await builder.getByLabel('GM override: merge any two skills').check();
  await expect(builder.getByTestId('merge-override-skips')).toContainText(
    'Skips the merge rules: both at least Uncommon',
  );
  const pick = builder.getByRole('group', { name: 'Override merge' });
  await pick.getByLabel('First skill').selectOption('Quick Cut');
  await pick.getByLabel('Second skill').selectOption('Side Step');
  await expect(pick).toContainText('Merged skill: Uncommon');
  await builder.getByLabel('Merged skill name').fill('Stepping Cut');
  await builder.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-merge-override-1366x768.png') });
  await builder.getByRole('button', { name: 'Send merge offer' }).click();
  await expect(builder.getByTestId('merge-pending')).toContainText('[Stepping Cut]');
  const offer = player.getByTestId('merge-offer');
  await offer.getByRole('button', { name: /Accept/ }).click();
  await expect(player.getByTestId('skills-class')).toContainText('[Stepping Cut (Uncommon)]');
  await expect(builder.getByTestId('merge-answer')).toContainText('Jake accepted');

  // The change log names each override, and undoing the merge brings both skills back.
  const log = gm.locator('section[aria-labelledby="change-log"]');
  await openWindow(gm, 'change-log');
  await expect(log.getByRole('listitem').filter({ hasText: '(GM override)' })).toHaveCount(3);
  const row = log.getByRole('listitem').filter({ hasText: 'Jake merged Quick Cut' });
  await row.getByRole('button', { name: 'Undo' }).click();
  await row.getByRole('button', { name: 'Confirm undo' }).click();
  await expect(player.getByTestId('skills-class')).toContainText('[Quick Cut');
  await player.screenshot({ path: path.join(shots, 'player-after-overrides-390x844.png') });

  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});

test('an early montage and an evolution released before its selections', async ({ browser }) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await setUp(gm, 'Early');
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerErrors = watchErrors(player);
  await joinAsJake(player);

  // 1. A montage on an empty clock.
  const win = gm.locator('section[aria-labelledby="encounter"]');
  const clocks = win.locator('[aria-labelledby="clocks"]');
  await openWindow(gm, 'encounter');
  await clocks.getByLabel('Clock name').fill('Climb the rib');
  await clocks.getByLabel('Segments').fill('6');
  await clocks.getByRole('button', { name: 'Start clock' }).click();
  const clock = clocks.getByRole('listitem', { name: '[Climb the rib]' });
  await expect(clock.getByRole('button', { name: 'Offer montage' })).toHaveCount(0);
  await clock.getByRole('button', { name: 'Early montage (override)' }).click();
  await expect(clock.getByTestId('montage-override')).toContainText(
    'a montage normally needs the clock half filled with no failures',
  );
  await clock.getByLabel('Players see').fill('The long climb');
  await clocks.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-montage-override-1366x768.png') });
  await clock.getByRole('button', { name: 'Offer anyway' }).click();
  await expect(clock).toContainText('Montage “The long climb”: waiting on Jake');
  await expect(player.getByText('The long climb')).toBeVisible();

  // 2. Jake at the F-grade top with both F selections still to choose.
  await gmCommand(gm, {
    type: 'character.setProgression',
    characterId: 'jake',
    grade: 'F',
    classLevel: 14,
    professionLevel: 0,
    xp: { class: 0, profession: 0 },
  });
  const builder = gm.locator('section[aria-labelledby="evolution-builder"]');
  const form = builder.getByRole('form', { name: 'Evolution release' });
  await openWindow(gm, 'evolution-builder');
  await expect(form.getByTestId('evolution-waits')).toContainText('lvl 5');
  await form.getByRole('group', { name: 'Option 1' }).getByLabel('Class name').fill('Ranger');
  await form.getByLabel(/Approve this re-rating/).check();
  const release = form.getByRole('button', { name: 'Release evolution' });
  await expect(release).toBeDisabled();
  await expect(form.getByTestId('release-problem')).toContainText(
    'skill selection to choose first',
  );
  await form.getByLabel(/GM override: release now anyway/).check();
  await expect(form.getByTestId('release-problem')).toHaveCount(0);
  await form.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-evolution-override-1366x768.png') });
  await release.click();
  await expect(builder.getByRole('status')).toHaveText('Evolution released to Jake');

  // The player evolves without being told to choose the selections first.
  await player.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
  const dialog = player.getByTestId('evolution');
  await expect(dialog).not.toContainText('cannot evolve until');
  await dialog.getByRole('button', { name: 'Choose Ranger' }).click();
  await dialog.getByRole('button', { name: 'Evolve' }).click();
  await expect(player.getByTestId('race')).toContainText('(E)');
  await player.screenshot({ path: path.join(shots, 'player-evolved-early-390x844.png') });

  expect(errors).toEqual([]);
  expect(playerErrors).toEqual([]);
});
