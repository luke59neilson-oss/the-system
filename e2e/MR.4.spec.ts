import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MR.4 (DESIGN §6, L17): a skill copy the GM hand-wrote keeps its text when
// the skill upgrades; the GM's Skill text form has Use library text, which
// hands the copy back to the library entry for its current name and rarity
// (disabled when the copy already follows the library or there is no entry).

const GM_KEY = 'e2e-gm-key-mr4-0123456789abcdefg';
const HAND = 'Jake’s own words for Identify.';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MR.4');
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

async function markAndUpgrade(gm: Page, from: number, marks: number) {
  for (let s = from; s < from + marks; s++) {
    await gmCommand(gm, {
      type: 'skill.awardMark',
      characterId: 'jake',
      skill: 'Identify',
      session: `mr4-s${s}`,
    });
  }
  await gmCommand(gm, { type: 'skill.upgrade', characterId: 'jake', skill: 'Identify' });
}

test('hand-written text survives an upgrade until the GM presses Use library text', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Hand Text Test');
  await gm.getByLabel(/Start with the default classes/).uncheck();
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  for (const [id, rarity, text] of [
    ['idc', 'common', 'Common: learn a name.'],
    ['idu', 'uncommon', 'Uncommon: learn a nature.'],
  ] as const) {
    await gmCommand(gm, {
      type: 'skillDef.define',
      id,
      name: 'Identify',
      rarity,
      tags: [],
      description: text,
      flavor: '',
      effects: '',
    });
  }
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
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();

  const jake = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const jakeErrors = watchErrors(jake);
  await jake.goto(server.url);
  await jake.getByRole('link', { name: /Jake/ }).click();
  await jake.getByRole('button', { name: /\[Identify \(Common\)\]/ }).click();
  const detail = jake.getByTestId('skill-detail');
  await expect(detail.getByTestId('skill-detail-description')).toHaveText('Common: learn a name.');

  // A copy that follows the library: Use library text is disabled.
  const form = gm.locator('form[aria-labelledby="skill-text"]');
  const useLibrary = form.getByRole('button', { name: 'Use library text' });
  await form.getByLabel('Character').selectOption({ label: 'Jake' });
  await form.getByLabel('Skill').selectOption('Identify');
  await expect(form.getByTestId('skill-text-source')).toHaveText('Follows the library entry.');
  await expect(useLibrary).toBeDisabled();

  // The GM hand-writes Jake's copy; the button turns on.
  await form.getByLabel('Description').fill(HAND);
  await form.getByRole('button', { name: 'Save skill text' }).click();
  await expect(form.getByRole('status')).toHaveText('Skill text saved');
  await expect(form.getByTestId('skill-text-source')).toHaveText('Hand-written text.');
  await expect(useLibrary).toBeEnabled();
  await expect(form).toContainText('library edits and upgrades keep its text');
  await expect(detail.getByTestId('skill-detail-description')).toHaveText(HAND);

  // Upgrade to Uncommon: the hand-written text stays (L17), live on Jake's screen.
  await markAndUpgrade(gm, 1, 4);
  await expect(
    jake.getByTestId('skills-race').getByRole('button', { name: /\[Identify \(Uncommon\)\]/ }),
  ).toBeVisible();
  await expect(detail.getByTestId('skill-detail-description')).toHaveText(HAND);
  await expect(form.getByLabel('Description')).toHaveValue(HAND);
  await expect(useLibrary).toBeEnabled();
  await form.scrollIntoViewIfNeeded();
  await gm.screenshot({ path: path.join(shots, 'gm-skill-text-1366x768.png') });
  await jake.screenshot({ path: path.join(shots, 'player-hand-text-1366x768.png') });

  // Use library text: the copy takes the Uncommon entry's text and follows it again.
  await useLibrary.click();
  await expect(form.getByRole('status')).toHaveText('Library text in use');
  await expect(detail.getByTestId('skill-detail-description')).toHaveText(
    'Uncommon: learn a nature.',
  );
  await expect(form.getByLabel('Description')).toHaveValue('Uncommon: learn a nature.');
  await expect(form.getByTestId('skill-text-source')).toHaveText('Follows the library entry.');
  await expect(useLibrary).toBeDisabled();
  await gmCommand(gm, {
    type: 'skillDef.edit',
    skillDefId: 'idu',
    description: 'Uncommon, revised.',
  });
  await expect(detail.getByTestId('skill-detail-description')).toHaveText('Uncommon, revised.');
  await gm.screenshot({ path: path.join(shots, 'gm-library-text-1366x768.png') });

  // Hand-written again, then Rare: no Rare entry, so the button stays disabled.
  await form.getByLabel('Description').fill(HAND);
  await form.getByRole('button', { name: 'Save skill text' }).click();
  await expect(form.getByRole('status')).toHaveText('Skill text saved');
  await markAndUpgrade(gm, 5, 6);
  await expect(
    jake.getByTestId('skills-race').getByRole('button', { name: /\[Identify \(Rare\)\]/ }),
  ).toBeVisible();
  await expect(detail.getByTestId('skill-detail-description')).toHaveText(HAND);
  await expect(form.getByTestId('skill-text-source')).toHaveText('Hand-written text.');
  await expect(useLibrary).toBeDisabled();
  await expect(useLibrary).toHaveAttribute(
    'title',
    /no entry with text for this skill at its rarity/,
  );

  // Jake's phone shows the hand text in one column.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await phone
    .getByTestId('skills-race')
    .getByRole('button', { name: /\[Identify \(Rare\)\]/ })
    .click();
  await expect(phone.getByTestId('skill-detail-description')).toHaveText(HAND);
  await noSidewaysScroll(phone);
  await phone.screenshot({ path: path.join(shots, 'player-hand-text-390x844.png') });

  expect(jakeErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
