import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MQ.12 Skill library rules (DESIGN §6, L4): entries are keyed by name and
// rarity, so an upgrade picks up the higher rarity's text; a library edit
// reaches every copy the GM has not edited by hand; a skill's effects reach
// its owner only.

const GM_KEY = 'e2e-gm-key-mq12-0123456789abcdef';
const CANARY = 'OWNER-ONLY-EFFECTS-CANARY-MQ12';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MQ.12');
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

/** Every WebSocket frame a page receives, as text. */
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

test('upgrades take the next rarity’s text; edits propagate; effects stay with the owner', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Library Rarity Test');
  await gm.getByLabel(/Start with the default classes/).uncheck();
  await gm.getByRole('button', { name: 'Create campaign' }).click();

  // Two entries for one name: Common and Uncommon. Only Uncommon has effects.
  const library = gm.locator('section[aria-labelledby="skill-library"]');
  const add = library.getByRole('button', { name: 'Add to library' });
  await library.getByLabel('Official name').fill('Identify');
  await library.getByLabel('Rarity').selectOption({ label: 'Common' });
  await library.getByLabel('Description (players see this)').fill('Common: learn a name.');
  await add.click();
  await expect(library.getByRole('status')).toHaveText('[Identify] added to the library');
  await library.getByLabel('Official name').fill('Identify');
  await library.getByLabel('Rarity').selectOption({ label: 'Uncommon' });
  await library.getByLabel('Description (players see this)').fill('Uncommon: learn a nature.');
  await library.getByLabel('Effects (only the skill’s owner sees this)').fill(CANARY);
  await add.click();
  await expect(library.getByRole('status')).toHaveText('[Identify] added to the library');
  const list = library.getByRole('list', { name: 'Library skills' });
  await expect(list.getByRole('listitem')).toHaveCount(2);

  for (const [id, name] of [
    ['jake', 'Jake'],
    ['kim', 'Kim'],
  ] as const) {
    await gmCommand(gm, {
      type: 'character.create',
      id,
      name,
      className: 'Archer',
      classSkills: [
        { name: 'Basic Archery', rarity: 'inferior' },
        { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
        { name: 'Archer’s Eye', rarity: 'common' },
      ],
    });
    await expect(gm.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }

  // Jake on a laptop and a phone; Kim on a laptop, watching every frame.
  const jake = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const jakeErrors = watchErrors(jake);
  await jake.goto(server.url);
  await jake.getByRole('link', { name: /Jake/ }).click();
  await jake.getByRole('button', { name: /\[Identify \(Common\)\]/ }).click();
  const detail = jake.getByTestId('skill-detail');
  await expect(detail.getByTestId('skill-detail-description')).toHaveText('Common: learn a name.');
  await expect(detail.getByTestId('skill-detail-effects')).toHaveCount(0);

  const kim = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const kimErrors = watchErrors(kim);
  const kimFrames = watchFrames(kim);
  await kim.goto(server.url);
  await kim.getByRole('link', { name: /Kim/ }).click();
  await expect(kim.getByRole('button', { name: /\[Identify \(Common\)\]/ })).toBeVisible();

  // Jake earns 4 marks and upgrades: his copy takes the Uncommon entry's text
  // and effects, live, while the dialog stays open.
  for (let s = 1; s <= 4; s++) {
    await gmCommand(gm, {
      type: 'skill.awardMark',
      characterId: 'jake',
      skill: 'Identify',
      session: `mq12-s${s}`,
    });
  }
  await gmCommand(gm, { type: 'skill.upgrade', characterId: 'jake', skill: 'Identify' });
  await expect(detail.getByTestId('skill-detail-description')).toHaveText(
    'Uncommon: learn a nature.',
  );
  await expect(detail.getByTestId('skill-detail-effects')).toHaveText(CANARY);
  await expect(
    jake.getByTestId('skills-race').getByRole('button', { name: /\[Identify \(Uncommon\)\]/ }),
  ).toBeVisible();
  await noSidewaysScroll(jake);
  await jake.screenshot({ path: path.join(shots, 'player-upgraded-1366x768.png') });

  // The GM edits the Uncommon entry in the library form: Jake's open dialog
  // follows; Kim's Common copy does not change.
  await list.getByRole('button', { name: /\[Identify\].*\(Uncommon\)/ }).click();
  await library
    .getByLabel('Description (players see this)')
    .fill('Uncommon, revised: learn a nature and a weakness.');
  await library.getByRole('button', { name: 'Save changes' }).click();
  await expect(library.getByRole('status')).toHaveText('[Identify] saved');
  await expect(detail.getByTestId('skill-detail-description')).toHaveText(
    'Uncommon, revised: learn a nature and a weakness.',
  );
  await gm.screenshot({ path: path.join(shots, 'gm-library-1366x768.png'), fullPage: true });

  await kim.getByRole('button', { name: /\[Identify \(Common\)\]/ }).click();
  await expect(kim.getByTestId('skill-detail-description')).toHaveText('Common: learn a name.');
  await expect(kim.getByTestId('skill-detail-effects')).toHaveCount(0);

  // Jake's phone shows the same, in one column.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await phone
    .getByTestId('skills-race')
    .getByRole('button', { name: /\[Identify \(Uncommon\)\]/ })
    .click();
  await expect(phone.getByTestId('skill-detail-effects')).toHaveText(CANARY);
  await noSidewaysScroll(phone);
  await phone.screenshot({ path: path.join(shots, 'player-upgraded-390x844.png') });

  // Kim never received Jake's effects in any frame or in her page.
  expect(kimFrames.length).toBeGreaterThan(0);
  expect(kimFrames.join('\n')).not.toContain(CANARY);
  expect(await kim.content()).not.toContain(CANARY);

  expect(jakeErrors).toEqual([]);
  expect(kimErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
