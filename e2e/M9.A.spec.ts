import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M9.A milestone acceptance (Claude bridge and content packs), WIP: the whole
// loop from DESIGN §7 "Logging for Claude" and D9: import the tutorial pack
// into a new campaign, play a session, copy the session report for Claude,
// import the content file Claude drafts back from it (a skill menu), and the
// player sees the menu. Nothing GM-only reaches the player along the way.

const GM_KEY = 'e2e-gm-key-m9a-0123456789abcdef9a';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M9.A');
const pack = path.resolve(import.meta.dirname, '../docs/content-packs/tutorial.json');
let server: RunningServer;

test.beforeEach(async () => {
  mkdirSync(shots, { recursive: true });
  server = await startBuiltServer({ GM_KEY });
});
test.afterEach(async () => {
  await server.stop();
});

test('tutorial pack → session → report for Claude → drafted menu → player', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('The Host');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const panel = gm.locator('section[aria-labelledby="import-heading"]');
  await panel.getByLabel('Content file (.json)').setInputFiles(pack);
  const apply = panel.getByRole('button', { name: /^Apply \d+$/ });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(panel.getByRole('status')).toContainText('Applied');
  // Note for the next run: /api/gm/session-report replies 400 without `?n=`
  // (the session number); fetch it with n=1 after session.end.
  // TODO (next run): create Jake, start a session, award XP to class level 5,
  // end the session, fetch /api/gm/session-report?format=json and check the
  // level-up is in it, import a skill-offer file for level 5, and check the
  // player's menu at 390×844 (screenshots in docs/screens/M9.A/).
  await gm.close();
});
