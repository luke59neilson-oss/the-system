import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MR.2 Every upgrade starts at 0 marks (DESIGN §6, L15): the skill detail says
// so when an upgrade is ready and shows 0 after it; the evolution screen says a
// transformed skill starts at 0 and the transformed skill has none.

const GM_KEY = 'e2e-gm-key-mr2-0123456789abcdef02';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MR.2');
let server: RunningServer;

// One server per test, so neither viewport depends on the other's campaign.
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

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`upgrades and transforms start at 0 marks (${viewport.width}x${viewport.height})`, async ({
    browser,
  }) => {
    const size = `${viewport.width}x${viewport.height}`;
    const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const gmErrors = watchErrors(gm);
    await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
    await gm.getByLabel('Campaign name').fill(`Fresh marks ${viewport.width}`);
    await gm.getByRole('button', { name: 'Create campaign' }).click();
    await gm.getByLabel('Name', { exact: true }).fill('Jake');
    await gm.getByRole('button', { name: 'Create character' }).click();
    await expect(gm.getByRole('cell', { name: 'Jake', exact: true })).toBeVisible();

    const page = await browser.newPage({ viewport });
    const errors = watchErrors(page);
    await page.goto(server.url);
    await page.getByRole('link', { name: /Jake/ }).click();
    const characterId = new URL(page.url()).pathname.split('/').at(-1);

    // Three sessions' marks make Basic Archery (Inferior) ready for Common.
    for (const session of ['s1', 's2', 's3'])
      await gmCommand(gm, {
        type: 'skill.awardMark',
        characterId,
        skill: 'Basic Archery',
        session,
      });
    await page.getByRole('button', { name: /\[Basic Archery \(Inferior\)\]/ }).click();
    const detail = page.getByTestId('skill-detail');
    await expect(detail.getByTestId('skill-detail-marks')).toHaveText(
      '3 / 3 marks toward Common. Ready: the GM can upgrade it. The upgraded skill starts at 0 marks.',
    );
    await page.screenshot({ path: path.join(shots, `player-upgrade-ready-${size}.png`) });

    // The upgrade lands while the detail is open: Common, 0 marks.
    await gmCommand(gm, { type: 'skill.upgrade', characterId, skill: 'Basic Archery' });
    await expect(page.getByRole('dialog', { name: '[Basic Archery (Common)]' })).toBeVisible();
    await expect(detail.getByTestId('skill-detail-marks')).toHaveText(
      '0 / 4 marks toward Uncommon.',
    );
    await page.screenshot({ path: path.join(shots, `player-upgraded-${size}.png`) });
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);

    // A marked skill transformed at evolution starts at 0 too.
    await gmCommand(gm, {
      type: 'skill.awardMark',
      characterId,
      skill: 'Basic One-Handed Weapon',
      session: 's4',
    });
    await gmCommand(gm, {
      type: 'xp.award',
      amount: 2000,
      track: 'class',
      participants: [{ characterId }],
    });
    await expect(page.getByTestId('race')).toContainText('lvl 4');
    await gmCommand(gm, {
      type: 'evolution.release',
      characterId,
      options: [
        {
          className: 'Hatchet Ranger',
          transforms: [
            { skill: 'Basic One-Handed Weapon', name: 'Hatchet Work', rarity: 'common' },
          ],
        },
      ],
    });
    await page.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
    const dialog = page.getByTestId('evolution');
    await expect(dialog.getByTestId('evolution-rerate')).toContainText(
      'the next upgrade costs the new rarity’s marks and starts the skill again at 0. A skill a path transforms follows that path instead and starts at 0 marks.',
    );
    await dialog.getByRole('button', { name: 'Choose Hatchet Ranger' }).click();
    await expect(dialog.getByTestId('evolution-warnings')).toContainText(
      '[Basic One-Handed Weapon] becomes [Hatchet Work]: a transformed skill starts at 0 marks, so its 1 mastery mark resets.',
    );
    await page.screenshot({ path: path.join(shots, `player-evolution-reset-${size}.png`) });
    await dialog.getByRole('button', { name: 'Evolve' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('race')).toContainText('(F)');

    await page.getByRole('button', { name: /\[Hatchet Work \(Common\)\]/ }).click();
    await expect(detail.getByTestId('skill-detail-marks')).toHaveText(
      /^0 \/ \d+ marks toward Uncommon\.$/,
    );

    expect(errors).toEqual([]);
    expect(gmErrors).toEqual([]);
  });
}
