import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.13 Evolution screen: a released evolution shows its paths (class name,
// transforms, reshaped stats), warns before the choice, takes a profession
// and evolves the character; party members never see the options.

const GM_KEY = 'e2e-gm-key-m313-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.13');
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

test('a player chooses a released evolution with a profession', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Evolution Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(laptop);
  await laptop.goto(server.url);
  await laptop.getByRole('link', { name: /Casper/ }).click();
  await expect(laptop.getByTestId('class')).toHaveText('[Ranger – lvl 7]');
  await expect(laptop.getByTestId('evolution-pending')).toHaveCount(0);
  const skill =
    (await laptop
      .getByTestId('skills-class')
      .getByTestId('skill')
      .first()
      .locator('button')
      .getAttribute('data-skill')) ?? '';
  expect(skill).not.toBe('');

  const jake = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const jakeErrors = watchErrors(jake);
  await jake.goto(server.url);
  await jake.getByRole('link', { name: /Jake/ }).click();
  await expect(jake.getByTestId('party')).toContainText('Casper');

  // Casper reaches the top of F-grade; the GM marks a skill and releases.
  await gmCommand(gm, {
    type: 'xp.award',
    amount: 5000,
    track: 'class',
    participants: [{ characterId: 'demo-casper' }],
  });
  await expect(laptop.getByTestId('class')).toHaveText('[Ranger – lvl 14]');
  await gmCommand(gm, {
    type: 'skill.awardMark',
    characterId: 'demo-casper',
    skill,
    session: 'e2e-m313',
  });
  await gmCommand(gm, {
    type: 'evolution.release',
    characterId: 'demo-casper',
    options: [
      {
        className: 'Pathfinder',
        description: 'Walks where others cannot.',
        transforms: [{ skill, name: 'Pathfinder’s Eye', rarity: 'uncommon' }],
      },
      {
        className: 'Storm Ranger',
        transforms: [{ skill, name: 'Storm Shot', rarity: 'rare' }],
        classWeights: { agility: 3, perception: 2, endurance: 1 },
      },
    ],
    professions: ['Cook', 'Alchemist'],
  });
  const pending = laptop.getByTestId('evolution-pending');
  await expect(pending.getByTestId('evolution-badge')).toHaveText('E-grade available');
  // Party members never see someone else's evolution.
  await expect(jake.getByText('Pathfinder')).toHaveCount(0);
  await expect(jake.getByTestId('evolution-pending')).toHaveCount(0);

  await pending.getByRole('button', { name: '[Evolve]' }).click();
  const dialog = laptop.getByTestId('evolution');
  await expect(dialog.getByTestId('evolution-option')).toHaveCount(2);
  const storm = dialog.getByRole('listitem', { name: '[Storm Ranger]' });
  await expect(storm).toContainText(`→ [Storm Shot (Rare)]`);
  await expect(storm).toContainText(
    'Class stats per level: Agility 3 · Perception 2 · Endurance 1',
  );
  await laptop.screenshot({ path: path.join(shots, 'player-evolution-1366x768.png') });

  // Close leaves it for later; reopen and pick.
  await dialog.getByRole('button', { name: 'Close evolution' }).click();
  await expect(dialog).toHaveCount(0);
  await pending.getByRole('button', { name: '[Evolve]' }).click();
  await dialog.getByRole('button', { name: 'Choose Storm Ranger' }).click();
  const warnings = dialog.getByTestId('evolution-warnings');
  await expect(warnings).toContainText(
    new RegExp(`\\[${skill}\\] becomes \\[Storm Shot\\]: its \\d+ mastery marks? resets? to 0\\.`),
  );
  await expect(warnings).toContainText('Your class stat spread changes');
  await expect(warnings).toContainText('The choice is final');
  await dialog.getByLabel('Profession').selectOption('Cook');
  await laptop.screenshot({ path: path.join(shots, 'player-evolution-review-1366x768.png') });
  await dialog.getByRole('button', { name: 'Evolve' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(pending).toHaveCount(0);
  await expect(laptop.getByTestId('evolution-notice')).toHaveCount(0);
  await expect(laptop.getByTestId('class')).toHaveText(/^\[Storm Ranger – lvl \d+\]$/);
  await expect(laptop.getByTestId('race')).toContainText('(E)');
  await expect(laptop.getByTestId('profession')).toHaveText(/^\[Cook – lvl \d+\]$/);
  await expect(laptop.getByTestId('skills-class')).toContainText('[Storm Shot (Rare)]');
  // The party sees the new class and profession.
  const casper = jake.getByTestId('party').getByRole('listitem', { name: 'Casper' });
  await expect(casper.getByTestId('party-class')).toContainText('[Storm Ranger');
  await expect(casper.getByTestId('party-profession')).toContainText('[Cook');

  // Phone: a second release (the next grade is far off, so use Sultan at G).
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Sultan/ }).click();
  await gmCommand(gm, {
    type: 'xp.award',
    amount: 2000,
    track: 'class',
    participants: [{ characterId: 'demo-sultan' }],
  });
  const sultanSkill =
    (await phone
      .getByTestId('skills-class')
      .getByTestId('skill')
      .first()
      .locator('button')
      .getAttribute('data-skill')) ?? '';
  await gmCommand(gm, {
    type: 'evolution.release',
    characterId: 'demo-sultan',
    options: [
      {
        className: 'Longbow Adept',
        description: 'Distance is a weapon.',
        transforms: [{ skill: sultanSkill, name: 'Long Draw', rarity: 'common' }],
      },
      {
        className: 'Skirmisher',
        transforms: [{ skill: sultanSkill, name: 'Snap Shot', rarity: 'common' }],
      },
      {
        className: 'Warden',
        transforms: [{ skill: sultanSkill, name: 'Guard Shot', rarity: 'common' }],
      },
    ],
  });
  await phone.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' }).click();
  const phoneDialog = phone.getByTestId('evolution');
  await expect(phoneDialog.getByTestId('evolution-option')).toHaveCount(3);
  await expect(phoneDialog.getByLabel('Profession')).toHaveCount(0);
  await phone.screenshot({ path: path.join(shots, 'player-evolution-390x844.png') });
  // The GM re-releases while the dialog is open: it closes with a notice.
  await gmCommand(gm, {
    type: 'evolution.release',
    characterId: 'demo-sultan',
    options: [
      {
        className: 'Skirmisher',
        transforms: [{ skill: sultanSkill, name: 'Snap Shot', rarity: 'common' }],
      },
      {
        className: 'Warden',
        transforms: [{ skill: sultanSkill, name: 'Guard Shot', rarity: 'common' }],
      },
    ],
  });
  await expect(phoneDialog).toHaveCount(0);
  await expect(phone.getByTestId('evolution-notice')).toHaveText(
    'The GM changed your evolution; open it again to see the new paths.',
  );
  // Keyboard: Back returns focus to the picked path; Close returns it to [Evolve].
  const evolve = phone.getByTestId('evolution-pending').getByRole('button', { name: '[Evolve]' });
  await evolve.click();
  await phoneDialog.getByRole('button', { name: 'Choose Warden' }).click();
  await phone.screenshot({ path: path.join(shots, 'player-evolution-review-390x844.png') });
  await phoneDialog.getByRole('button', { name: 'Back' }).click();
  await expect(phoneDialog.getByRole('button', { name: 'Choose Warden' })).toBeFocused();
  await phoneDialog.getByRole('button', { name: 'Close evolution' }).click();
  await expect(evolve).toBeFocused();
  await evolve.click();
  // The GM chooses for the player while the dialog is open: it closes with a notice.
  await gmCommand(gm, { type: 'evolution.choose', characterId: 'demo-sultan', optionId: 'o2' });
  await expect(phoneDialog).toHaveCount(0);
  await expect(phone.getByTestId('evolution-notice')).toHaveText(
    'Your evolution was settled or withdrawn by the GM.',
  );
  await expect(phone.getByTestId('class')).toHaveText(/^\[Warden – lvl \d+\]$/);

  expect(errors).toEqual([]);
  expect(jakeErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
