import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.5 Skill detail: official name in its rarity colour (always shown), the
// System description and flavour, mark progress, nickname edit (DESIGN §6).

const GM_KEY = 'e2e-gm-key-m35-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.5');
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

/** Runs one GM command over the GM page's own origin (no console form for it yet). */
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

async function award(gm: Page, amount: number) {
  const form = gm.locator('form[aria-labelledby="award-xp"]');
  await gm.getByLabel('Amount').fill(String(amount));
  await gm.getByRole('button', { name: 'Award XP' }).click();
  await expect(form.getByRole('status').or(form.getByRole('alert'))).toHaveText('XP awarded');
}

test('a player reads a skill and nicknames it; the official name stays', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Skills Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByLabel('Name', { exact: true }).fill('Jake');
  await gm.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('cell', { name: 'Jake', exact: true })).toBeVisible();

  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(laptop);
  await laptop.goto(server.url);
  await laptop.getByRole('link', { name: /Jake/ }).click();
  const characterId = new URL(laptop.url()).pathname.split('/').at(-1);
  await gmCommand(gm, {
    type: 'skill.awardMark',
    characterId,
    skill: 'Basic Archery',
    session: 'e2e-1',
  });

  // Keyboard: the skill row is a button; Enter opens the detail dialog.
  const archery = laptop.getByRole('button', { name: /\[Basic Archery \(Inferior\)\]/ });
  await archery.focus();
  await laptop.keyboard.press('Enter');
  const detail = laptop.getByTestId('skill-detail');
  await expect(detail).toBeVisible();
  await expect(laptop.getByRole('dialog', { name: '[Basic Archery (Inferior)]' })).toBeVisible();
  await expect(detail.getByTestId('skill-detail-description')).toContainText(
    'basic understanding of the bow',
  );
  await expect(detail.getByTestId('skill-detail-flavor')).toHaveText(
    'Every hunter starts with a string and a stick.',
  );
  await expect(detail.getByTestId('skill-detail-marks')).toHaveText('1 / 3 marks toward Common.');
  await expect(detail.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  // Rarity colour comes from the rarity class (Inferior is grey).
  const colour = await detail
    .getByTestId('skill-detail-name')
    .evaluate(
      (el) =>
        (
          globalThis as unknown as { getComputedStyle: (e: unknown) => { color: string } }
        ).getComputedStyle(el).color,
    );
  expect(colour).toBe('rgb(154, 154, 154)');
  await expect(detail.getByTestId('skill-detail-nickname')).toHaveText('Nickname: none');
  await laptop.screenshot({ path: path.join(shots, 'player-detail-1366x768.png') });

  // A live mark lands while the detail is open.
  await gmCommand(gm, {
    type: 'skill.awardMark',
    characterId,
    skill: 'Basic Archery',
    session: 'e2e-2',
  });
  await expect(detail.getByTestId('skill-detail-marks')).toHaveText('2 / 3 marks toward Common.');

  // Nickname: add, Escape cancels the edit only, then save.
  await detail.getByRole('button', { name: 'Add nickname' }).click();
  const input = detail.getByLabel('Nickname');
  await expect(input).toBeFocused();
  await input.fill('Nope');
  await laptop.keyboard.press('Escape');
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('skill-detail-nickname')).toHaveText('Nickname: none');
  await expect(detail.getByRole('button', { name: 'Add nickname' })).toBeFocused();
  await detail.getByRole('button', { name: 'Add nickname' }).click();
  await input.fill('  Jake Juice  ');
  await laptop.screenshot({ path: path.join(shots, 'player-nickname-1366x768.png') });
  await detail.getByRole('button', { name: 'Save' }).click();
  await expect(detail.getByTestId('skill-detail-nickname')).toHaveText('Nickname: “Jake Juice”');
  await expect(detail.getByTestId('skill-detail-name')).toHaveText('[Basic Archery (Inferior)]');
  await expect(detail.getByRole('button', { name: 'Edit nickname' })).toBeFocused();

  // Escape closes the dialog; focus returns to the skill; the sheet shows both names.
  await laptop.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  const row = laptop.getByRole('button', { name: /\[Basic Archery \(Inferior\)\]/ });
  await expect(row).toBeFocused();
  await expect(row).toHaveText('[Basic Archery (Inferior)] “Jake Juice”');

  // The race skill has no System text yet in a fresh campaign.
  await laptop.getByRole('button', { name: /\[Identify \(Common\)\]/ }).click();
  await expect(detail.getByTestId('skill-detail-description')).toHaveText(
    'The System has not described this skill yet.',
  );
  await expect(detail.getByTestId('skill-detail-flavor')).toHaveCount(0);
  // The GM writes it in the console's Skill text form; the open detail updates live.
  const form = gm.locator('form[aria-labelledby="skill-text"]');
  await form.getByLabel('Skill').selectOption('Identify');
  await expect(form.getByLabel('Description')).toHaveValue('');
  await form.getByLabel('Description').fill('Reveals what the System knows.');
  await form.getByLabel('Flavour').fill('Knowledge first.');
  await form.getByRole('button', { name: 'Save skill text' }).click();
  await expect(form.getByRole('status')).toHaveText('Skill text saved');
  await form.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-skill-text-1366x768.png') });
  await expect(detail.getByTestId('skill-detail-description')).toHaveText(
    'Reveals what the System knows.',
  );
  await expect(detail.getByTestId('skill-detail-flavor')).toHaveText('Knowledge first.');
  await detail.getByRole('button', { name: 'Close skill details' }).click();
  await expect(detail).toHaveCount(0);

  // The nickname is removable.
  await row.click();
  await detail.getByRole('button', { name: 'Edit nickname' }).click();
  await detail.getByRole('button', { name: 'Remove nickname' }).click();
  await expect(detail.getByTestId('skill-detail-nickname')).toHaveText('Nickname: none');
  await laptop.keyboard.press('Escape');
  await expect(row).toHaveText('[Basic Archery (Inferior)]');

  // The GM's View-as pane shows the detail but no nickname editor.
  const pane = await browser.newPage({ viewport: { width: 340, height: 600 } });
  const paneErrors = watchErrors(pane);
  await pane.goto(`${laptop.url()}?pane=1`);
  await pane.getByRole('button', { name: /\[Basic Archery \(Inferior\)\]/ }).click();
  await expect(pane.getByTestId('skill-detail-marks')).toHaveText('2 / 3 marks toward Common.');
  await expect(pane.getByRole('button', { name: /nickname/i })).toHaveCount(0);
  await pane.close();

  // Phone: 390 wide, the dialog fits with no sideways scroll.
  await gmCommand(gm, {
    type: 'skill.setUnique',
    characterId,
    skill: 'Archer’s Eye',
    unique: true,
  });
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(laptop.url());
  await phone.getByRole('button', { name: /\[Archer’s Eye \(Common\)\]/ }).click();
  const phoneDetail = phone.getByTestId('skill-detail');
  await expect(phoneDetail.getByTestId('skill-detail-unique')).toBeVisible();
  await expect(phoneDetail.getByTestId('skill-detail-marks')).toHaveText(
    '0 / 4 marks toward Uncommon.',
  );
  const box = await phoneDetail.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  const width = await phone.locator('html').evaluate((el) => el.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await phone.screenshot({ path: path.join(shots, 'player-detail-390x844.png') });
  await phoneDetail.getByRole('button', { name: 'Close skill details' }).click();
  await expect(phoneDetail).toHaveCount(0);

  // A skill that stops existing (here an evolution transforms it) closes its
  // open detail with a notice instead of showing another skill.
  await phone.getByRole('button', { name: /\[Basic Archery \(Inferior\)\]/ }).click();
  await expect(phoneDetail).toBeVisible();
  await award(gm, 400);
  await gmCommand(gm, {
    type: 'evolution.release',
    characterId,
    options: [
      {
        className: 'Hunter',
        transforms: [{ skill: 'Basic Archery', name: 'Hunter’s Archery', rarity: 'common' }],
      },
    ],
  });
  await gmCommand(gm, { type: 'evolution.choose', characterId, optionId: 'o1' });
  await expect(phoneDetail).toHaveCount(0);
  await expect(phone.getByTestId('skill-notice')).toHaveText(
    '[Basic Archery] changed, so its details were closed.',
  );
  // The renamed skill starts without the old skill's text.
  await phone.getByRole('button', { name: /\[Hunter’s Archery \(Common\)\]/ }).click();
  await expect(phoneDetail.getByTestId('skill-detail-description')).toHaveText(
    'The System has not described this skill yet.',
  );
  await expect(phoneDetail.getByTestId('skill-detail-marks')).toHaveText(
    '0 / 4 marks toward Uncommon.',
  );

  expect(errors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(paneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
