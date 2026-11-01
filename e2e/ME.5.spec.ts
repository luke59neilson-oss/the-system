import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// ME.5 (DESIGN §9 "Evolution on the player's screen", §2): the Evolution
// window is locked and greyed until the GM releases an evolution; then it
// lights up in the next grade's metal with the [Evolution available] pop-up;
// the player picks class, profession and race from book-style cards, reviews
// all three and confirms once, and the screen takes the new grade's theme.
// Another player never sees the options. The GM builder defaults to Three steps.

const GM_KEY = 'e2e-gm-key-me5-0123456789abcdefme5';
const shots = path.resolve(import.meta.dirname, '../docs/screens/ME.5');
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
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
  { name: 'Archer’s Eye', rarity: 'common' },
];

async function join(page: Page, name: string) {
  await page.goto(server.url);
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await expect(page.getByTestId('connection')).toHaveText('Connected');
}

const opt = (
  id: string,
  name: string,
  stats: Record<string, number>,
  free: number,
  bonus: Record<string, number>,
  description = '',
) => ({
  id,
  name,
  rarity: 'uncommon',
  description,
  distribution: { stats, free },
  statBonus: bonus,
});

test('Kim’s evolution: locked, lit on release, three picks, one confirm, new theme', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  for (const [id, name] of [
    ['kim', 'Kim'],
    ['jo', 'Jo'],
  ]) {
    await gmCommand(gm, {
      type: 'character.create',
      id,
      name,
      className: 'Archer',
      classSkills: kit,
    });
  }
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

  // The GM builder now opens on Three steps.
  await openTab(gm, 'evolutions');
  const builder = gm.locator('section[aria-labelledby="evolution-builder"]');
  await expect(builder.getByLabel('Three steps: class, profession, race')).toBeChecked();

  // Locked and greyed before any release.
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const playerErrors = watchErrors(player);
  await join(player, 'Kim');
  const panel = player.getByTestId('evolution-panel');
  await expect(panel).toHaveAttribute('data-state', 'locked');
  await expect(panel).toHaveAttribute('aria-disabled', 'true');
  await expect(panel.getByRole('heading')).toHaveText('Evolution [Locked]');
  await expect(panel.getByRole('button')).toHaveCount(0);
  await panel.scrollIntoViewIfNeeded();
  await player.screenshot({ path: path.join(shots, 'player-locked-390x844.png') });

  const jo = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await join(jo, 'Jo');

  // The GM releases three steps (E budgets: class 16, profession 10, race 10).
  await gmCommand(gm, {
    type: 'evolution.release',
    characterId: 'kim',
    rerateApproved: true,
    steps: {
      class: [
        opt(
          'c1',
          'Storm Archer',
          { perception: 8, agility: 4 },
          4,
          { perception: 5 },
          'Arrows that ride the wind.',
        ),
        opt(
          'c2',
          'Thorn Ranger',
          { agility: 8, strength: 4 },
          4,
          { agility: 5 },
          'Quick blades between shots.',
        ),
      ],
      profession: [
        opt(
          'p1',
          'Herbalist',
          { wisdom: 5, vitality: 3 },
          2,
          { wisdom: 3 },
          'Leaves, roots, remedies.',
        ),
      ],
      race: [opt('r1', 'Human (E)', {}, 10, { vitality: 2 }, 'Adaptable to anything.')],
    },
  });

  // It lights up: the window, the status window and the pop-up, in E's copper.
  await expect(panel).toHaveAttribute('data-state', 'lit');
  await expect(panel).toHaveClass(/theme-copper/);
  await expect(player.getByTestId('status')).toHaveClass(/evolution-lit/);
  const popup = player.getByTestId('evolution-popup');
  await expect(popup).toContainText('[Evolution available]');
  await player.screenshot({ path: path.join(shots, 'player-lit-390x844.png') });
  // Later puts the pop-up off; the window stays lit until opened.
  await popup.getByRole('button', { name: 'Later' }).click();
  await expect(popup).toHaveCount(0);
  await expect(panel).toHaveAttribute('data-state', 'lit');

  // QF.69: the status window's [Evolve] counts as opening the release too.
  await player.getByTestId('status').getByRole('button', { name: '[Evolve]' }).click();
  await expect(panel).toHaveAttribute('data-state', 'open');
  await expect(player.getByTestId('status')).not.toHaveClass(/evolution-lit/);
  await player.getByRole('button', { name: 'Close evolution' }).click();

  // Jo sees nothing of Kim's evolution.
  await expect(jo.getByTestId('evolution-panel')).toHaveAttribute('data-state', 'locked');
  for (const name of ['Storm Archer', 'Thorn Ranger', 'Herbalist', 'Human (E)']) {
    await expect(jo.locator('body')).not.toContainText(name);
  }

  // Three steps of book-style cards.
  await panel.locator('.evolution-open').click();
  const dialog = player.getByTestId('evolution');
  await expect(dialog.getByRole('heading', { name: 'Class: choose one' })).toBeVisible();
  const storm = dialog.getByTestId('evolution-option').filter({ hasText: 'Storm Archer' });
  await expect(storm).toContainText('[Storm Archer (Uncommon)]');
  await expect(storm).toContainText('Arrows that ride the wind.');
  await expect(storm).toContainText('Per level: Agility 4 · Perception 8 · Free points 4');
  await expect(storm).toContainText('One-time bonus: +5 Perception');
  await player.screenshot({ path: path.join(shots, 'player-mid-choice-390x844.png') });
  await dialog.getByRole('button', { name: 'Choose Storm Archer' }).click();
  await expect(dialog.getByRole('heading', { name: 'Profession: choose one' })).toBeVisible();
  // Back returns to the class step; the pick is kept for the review.
  await dialog.getByRole('button', { name: 'Back' }).click();
  await expect(dialog.getByRole('heading', { name: 'Class: choose one' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Choose Storm Archer' }).click();
  // Close keeps the picks: reopening lands on the profession step.
  await dialog.getByRole('button', { name: 'Close evolution' }).click();
  await expect(dialog).toHaveCount(0);
  await panel.getByRole('button', { name: 'Continue your evolution' }).click();
  await expect(dialog.getByRole('heading', { name: 'Profession: choose one' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Choose none for now' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Choose Herbalist' }).click();
  await dialog.getByRole('button', { name: 'Choose Human (E)' }).click();
  const review = dialog.getByTestId('evolution-review');
  await expect(review).toContainText('Class[Storm Archer (Uncommon)]');
  await expect(review).toContainText('Profession[Herbalist (Uncommon)]');
  await expect(review).toContainText('Race[Human (E) (Uncommon)]');
  await expect(dialog.getByTestId('evolution-warnings')).toContainText('The choice is final');
  await expect(dialog.getByRole('button', { name: 'Evolve' })).toBeInViewport(); // QF.56
  await player.screenshot({ path: path.join(shots, 'player-review-390x844.png') });

  // One confirm: the grade changes and the screen takes copper.
  await dialog.getByRole('button', { name: 'Evolve' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(player.getByTestId('player-grid')).toHaveClass(/theme-copper/);
  await expect(panel).toHaveAttribute('data-state', 'locked');
  await expect(player.getByTestId('status')).toContainText('Storm Archer');
  await expect(player.getByTestId('status')).toContainText('Herbalist');
  await player.waitForTimeout(2600);
  await player.screenshot({ path: path.join(shots, 'player-evolved-390x844.png') });
  expect(playerErrors).toEqual([]);
  expect(errors).toEqual([]);
});

test('reduced motion: the lit window is a strong static highlight', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gmCommand(gm, {
    type: 'character.create',
    id: 'kim',
    name: 'Kim',
    className: 'Archer',
    classSkills: kit,
  });
  await gmCommand(gm, {
    type: 'xp.award',
    track: 'class',
    amount: 400,
    participants: [{ characterId: 'kim' }],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const player = await context.newPage();
  await join(player, 'Kim');
  await gmCommand(gm, {
    type: 'evolution.release',
    characterId: 'kim',
    rerateApproved: true,
    steps: {
      class: [opt('c1', 'Storm Archer', { perception: 9 }, 2, {})],
      profession: [],
      race: [opt('r1', 'Human (F)', {}, 6, {})],
    },
  });
  const panel = player.getByTestId('evolution-panel');
  await expect(panel).toHaveAttribute('data-state', 'lit');
  const animation = await panel.evaluate(
    (el) => el.ownerDocument.defaultView?.getComputedStyle(el).animationName,
  );
  expect(animation).toBe('none');
  const shadow = await panel.evaluate(
    (el) => el.ownerDocument.defaultView?.getComputedStyle(el).boxShadow,
  );
  expect(shadow).not.toBe('none');
  await player.getByTestId('evolution-popup').getByRole('button', { name: 'Later' }).click();
  await panel.scrollIntoViewIfNeeded();
  await player.screenshot({ path: path.join(shots, 'player-lit-reduced-motion-390x844.png') });
  await context.close();
});
