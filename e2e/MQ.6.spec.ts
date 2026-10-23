import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer } from './helpers/server';

// MQ.6 Tailored professions: the GM offers a character their own professions
// at the E-grade evolution; the player may take one with the evolution, or
// choose "none for now" and take one later from the Professions tab, after
// which the list locks (greyed). Party members never see the offers.

const GM_KEY = 'e2e-gm-key-mq6-0123456789abcdef0';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MQ.6');

test.beforeAll(() => {
  mkdirSync(shots, { recursive: true });
});

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

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

/** Clicks through the DING pop-ups so screenshots show the window, not a toast. */
async function clearDings(page: Page) {
  const toast = page.getByTestId('ding-toast');
  for (let i = 0; i < 20 && (await toast.count()) > 0; i++) {
    await toast.click().catch(() => undefined);
  }
  await expect(toast).toHaveCount(0);
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

/** The demo campaign, with Casper (F, no profession) released into E with two offers. */
async function casperOfferedAtE(gm: Page, serverUrl: string): Promise<void> {
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${serverUrl}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Professions Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();
  await gmCommand(gm, {
    type: 'xp.award',
    amount: 5000,
    track: 'class',
    participants: [{ characterId: 'demo-casper' }],
  });
  await gmCommand(gm, {
    type: 'selection.offer',
    characterId: 'demo-casper',
    level: 10,
    options: [
      { name: 'Hawk Step', rarity: 'rare' },
      { name: 'Quiet Draw', rarity: 'common' },
      { name: 'Trail Sign', rarity: 'common' },
    ],
  });
  await gmCommand(gm, {
    type: 'selection.choose',
    characterId: 'demo-casper',
    level: 10,
    skill: 'Quiet Draw',
  });
  await gmCommand(gm, {
    type: 'evolution.release',
    characterId: 'demo-casper',
    options: [{ className: 'Pathfinder', description: 'Walks where others cannot.' }],
    professions: ['Trapper', 'Beast Tamer'],
  });
}

async function openPlayer(page: Page, serverUrl: string, name: RegExp): Promise<void> {
  await page.goto(serverUrl);
  await page.getByRole('link', { name }).click();
  await expect(page.getByTestId('name')).toBeVisible();
}

test('declining at the evolution, then taking a profession later from the Professions tab', async ({
  browser,
}) => {
  const server = await startBuiltServer({ GM_KEY });
  try {
    const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const gmErrors = watchErrors(gm);
    await casperOfferedAtE(gm, server.url);

    const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = watchErrors(laptop);
    await openPlayer(laptop, server.url, /Casper/);
    const jake = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const jakeErrors = watchErrors(jake);
    await openPlayer(jake, server.url, /Jake/);

    // Before the evolution, nothing is offered yet on the sheet.
    await expect(laptop.getByTestId('professions')).toHaveCount(0);
    await laptop.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
    const dialog = laptop.getByTestId('evolution');
    await dialog.getByRole('button', { name: 'Choose Pathfinder' }).click();
    const pick = dialog.getByLabel('Profession');
    await expect(pick.locator('option')).toHaveText(['None for now', 'Trapper', 'Beast Tamer']);
    await expect(pick).toHaveValue('');
    await expect(dialog).toContainText('take one later from Professions');
    await dialog.getByRole('button', { name: 'Evolve' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(laptop.getByTestId('evolution-notice')).toHaveCount(0);

    // Evolved, no profession: race level is the class level (DESIGN §2).
    await expect(laptop.getByTestId('race')).toContainText('(E)');
    await expect(laptop.getByTestId('profession')).toHaveCount(0);
    const classLevel = (await laptop.getByTestId('class').textContent())?.match(/lvl (\d+)/)?.[1];
    expect(classLevel).toBeDefined();
    await expect(laptop.getByTestId('race')).toContainText(`lvl ${classLevel}]`);

    const tab = laptop.getByTestId('professions');
    await expect(tab.getByTestId('profession-offer')).toHaveText([
      /\[Trapper\]\s*\[Take\]/,
      /\[Beast Tamer\]\s*\[Take\]/,
    ]);
    await expect(tab).toContainText(`starts at your class level (${classLevel})`);
    // The party never sees someone else's offers.
    await expect(jake.getByText('Beast Tamer')).toHaveCount(0);
    // Jake's own tab lists only his own offers (demo: Alchemist, Smith).
    await expect(jake.getByTestId('professions')).not.toContainText('Trapper');
    await expect(jake.getByTestId('professions')).toContainText('[Alchemist]');
    await noSidewaysScroll(laptop);
    await clearDings(laptop);
    await tab.screenshot({ path: path.join(shots, 'player-professions-offered-1366x768.png') });

    // Take → Cancel puts focus back on that offer's button.
    await tab.getByRole('button', { name: 'Take Beast Tamer' }).click();
    const confirm = tab.getByRole('group', { name: 'Confirm Beast Tamer' });
    await expect(confirm.getByRole('button', { name: 'Confirm' })).toBeFocused();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(tab.getByRole('button', { name: 'Take Beast Tamer' })).toBeFocused();

    // Phone: the same tab, taken from there.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const phoneErrors = watchErrors(phone);
    await openPlayer(phone, server.url, /Casper/);
    const phoneTab = phone.getByTestId('professions');
    await phoneTab.scrollIntoViewIfNeeded();
    await noSidewaysScroll(phone);
    await clearDings(phone);
    await phone.screenshot({ path: path.join(shots, 'player-professions-offered-390x844.png') });
    await phoneTab.getByRole('button', { name: 'Take Beast Tamer' }).click();
    await phoneTab.getByRole('button', { name: 'Confirm' }).click();

    // Both screens lock: Beast Tamer chosen at the class level, Trapper greyed.
    for (const page of [laptop, phone]) {
      await expect(page.getByTestId('profession')).toHaveText(`[Beast Tamer – lvl ${classLevel}]`);
      const locked = page.getByTestId('professions');
      await expect(locked.getByTestId('professions-locked')).toHaveText(
        'Locked: you are a [Beast Tamer].',
      );
      await expect(locked.getByRole('button')).toHaveCount(0);
      const offers = locked.getByTestId('profession-offer');
      await expect(offers.nth(0)).toHaveAttribute('aria-disabled', 'true');
      await expect(offers.nth(0)).toHaveCSS('opacity', '0.5');
      await expect(offers.nth(1)).toContainText('Chosen');
      await expect(offers.nth(1)).not.toHaveAttribute('aria-disabled', 'true');
    }
    await expect(phone.locator('#professions-heading')).toBeFocused();
    // The party sees the new profession, still not the offers.
    const casper = jake.getByTestId('party').getByRole('listitem', { name: 'Casper' });
    await expect(casper.getByTestId('party-profession')).toHaveText(
      `[Beast Tamer – lvl ${classLevel}]`,
    );
    await expect(jake.getByText('Trapper')).toHaveCount(0);
    // The DING says the profession was acquired at the class level, not "levels 1–N".
    await expect(phone.getByTestId('ding-toast').first()).toContainText(
      `*'DING!' Profession acquired: [Beast Tamer] – lvl ${classLevel}*`,
    );
    await clearDings(laptop);
    await clearDings(phone);
    await laptop
      .getByTestId('professions')
      .screenshot({ path: path.join(shots, 'player-professions-locked-1366x768.png') });
    await phone.getByTestId('professions').scrollIntoViewIfNeeded();
    await phone.screenshot({ path: path.join(shots, 'player-professions-locked-390x844.png') });

    expect([...gmErrors, ...errors, ...jakeErrors, ...phoneErrors]).toEqual([]);
  } finally {
    await server.stop();
  }
});

test('taking a profession with the evolution locks the list at once', async ({ browser }) => {
  const server = await startBuiltServer({ GM_KEY });
  try {
    const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const gmErrors = watchErrors(gm);
    await casperOfferedAtE(gm, server.url);
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = watchErrors(phone);
    await openPlayer(phone, server.url, /Casper/);
    await phone.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
    const dialog = phone.getByTestId('evolution');
    await dialog.getByRole('button', { name: 'Choose Pathfinder' }).click();
    await dialog.getByLabel('Profession').selectOption('Trapper');
    await dialog.getByRole('button', { name: 'Evolve' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(phone.getByTestId('profession')).toHaveText(/^\[Trapper – lvl \d+\]$/);
    const tab = phone.getByTestId('professions');
    await expect(tab.getByTestId('professions-locked')).toHaveText('Locked: you are a [Trapper].');
    await expect(tab.getByRole('button')).toHaveCount(0);
    await expect(tab.getByTestId('profession-offer').nth(0)).toContainText('Chosen');
    await expect(tab.getByTestId('profession-offer').nth(1)).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect([...gmErrors, ...errors]).toEqual([]);
  } finally {
    await server.stop();
  }
});
