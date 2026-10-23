import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M4.2 Class, race and profession libraries: a new campaign starts with the
// default set; the GM browses, adds and edits classes, races and professions;
// a character created from a library class gets its skills, weights and the
// skill library's text. Library entries never reach a player.

const GM_KEY = 'e2e-gm-key-m42-0123456789abcdef';
const SECRET = 'GM-ONLY-CLASS-CANARY-42';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M4.2');
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});

test.afterAll(async () => {
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

function watchFrames(page: Page) {
  const frames: string[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => frames.push(String(f.payload)));
  });
  return frames;
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const d = (
      globalThis as unknown as {
        document: { documentElement: { scrollWidth: number; clientWidth: number } };
      }
    ).document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the GM manages classes, races and professions; characters start from them', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Origins Test');
  await expect(gm.getByLabel(/Start with the default classes/)).toBeChecked();
  await gm.getByRole('button', { name: 'Create campaign' }).click();

  const lib = gm.locator('section[aria-labelledby="origin-library"]');
  const tab = (name: RegExp) =>
    lib.getByRole('group', { name: 'Library' }).getByRole('button', { name });
  // The default set arrived with the campaign.
  await expect(tab(/^Classes \(6\)/)).toHaveAttribute('aria-pressed', 'true');
  await expect(tab(/^Races \(1\)/)).toBeVisible();
  // No default professions (MQ.6): the GM tailors them per character.
  await expect(tab(/^Professions \(0\)/)).toBeVisible();
  await expect(lib.getByRole('button', { name: /Add the default set/ })).toHaveCount(0);
  const classes = lib.getByRole('list', { name: 'Library classes' });
  await expect(classes.getByRole('listitem')).toHaveCount(6);
  const caster = classes.getByRole('button', { name: /\[Caster\]/ });
  await expect(caster).toContainText('Mana Bolt (Inferior)');
  await expect(caster).toContainText('Mana Sense (Common)');
  await expect(caster).toContainText('Intelligence 2 · Wisdom 1 · Perception 1 · Willpower 1');
  // The books' six, Archer first (DESIGN §10).
  await expect(classes.getByRole('listitem')).toContainText([
    /\[Archer\]/,
    /\[Warrior \(Light\)\]/,
    /\[Warrior \(Medium\)\]/,
    /\[Warrior \(Heavy\)\]/,
    /\[Caster\]/,
    /\[Healer\]/,
  ]);
  // The skill library got the starting skills' text.
  const skills = gm.locator('section[aria-labelledby="skill-library"]');
  await expect(skills.getByRole('list', { name: 'Library skills' })).toContainText('[Mana Bolt]');

  // A new class: only G-grade rarities are offered, problems block saving.
  await lib.getByRole('button', { name: 'New class' }).click();
  await expect(lib.getByRole('heading', { name: 'New class' })).toBeVisible();
  const add = lib.getByRole('button', { name: 'Add to library' });
  await expect(add).toBeDisabled();
  await expect(lib.getByLabel('Skill 1 rarity').locator('option')).toHaveText([
    'Inferior',
    'Common',
    'Uncommon',
    'Rare',
  ]);
  await lib.getByLabel('Class name').fill('Duelist');
  await lib.getByLabel('Description (GM only for now)').fill(`${SECRET} fencer.`);
  await expect(lib.getByRole('note')).toHaveText('Name every starting skill.');
  await lib.getByLabel('Skill 1', { exact: true }).fill('Riposte');
  await lib.getByLabel('Skill 2', { exact: true }).fill('Footwork');
  await lib.getByLabel('Skill 3', { exact: true }).fill('Feint');
  await lib.getByLabel('Skill 3 rarity').selectOption({ label: 'Rare' });
  await lib.getByLabel('Agility').fill('4.5');
  await expect(lib.getByRole('note')).toContainText('whole numbers');
  await expect(add).toBeDisabled();
  await lib.getByLabel('Agility').fill('4');
  await add.click();
  await expect(lib.getByRole('status')).toHaveText('[Duelist] added to the library');
  await expect(tab(/^Classes \(7\)/)).toBeVisible();

  // A clashing name is refused with a readable error.
  await lib.getByLabel('Class name').fill('archer');
  for (const [i, n] of ['A', 'B', 'C'].entries()) {
    await lib.getByLabel(`Skill ${i + 1}`, { exact: true }).fill(n);
  }
  await add.click();
  await expect(lib.getByRole('alert')).toContainText('already has [Archer]');

  // The refused draft is still unsaved: the first click away warns, the second discards.
  await classes.getByRole('button', { name: /\[Archer\]/ }).click();
  await expect(lib.getByRole('alert').filter({ hasText: 'unsaved changes' })).toBeVisible();
  await expect(lib.getByRole('heading', { name: 'New class' })).toBeVisible();
  await expect(lib.getByLabel('Class name')).toHaveValue('archer');
  // Edit Archer: Save stays off until something changes.
  await classes.getByRole('button', { name: /\[Archer\]/ }).click();
  await expect(lib.getByRole('heading', { name: 'Edit [Archer]' })).toBeVisible();
  const save = lib.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeDisabled();
  await lib.getByLabel('Description (GM only for now)').fill('Shield wall of one.');
  await save.click();
  await expect(lib.getByRole('status')).toHaveText('[Archer] saved');
  await expect(classes.getByRole('button', { name: /\[Archer\]/ })).toContainText(
    'Shield wall of one.',
  );
  await lib.getByLabel(/Search classes/).fill('riposte');
  await expect(classes.getByRole('listitem')).toHaveCount(1);
  await lib.getByLabel(/Search classes/).fill('');
  await lib.scrollIntoViewIfNeeded();
  await noSidewaysScroll(gm);
  await lib.screenshot({ path: path.join(shots, 'gm-classes-1366x768.png') });

  // Races and professions.
  await tab(/^Races/).click();
  await expect(lib.getByRole('list', { name: 'Library races' })).toContainText('[Human]');
  await lib.getByLabel('Race name').fill('Dwarf');
  await lib.getByLabel('Description (GM only for now)').fill('Short, stubborn.');
  await add.click();
  await expect(lib.getByRole('status')).toHaveText('[Dwarf] added to the library');
  await tab(/^Professions/).click();
  await expect(lib).toContainText('tailored to each character at the E-grade evolution');
  const professions = lib.getByRole('list', { name: 'Library professions' });
  await lib.getByLabel('Profession name').fill('Fletcher');
  await lib.getByRole('button', { name: 'Add a skill idea' }).click();
  await lib.getByLabel('Skill 1', { exact: true }).fill('Arrow Crafting');
  await lib.getByLabel('Skill 1 rarity').selectOption({ label: 'Epic' });
  await lib.getByRole('button', { name: 'Add a skill idea' }).click();
  await lib.getByRole('button', { name: 'Remove skill 2' }).click();
  await add.click();
  await expect(lib.getByRole('status')).toHaveText('[Fletcher] added to the library');
  await expect(professions.getByRole('button', { name: /\[Fletcher\]/ })).toContainText(
    'Arrow Crafting (Epic)',
  );
  await noSidewaysScroll(gm);
  await lib.screenshot({ path: path.join(shots, 'gm-professions-1366x768.png') });

  // A character from a library class and race.
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Miranda');
  await create.getByLabel('Starting class').selectOption({ label: 'Caster' });
  await create.getByLabel('Race').selectOption('Dwarf');
  await expect(create).toContainText('[Mana Bolt (Inferior)]');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Miranda', exact: true })).toBeVisible();
  await expect(gm.getByTestId(/^party-class-/).filter({ hasText: /^Caster$/ })).toBeVisible();
  await gm.screenshot({ path: path.join(shots, 'gm-console-1366x768.png'), fullPage: true });

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    const player = await browser.newPage({ viewport });
    const errors = watchErrors(player);
    const frames = watchFrames(player);
    await player.goto(server.url);
    await player.getByRole('link', { name: /Miranda/ }).click();
    await expect(player.getByText(/\[Dwarf \(G\) – lvl 0\]/)).toBeVisible();
    await expect(player.getByText(/\[Caster – lvl 0\]/)).toBeVisible();
    await noSidewaysScroll(player);
    await player.screenshot({
      path: path.join(shots, `player-status-${viewport.width}x${viewport.height}.png`),
    });
    await player.getByRole('button', { name: /\[Mana Bolt \(Inferior\)\]/ }).click();
    await expect(player.getByTestId('skill-detail-description')).toHaveText(
      'Shape raw mana into a bolt and throw it. Costs mana; it hits harder as your magic grows.',
    );
    await player.screenshot({
      path: path.join(shots, `player-skill-${viewport.width}x${viewport.height}.png`),
    });
    const all = frames.join('\n');
    expect(frames.length).toBeGreaterThan(0);
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain('Fletcher');
    expect(all).not.toContain('Shield wall of one');
    expect(errors).toEqual([]);
    await player.close();
  }
  expect(gmErrors).toEqual([]);
});

test('a campaign started without defaults can add them later', async ({ browser }) => {
  const own = await startBuiltServer({ GM_KEY });
  try {
    const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = watchErrors(gm);
    await gm.goto(`${own.url}/gm#key=${GM_KEY}`);
    await gm.getByLabel('Campaign name').fill('Bare');
    await gm.getByLabel(/Start with the default classes/).uncheck();
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    const lib = gm.locator('section[aria-labelledby="origin-library"]');
    await expect(lib.getByRole('note')).toContainText(
      'Until then new characters start from the six built-in classes.',
    );
    // The character form falls back to the six built-in classes and the rules' race.
    const create = gm.locator('form[aria-labelledby="new-character"]');
    await expect(create.getByLabel('Starting class').locator('option')).toHaveText([
      'Archer',
      'Warrior (Light)',
      'Warrior (Medium)',
      'Warrior (Heavy)',
      'Caster',
      'Healer',
    ]);
    await expect(create.getByLabel('Race').locator('option')).toHaveText(['Human']);
    const seed = lib.getByRole('button', { name: /Add the default set \(\d+ missing\)/ });
    await seed.click();
    await expect(lib.getByRole('status')).toContainText(/Added \d+ default entries/);
    await expect(seed).toHaveCount(0);
    await expect(
      lib.getByRole('list', { name: 'Library classes' }).getByRole('listitem'),
    ).toHaveCount(6);
    await expect(create.getByLabel('Starting class').locator('option')).toHaveCount(6);
    expect(errors).toEqual([]);
  } finally {
    await own.stop();
  }
});
