import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M4.5 Party dashboard: a card per character with what waits on the GM or the
// player (evolution, selections, mark upgrades, merges, free points), and a
// full sheet editor whose changes are GM events that reach the player live.

const GM_KEY = 'e2e-gm-key-m45-0123456789abcdef45';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M4.5');
let dataDir: string;
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-m45-'));
  server = await startBuiltServer({ GM_KEY }, { dataDir });
});

test.afterEach(async () => {
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

function watch(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function sidewaysScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    const d = (
      globalThis as unknown as {
        document: { documentElement: { scrollWidth: number; clientWidth: number } };
      }
    ).document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
}

test('flags show what waits; the sheet editor sends audited edits live', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watch(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Dashboard Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  for (const [name, cls] of [
    ['Jake', 'Archer'],
    ['Kim', 'Caster'],
  ] as const) {
    await create.getByLabel('Name', { exact: true }).fill(name);
    await create.getByLabel('Starting class').selectOption({ label: cls });
    await create.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
  const party = gm.locator('section[aria-labelledby="party"]');
  const jake = party.locator('[data-testid^="row-"]', { hasText: 'Jake' });
  const kim = party.locator('[data-testid^="row-"]', { hasText: 'Kim' });
  const jakeId = (await jake.getAttribute('data-testid'))!.slice(4);
  await expect(jake.getByTestId(`flags-${jakeId}`)).toHaveText('Nothing waiting.');

  // Jake alone to the top of G: his evolution is the GM's to release, and his
  // free points are his to spend. Kim has nothing waiting.
  const award = gm.getByRole('form', { name: 'Award class XP' });
  await award.getByLabel('Amount').fill('400');
  await award.getByRole('checkbox', { name: /Kim/ }).uncheck();
  await award.getByRole('button', { name: 'Award XP' }).click();
  await expect(jake.getByTestId(`class-level-${jakeId}`)).toHaveText('4');
  const flags = jake.getByRole('list', { name: 'Jake: waiting' });
  await expect(flags.getByRole('listitem')).toHaveText([
    'GM Evolution to F-grade: ready to release',
    'Player 8 free points to assign',
  ]);
  await expect(kim).toContainText('Nothing waiting.');
  await gm.screenshot({ path: path.join(shots, 'gm-dashboard-1366x768.png'), fullPage: true });

  // Jake's player screen, open beside the GM's.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watch(phone);
  await phone.goto(server.url);
  await phone.getByTestId('characters').getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  const hpBefore = await phone.getByTestId('pool-hp').innerText();

  // Edit the sheet: Vitality 10 → 12 raises max HP to 120; set HP to 115; a nickname.
  await jake.getByRole('button', { name: 'Edit sheet' }).click();
  const editor = gm.getByRole('form', { name: 'Edit Jake’s sheet' });
  await expect(editor).toBeVisible();
  await editor.getByLabel('Vitality').fill('12');
  await editor.getByLabel('Health Points (HP)').fill('115');
  await editor.getByLabel('[Basic Archery] nickname').fill('Pew Pew');
  await editor.screenshot({ path: path.join(shots, 'gm-sheet-editor-1366x768.png') });
  await editor.getByRole('button', { name: 'Save sheet' }).click();
  await expect(jake.getByRole('status')).toHaveText('Sheet saved (3 changes)');
  await expect(editor).toHaveCount(0);
  await expect(jake.getByTestId(`pool-${jakeId}-hp`)).toHaveText('115/120');

  // The player sees it live.
  await expect(phone.getByTestId('pool-hp')).toHaveText('115/120');
  expect(hpBefore).not.toBe('115/120');
  await expect(phone.getByTestId('stat-vitality')).toContainText('1.2');
  await expect(phone.getByRole('button', { name: /Basic Archery.*Pew Pew/ })).toBeVisible();

  // Each change is a GM event in the stored log (audited, undoable).
  const log = readFileSync(path.join(dataDir, 'campaigns', 'main', 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { type: string; actor: { role: string } });
  const edits = log.filter((e) =>
    ['character.statsSet', 'character.poolsSet', 'skill.nicknamed'].includes(e.type),
  );
  expect(edits.map((e) => [e.type, e.actor.role])).toEqual([
    ['character.statsSet', 'gm'],
    ['character.poolsSet', 'gm'],
    ['skill.nicknamed', 'gm'],
  ]);

  // Bad input is refused before anything is sent.
  await jake.getByRole('button', { name: 'Edit sheet' }).click();
  await editor.getByLabel('Strength').fill('-3');
  await expect(editor.getByRole('alert')).toHaveText(
    'Strength must be a whole number of 0 or more',
  );
  await expect(editor.getByRole('button', { name: 'Save sheet' })).toBeDisabled();
  // A pool above its maximum is refused by the engine and nothing is saved.
  await editor.getByLabel('Strength').fill('10');
  await editor.getByLabel('Health Points (HP)').fill('500');
  await editor.getByRole('button', { name: 'Save sheet' }).click();
  await expect(editor.getByRole('alert')).toContainText('between 0 and 120');
  await expect(jake.getByTestId(`pool-${jakeId}-hp`)).toHaveText('115/120');
  await jake.getByRole('button', { name: 'Close editor' }).click();

  // The player spends one batch of free points; the GM's flag follows live.
  await phone.getByRole('button', { name: '[Assign]' }).click();
  const assign = phone.getByTestId('assign');
  await assign.getByRole('button', { name: 'Add a point to Agility' }).click();
  await assign.getByRole('button', { name: 'Add a point to Agility' }).click();
  await assign.getByRole('button', { name: 'Review' }).click();
  await assign.getByRole('button', { name: 'Confirm' }).click();
  await expect(flags.getByRole('listitem').nth(1)).toHaveText('Player 6 free points to assign');

  // The GM returns that batch to the player: the flag counts it again.
  await jake.getByRole('button', { name: 'Edit sheet' }).click();
  const batches = editor.getByRole('group', { name: 'Assigned free points' });
  await expect(batches).toContainText('Race lvl 1: Agility +2');
  await batches.getByRole('button', { name: 'Return to player' }).click();
  await expect(flags.getByRole('listitem').nth(1)).toHaveText('Player 8 free points to assign');
  await expect(batches).toHaveCount(0);
  await expect(phone.getByTestId('free-points')).toHaveText('8');

  // The dashboard on a phone-width GM window: one column, no sideways scroll.
  await gm.setViewportSize({ width: 390, height: 844 });
  expect(await sidewaysScroll(gm)).toBeLessThanOrEqual(0);
  await party.screenshot({ path: path.join(shots, 'gm-dashboard-390x844.png') });
  expect(await sidewaysScroll(phone)).toBeLessThanOrEqual(0);
  await phone.screenshot({ path: path.join(shots, 'player-after-edit-390x844.png') });
  expect(gmErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
});
