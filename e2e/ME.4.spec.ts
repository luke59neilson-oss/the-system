import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// ME.4 (DESIGN §4 "Reference while building"): the Evolutions tab shows the
// books' evolution options with totals and percent shapes, plus the
// campaign's own earlier options; Use this shape fills an option card with a
// row's shape scaled to the step's budget. GM-only.

const GM_KEY = 'e2e-gm-key-me4-0123456789abcdefme4';
const shots = path.resolve(import.meta.dirname, '../docs/screens/ME.4');
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

const STATS = [
  'Strength',
  'Agility',
  'Endurance',
  'Vitality',
  'Toughness',
  'Wisdom',
  'Intelligence',
  'Perception',
  'Willpower',
];

test('Use this shape applies Archer’s shape at the E-grade class budget', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gmCommand(gm, {
    type: 'character.create',
    id: 'kim',
    name: 'Kim',
    className: 'Archer',
    classSkills: [
      { name: 'Basic Archery', rarity: 'inferior' },
      { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
      { name: 'Archer’s Eye', rarity: 'common' },
    ],
  });
  // Kim at the top of F-grade with no profession, her selections made.
  await gmCommand(gm, {
    type: 'character.setProgression',
    characterId: 'kim',
    grade: 'F',
    classLevel: 14,
    professionLevel: 0,
    xp: { class: 0, profession: 0 },
  });
  for (const [level, picked] of [
    [5, 'Keen Shot'],
    [10, 'Gale Arrow'],
  ] as const) {
    await gmCommand(gm, {
      type: 'selection.offer',
      characterId: 'kim',
      level,
      options: [
        { name: picked, rarity: level === 10 ? 'rare' : 'common' },
        { name: `Other ${level}a`, rarity: 'common' },
        { name: `Other ${level}b`, rarity: 'common' },
      ],
    });
    await gmCommand(gm, { type: 'selection.choose', characterId: 'kim', level, skill: picked });
  }

  await openTab(gm, 'evolutions');
  const builder = gm.locator('section[aria-labelledby="evolution-builder"]');
  await builder.getByLabel('Three steps: class, profession, race').check();
  const form = builder.getByRole('form', { name: 'Evolution release' });

  // The reference table: the books' rows with totals and percent shapes.
  const books = builder.getByRole('table', { name: 'Evolution options: the books' });
  const hunter = books.getByRole('row', { name: /Ambitious Hunter/ });
  await expect(hunter).toContainText('G · tutorial upgrade · Jake Thayne');
  await expect(hunter).toContainText(
    'Strength 2 · Agility 4 · Endurance 3 · Perception 5 · Free 4',
  );
  await expect(hunter.getByRole('cell').nth(3)).toHaveText('18');
  await expect(hunter).toContainText('Perception 28% · Free 22%');
  await expect(books.getByRole('row', { name: /Heretic-Chosen Alchemist/ })).toHaveCount(2);
  await expect(builder).toContainText(
    'This campaign: No three-step evolution released in this campaign yet.',
  );

  // Use this shape: Archer (6 a level: Str 1, Agi 1, End 1, Per 2, free 1)
  // scaled to the E-grade class budget of 16: Str 3, Agi 3, End 3, Per 5, free 2.
  const classStep = form.getByRole('region', { name: 'Class step' });
  await expect(classStep).toContainText('16 points per class level at E-grade');
  const class1 = classStep.getByRole('group', { name: 'Class option 1' });
  const picker = class1.getByLabel('Shape for class option 1', { exact: true });
  await expect(picker.locator('option').first()).toHaveText(
    'Archer (class, books: G · start · Jake Thayne; 6/level)',
  );
  await picker.selectOption({ label: 'Archer (class, books: G · start · Jake Thayne; 6/level)' });
  await class1.getByRole('button', { name: 'Use this shape for class option 1' }).click();
  const want: Record<string, number> = { Strength: 3, Agility: 3, Endurance: 3, Perception: 5 };
  for (const s of STATS) {
    await expect(class1.getByLabel(`${s} per level`, { exact: true })).toHaveValue(
      String(want[s] ?? 0),
    );
  }
  await expect(class1.getByLabel('Free points per level', { exact: true })).toHaveValue('2');
  await expect(class1.getByTestId('budget-meter')).toContainText('Per level 16 / 16');
  await class1.getByLabel('Name', { exact: true }).fill('Storm Archer');
  await class1.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-use-shape-1366x768.png') });

  // A profession row in the race step's picker scales too (any track can be used).
  const raceStep = form.getByRole('region', { name: 'Race step' });
  const race1 = raceStep.getByRole('group', { name: 'Race option 1' });
  await race1.getByLabel('Shape for race option 1', { exact: true }).selectOption({
    label: 'Alchemist of the Malefic Viper (profession, books: G · start · Jake Thayne; 8/level)',
  });
  await race1.getByRole('button', { name: 'Use this shape for race option 1' }).click();
  await expect(race1.getByTestId('budget-meter')).toContainText('Per level 10 / 10');

  // Released, it joins the campaign's own rows.
  await form.getByLabel(/Approve this re-rating/).check();
  const release = form.getByRole('button', { name: 'Release evolution' });
  await expect(release).toBeEnabled();
  await release.click();
  await expect(builder.getByRole('status')).toHaveText('Evolution released to Kim');
  const mine = builder.getByRole('table', { name: 'Evolution options: this campaign' });
  await expect(mine.getByRole('row', { name: /Storm Archer/ })).toContainText(
    'Strength 3 · Agility 3 · Endurance 3 · Perception 5 · Free 2',
  );
  await mine.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-reference-1366x768.png') });
  await gm.setViewportSize({ width: 1920, height: 1080 });
  await gm.screenshot({ path: path.join(shots, 'gm-reference-1920x1080.png') });

  // GM-only: without the key the route is refused.
  const anon = await gm.request.get(`${server.url}/api/gm/evolution-reference`);
  expect(anon.status()).toBe(403);
  expect(errors).toEqual([]);
});
