import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { openTab } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// QF.50 (DESIGN §11): a shop generation that also carries a quest and a skill
// opens with those two unticked and marked "not what you asked for", and the
// quest's text and visibility show in the preview. The shop's keeper and a
// generated (GM-note) NPC then join the quick responses' NPC picker and reach
// the prompt as the NPC in the scene. The terminal server runs with the
// test-only fake model (THE_SYSTEM_E2E_FAKE_AI).

const GM_KEY = 'e2e-gm-key-qf50-0123456789abcdef5';
const shots = path.resolve(import.meta.dirname, '../docs/screens/QF.50');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY, THE_SYSTEM_E2E_FAKE_AI: '1' });
});

test.afterEach(async () => {
  await server.stop();
});

test('off-kind sections start unticked; keepers and note NPCs are pickable', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Jake', exact: true })).toBeVisible();
  await openTab(gm, 'session');
  const saved = await gm.request.put(`${server.url}/api/gm/ai/key`, {
    headers: { 'x-gm-key': GM_KEY },
    data: { key: 'sk-ant-e2e-qf50-fake-0123456789abcdef' },
  });
  expect(saved.ok()).toBe(true);

  const codm = gm.locator('section[aria-labelledby="codm-heading"]');
  const imp = gm.locator('section[aria-labelledby="import-heading"]');

  await codm.getByLabel('Generate').selectOption('shop');
  await codm.getByLabel('What the table needs').fill('a tinker with extras');
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(imp).toContainText('The Gut Tinker');
  const entry = (text: string) => imp.locator('.import-entries li').filter({ hasText: text });
  await expect(entry('Shop: The Gut Tinker').getByRole('checkbox')).toBeChecked();
  await expect(entry('Item: Ribcage Lantern').getByRole('checkbox')).toBeChecked();
  const quest = entry("Quest: The Tinker's Debt");
  await expect(quest.getByRole('checkbox')).not.toBeChecked();
  await expect(quest.getByTestId('import-off-kind')).toContainText('not what you asked for');
  await expect(quest.getByTestId('import-quest-preview')).toContainText('Hidden from players');
  await expect(quest.getByTestId('import-quest-preview')).toContainText(
    'Wren owes the pale hunters a lantern.',
  );
  const skill = entry('Skill: Lantern Craft');
  await expect(skill.getByRole('checkbox')).not.toBeChecked();
  await expect(skill.getByTestId('import-off-kind')).toBeVisible();
  await imp.screenshot({ path: path.join(shots, 'gm-import-off-kind-1366x768.png') });
  await imp.getByRole('button', { name: 'Apply 2' }).click();
  await expect(imp.getByRole('status')).toHaveText('Applied 2 entries');

  // A generated NPC lives in a GM note (and the bestiary).
  await codm.getByLabel('Generate').selectOption('npc');
  await codm.getByLabel('What the table needs').fill('a scout');
  await codm.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(imp).toContainText('Tamsin Reed');
  await imp.getByRole('button', { name: /^Apply \d+$/ }).click();
  await expect(imp.getByRole('status')).toContainText('Applied');

  const quick = gm.getByTestId('quick-responses');
  const picker = quick.getByLabel('NPC in the scene');
  await expect(picker.locator('option', { hasText: 'Wren Holloway' })).toHaveCount(1, {
    timeout: 10_000,
  });
  await expect(picker.locator('option', { hasText: 'Tamsin Reed' })).toHaveCount(1);
  await quick.getByLabel('The line to answer').fill('Can I haggle for the lantern?');
  await picker.selectOption({ label: 'Wren Holloway' });
  await quick.getByRole('button', { name: '4 In character' }).click();
  await expect(quick.getByTestId('quick-answer')).toContainText(
    'NPC: Wren Holloway (Keeper of The Gut Tinker.',
  );
  await quick.screenshot({ path: path.join(shots, 'gm-quick-keeper-1366x768.png') });
});
