import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Locator } from '@playwright/test';
import { expect, test, type Page } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// ME.3 (DESIGN §2, §9a, L26): the Evolutions tab. The home dashboard links
// to it; the GM builds Kim's E-grade evolution in three steps (class,
// profession, race) with option cards and budget meters; an unequal one-time
// bonus blocks Release, and Override releases it.

const GM_KEY = 'e2e-gm-key-me3-0123456789abcdefme3';
const shots = path.resolve(import.meta.dirname, '../docs/screens/ME.3');
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

/** Sets a card's per-level points (every stat, so earlier values never linger). */
async function perLevel(card: Locator, stats: Record<string, number>, free: number) {
  for (const s of STATS) {
    await card.getByLabel(`${s} per level`, { exact: true }).fill(String(stats[s] ?? 0));
  }
  await card.getByLabel('Free points per level', { exact: true }).fill(String(free));
}

async function bonus(card: Locator, stat: string, n: number) {
  const details = card.locator('details.stat-bonus');
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  await card.getByLabel(`${stat} bonus`, { exact: true }).fill(String(n));
}

test('the GM builds and releases Kim’s E-grade evolution in three steps', async ({ browser }) => {
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
  await gmCommand(gm, {
    type: 'character.grantProfession',
    characterId: 'kim',
    profession: 'Herbalist',
  });
  // Kim at the top of F-grade: class and profession 14, so race level 14.
  await gmCommand(gm, {
    type: 'character.setProgression',
    characterId: 'kim',
    grade: 'F',
    classLevel: 14,
    professionLevel: 14,
    xp: { class: 0, profession: 0 },
  });
  // Her F-grade selections are made (the capstone at 10 reaches Rare).
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

  // Jo is two race levels short of the F-grade top: listed as near.
  await gmCommand(gm, {
    type: 'character.create',
    id: 'jo',
    name: 'Jo',
    className: 'Archer',
    classSkills: [
      { name: 'Basic Archery', rarity: 'inferior' },
      { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
      { name: 'Archer’s Eye', rarity: 'common' },
    ],
  });
  await gmCommand(gm, {
    type: 'character.setProgression',
    characterId: 'jo',
    grade: 'F',
    classLevel: 12,
    professionLevel: 0,
    xp: { class: 0, profession: 0 },
  });

  // The home dashboard's "to build" line opens the Evolutions tab.
  await openTab(gm, 'home');
  await gm.getByRole('button', { name: /Kim: evolution to E-grade to build and release/ }).click();
  await expect(
    gm.getByRole('tablist', { name: 'Console tabs' }).getByRole('tab', { name: 'Evolutions' }),
  ).toHaveAttribute('aria-selected', 'true');
  const builder = gm.locator('section[aria-labelledby="evolution-builder"]');
  await expect(builder.getByLabel('Character')).toHaveValue('kim');
  await expect(builder.getByRole('list', { name: 'Near the threshold' })).toHaveText(
    'Jo: 2 race levels to go',
  );
  await builder.getByLabel('Three steps: class, profession, race').check();
  const form = builder.getByRole('form', { name: 'Evolution release' });
  await expect(form.getByRole('complementary', { name: 'Standing' })).toContainText(
    'Kim: F-grade → E-grade',
  );

  // Class step: two options; the second's one-time bonus is one higher.
  const classStep = form.getByRole('region', { name: 'Class step' });
  await expect(classStep).toContainText('16 points per class level at E-grade');
  const class1 = classStep.getByRole('group', { name: 'Class option 1' });
  await class1.getByLabel('Name', { exact: true }).fill('Storm Archer');
  await class1.getByLabel('Rarity').selectOption({ label: 'Uncommon' });
  await class1.getByLabel('Description').fill('Arrows that ride the wind.');
  await perLevel(class1, { Perception: 8, Agility: 4 }, 3);
  await expect(class1.getByTestId('budget-meter')).toContainText('Per level 15 / 16 (-1)');
  await class1.getByLabel('Free points per level', { exact: true }).fill('4');
  await expect(class1.getByTestId('budget-meter')).toContainText('Per level 16 / 16');
  await bonus(class1, 'Perception', 5);
  await classStep.getByRole('button', { name: 'Duplicate class option 1' }).click();
  const class2 = classStep.getByRole('group', { name: 'Class option 2' });
  await expect(class2.getByLabel('Name', { exact: true })).toHaveValue('Storm Archer (copy)');
  await class2.getByLabel('Name', { exact: true }).fill('Wind Archer');
  await bonus(class2, 'Agility', 1);
  await expect(class2.getByTestId('budget-meter')).toContainText(
    'One-time bonus 6 (+1 against option 1)',
  );
  // A third card added and removed again.
  await classStep.getByRole('button', { name: 'Add class option' }).click();
  await classStep.getByRole('button', { name: 'Remove class option 3' }).click();
  await expect(classStep.getByRole('group', { name: /^Class option \d$/ })).toHaveCount(2);

  // Profession step: Kim evolves Herbalist.
  const profStep = form.getByRole('region', { name: 'Profession step' });
  const prof1 = profStep.getByRole('group', { name: 'Profession option 1' });
  await expect(prof1.getByLabel('Name', { exact: true })).toHaveValue('Herbalist');
  await prof1.getByLabel('Name', { exact: true }).fill('Apothecary');
  await perLevel(prof1, { Wisdom: 4, Intelligence: 3 }, 3);
  await bonus(prof1, 'Wisdom', 5);
  await expect(prof1.getByTestId('budget-meter')).toContainText('Per level 10 / 10');

  // Race step: Human, free points only.
  const raceStep = form.getByRole('region', { name: 'Race step' });
  const race1 = raceStep.getByRole('group', { name: 'Race option 1' });
  await expect(race1.getByLabel('Name', { exact: true })).toHaveValue('Human');
  await perLevel(race1, {}, 10);
  await bonus(race1, 'Vitality', 5);

  const blockers = form.getByRole('list', { name: 'Why Release is blocked' });
  // Hard blockers: an unnamed option and the unapproved re-rating; Override cannot pass them.
  await class1.getByLabel('Name', { exact: true }).fill('');
  await expect(blockers).toContainText('Name every class option');
  await expect(blockers).toContainText('Approve the skill re-rating before releasing');
  await class1.getByLabel('Name', { exact: true }).fill('Storm Archer');
  await form.getByLabel(/Approve this re-rating/).check();
  await expect(blockers).not.toContainText('Name every class option');
  const release = form.getByRole('button', { name: 'Release evolution' });
  await expect(blockers).toContainText('Class options have unequal one-time bonuses (5, 6)');
  await expect(release).toBeDisabled();
  // The blockers and Release stay in view at 1366×768 (sticky bar).
  await expect(blockers).toBeInViewport();
  await expect(release).toBeInViewport();
  await class2.getByTestId('budget-meter').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await gm.screenshot({ path: path.join(shots, 'gm-unequal-bonus-1366x768.png') });
  await gm.setViewportSize({ width: 1920, height: 1080 });
  await form.getByLabel(/^Override: release anyway/).scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-unequal-bonus-1920x1080.png') });

  // Override releases it, as is.
  await form.getByLabel(/^Override: release anyway/).check();
  await expect(blockers).toContainText('(overridden)');
  await expect(release).toBeEnabled();
  await release.click();
  await expect(builder.getByRole('status')).toHaveText('Evolution released to Kim');
  await expect(builder.getByRole('status')).toBeInViewport();
  await expect(form.getByLabel(/^Override: release anyway/)).not.toBeChecked();
  await expect(builder.getByTestId('evolution-released')).toContainText(
    '[Storm Archer], [Wind Archer]',
  );
  await gm.screenshot({ path: path.join(shots, 'gm-released-1920x1080.png') });
  await gm.setViewportSize({ width: 1366, height: 768 });
  await gm.screenshot({ path: path.join(shots, 'gm-released-1366x768.png') });
  expect(errors).toEqual([]);
});
