import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openWindow, reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MQ.13 The books' starting classes (DESIGN §10): a new campaign offers the
// six; a character from each starts with that class's three skills (two
// Inferior proficiencies, one Common signature skill) and its original text;
// the demo campaign still loads with the new Archer kit.

const GM_KEY = 'e2e-gm-key-mq13-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MQ.13');
let server: RunningServer;

const SIX = [
  {
    cls: 'Archer',
    who: 'Ash',
    skills: [
      'Basic Archery (Inferior)',
      'Basic One-Handed Weapon (Inferior)',
      'Archer’s Eye (Common)',
    ],
  },
  {
    cls: 'Warrior (Light)',
    who: 'Lia',
    skills: [
      'Basic Light Weapons (Inferior)',
      'Basic Footwork (Inferior)',
      'Swift Strike (Common)',
    ],
  },
  {
    cls: 'Warrior (Medium)',
    who: 'Mo',
    skills: ['Basic Weapons (Inferior)', 'Basic Guard (Inferior)', 'Measured Blow (Common)'],
  },
  {
    cls: 'Warrior (Heavy)',
    who: 'Hal',
    skills: ['Basic Heavy Weapons (Inferior)', 'Basic Shield (Inferior)', 'Brace (Common)'],
  },
  {
    cls: 'Caster',
    who: 'Cy',
    skills: [
      'Basic Catalyst Proficiency (Inferior)',
      'Mana Bolt (Inferior)',
      'Mana Sense (Common)',
    ],
  },
  {
    cls: 'Healer',
    who: 'Hope',
    skills: ['Basic Magic-Tool Proficiency (Inferior)', 'Heal (Inferior)', 'Regenerate (Common)'],
  },
];

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

test('the GM starts a character from each of the six classes', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Six Classes');
  await gm.getByRole('button', { name: 'Create campaign' }).click();

  // The library holds the books' six, in DESIGN §10's spirit (Archer first).
  const lib = gm.locator('section[aria-labelledby="origin-library"]');
  const classes = lib.getByRole('list', { name: 'Library classes' });
  await openWindow(gm, 'origin-library');
  await expect(classes.getByRole('listitem')).toHaveCount(6);
  await expect(classes.getByRole('button', { name: /\[Warrior \(Heavy\)\]/ })).toContainText(
    'Strength 2 · Endurance 1 · Vitality 1 · Toughness 1',
  );
  await expect(classes.getByRole('button', { name: /\[Healer\]/ })).toContainText(
    'Wisdom 2 · Willpower 2 · Intelligence 1',
  );
  await lib.scrollIntoViewIfNeeded();
  await noSidewaysScroll(gm);
  await lib.screenshot({ path: path.join(shots, 'gm-six-classes-1366x768.png') });

  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await expect(create.getByLabel('Starting class').locator('option')).toHaveText(
    SIX.map((c) => c.cls),
  );
  for (const c of SIX) {
    await create.getByLabel('Name', { exact: true }).fill(c.who);
    await create.getByLabel('Starting class').selectOption({ label: c.cls });
    for (const s of c.skills) await expect(create).toContainText(`[${s}]`);
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(create.getByRole('status')).toHaveText('Character created');
    await expect(gm.getByRole('heading', { level: 3, name: c.who, exact: true })).toBeVisible();
  }
  await gm.screenshot({ path: path.join(shots, 'gm-party-1366x768.png'), fullPage: true });

  // Each player's sheet shows the class, its three skills and the race skill.
  const player = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const playerErrors = watchErrors(player);
  for (const c of SIX) {
    await player.goto(server.url);
    await player.getByRole('link', { name: new RegExp(`^${c.who}\\b`) }).click();
    await expect(player.getByTestId('class')).toHaveText(`[${c.cls} – lvl 0]`);
    for (const s of c.skills) {
      await expect(player.getByRole('button', { name: `[${s}]` })).toBeVisible();
    }
    await expect(player.getByRole('button', { name: '[Identify (Common)]' })).toBeVisible();
  }
  // The signature skill carries its original System text.
  await player.getByRole('button', { name: '[Regenerate (Common)]' }).click();
  await expect(player.getByTestId('skill-detail-description')).toHaveText(
    'Seed a slow, lasting recovery in a target. Health returns a little at a time for as long as the mana holds.',
  );
  await player.screenshot({ path: path.join(shots, 'player-healer-1366x768.png') });
  await player.close();

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /^Hal\b/ }).click();
  await expect(phone.getByTestId('class')).toHaveText('[Warrior (Heavy) – lvl 0]');
  await noSidewaysScroll(phone);
  await phone.screenshot({ path: path.join(shots, 'player-heavy-390x844.png'), fullPage: true });

  expect(gmErrors).toEqual([]);
  expect(playerErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
});

test('the demo still loads; its level-0 character starts with the new Archer kit', async ({
  browser,
}) => {
  const own = await startBuiltServer({ GM_KEY });
  try {
    const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const gmErrors = watchErrors(gm);
    gm.on('dialog', (d) => void d.accept());
    await gm.goto(`${own.url}/gm#key=${GM_KEY}`);
    await gm.getByLabel('Campaign name').fill('Before the demo');
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    await gm.getByRole('button', { name: 'Load demo campaign' }).click();
    await expect(gm.getByTestId('demo-badge')).toBeVisible();
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const phoneErrors = watchErrors(phone);
    await phone.goto(own.url);
    await phone.getByRole('link', { name: /^Sultan\b/ }).click();
    await expect(phone.getByTestId('class')).toHaveText('[Archer – lvl 0]');
    await expect(
      phone.getByRole('button', { name: '[Basic One-Handed Weapon (Inferior)]' }),
    ).toBeVisible();
    await phone.screenshot({ path: path.join(shots, 'player-demo-sultan-390x844.png') });
    await gm.screenshot({ path: path.join(shots, 'gm-demo-1366x768.png') });
    expect(gmErrors).toEqual([]);
    expect(phoneErrors).toEqual([]);
  } finally {
    await own.stop();
  }
});
