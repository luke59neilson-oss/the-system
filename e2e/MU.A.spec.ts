import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './helpers/test';
import { openTab, openWindow } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MU.A (ROADMAP MU, DESIGN §5, §6, §7, §9a): one table round across the
// whole milestone. The GM works from the home dashboard and its tabs, makes a
// spell in the skill library, the player casts it from their phone, the cast
// waits on the home dashboard for review, the award box shows what XP is
// worth, the player's running log (and View as) shows every change, and the
// GM searches the reference lists. The player never receives GM-only data.

const GM_KEY = 'e2e-gm-key-mua-0123456789abcdef0a';
const NOTES = 'Casting-notes canary MUA-7f3c: the GM reads these';
const REASON = 'Reason canary MUA-91be';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MU.A');
let server: RunningServer;

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

/** Runs one GM command over the GM page's own origin (set-up only). */
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

test('a table round uses the whole milestone; the player gets only their own view', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Milestone U');
  await gm.getByLabel(/Start with the default classes/).uncheck();
  await gm.getByRole('button', { name: 'Create campaign' }).click();

  // MU.1: the console opens on the home dashboard.
  const tabs = gm.getByRole('tablist', { name: 'Console tabs' });
  await expect(tabs.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
  const needs = gm.locator('section[aria-labelledby="needs-you"]');
  await expect(needs).toContainText('Nothing waits on you.');

  // MU.4: a spell made in the skill library (Library & settings).
  const library = gm.locator('section[aria-labelledby="skill-library"]');
  await openWindow(gm, 'skill-library');
  await expect(tabs.getByRole('tab', { name: 'Library & settings' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await library.getByLabel('Official name').fill('Ember Dart');
  await library.getByLabel('Rarity').selectOption({ label: 'Common' });
  await library.getByLabel('Description (players see this)').fill('A dart of living flame.');
  const spell = library.getByTestId('spell-fields');
  await spell.getByRole('checkbox', { name: /Spell/ }).check();
  await spell.getByLabel('Cost pool').selectOption({ label: 'Mana Points (MP)' });
  await spell.getByLabel('Cost per use').fill('30');
  await spell.getByLabel(/^Cooldown/).fill('1 round');
  await spell.getByLabel('Casting notes').fill(NOTES);
  await library.getByRole('button', { name: 'Add to library' }).click();
  await expect(library.getByRole('status')).toHaveText('[Ember Dart] added to the library');

  for (const [id, name, signature] of [
    ['jake', 'Jake', 'Ember Dart'],
    ['kim', 'Kim', 'Basic Archery'],
  ] as const) {
    await gmCommand(gm, {
      type: 'character.create',
      id,
      name,
      className: 'Caster',
      classSkills: [
        { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
        { name: 'Basic Stealth', rarity: 'inferior' },
        { name: signature, rarity: 'common' },
      ],
    });
  }

  // Kim is at the table too, and hears nothing of Jake's spell.
  const kim = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const kimErrors = watchErrors(kim);
  const kimSeen: string[] = [];
  kim.on('websocket', (ws) => ws.on('framereceived', (f) => kimSeen.push(String(f.payload))));
  await kim.goto(server.url);
  await kim.getByRole('link', { name: /Kim/ }).click();
  await expect(kim.getByTestId('connection')).toHaveText('Connected');

  // Jake's phone records every frame and API response it receives.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  const seen: string[] = [];
  phone.on('websocket', (ws) => ws.on('framereceived', (f) => seen.push(String(f.payload))));
  phone.on('response', (r) => {
    if (r.url().includes('/api/'))
      void r
        .text()
        .then((t) => seen.push(t))
        .catch(() => undefined);
  });
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Jake/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  const log = phone.getByTestId('running-log');
  await expect(log).toContainText('What the System does to you shows here');

  // MU.5: Jake casts from his phone; the pool pays and the log says so.
  const dart = phone.getByTestId('skills-class').getByRole('button', { name: /Ember Dart/ });
  await expect(dart.getByTestId('skill-cost')).toHaveText('· 30 MP');
  await dart.click();
  const detail = phone.getByTestId('skill-detail');
  await expect(detail.getByTestId('skill-detail-notes')).toHaveText(NOTES);
  await detail.getByTestId('skill-cast').click();
  await expect(detail.getByTestId('skill-cast-result')).toHaveText(
    'Cast! −30 MP. The GM will review the use.',
  );
  await expect(detail.getByTestId('skill-cast-pool')).toHaveText('MP 70/100');
  await detail.getByRole('button', { name: 'Close skill details' }).click();
  await expect(log.getByRole('listitem').first()).toContainText(
    'Cast [Ember Dart]: −30 MP (70 left)',
  );

  // The home dashboard: Jake's card shows the spent pool, and the cast waits
  // for review; its link opens the practice review on Progression.
  await openTab(gm, 'home');
  await expect(gm.getByTestId('pool-jake-mp')).toHaveText('70/100');
  const practice = needs
    .getByRole('list', { name: 'Waiting on the GM' })
    .getByRole('button')
    .filter({ hasText: /practice (entry|entries) to review/ });
  await expect(practice).toHaveCount(1);
  await gm.screenshot({ path: path.join(shots, 'gm-home-1366x768.png') });
  await practice.click();
  await expect(tabs.getByRole('tab', { name: 'Progression' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const review = gm.locator('section[aria-labelledby="practice-capture-heading"]');
  await expect(review.getByText('Cast [Ember Dart]')).toHaveCount(1);

  // MU.3: the award box on Session shows what the award is worth; Jake only.
  await openTab(gm, 'session');
  const award = gm.getByRole('form', { name: 'Award class XP' });
  await expect(award.getByTestId('context-jake')).toContainText(
    'G-grade · Class 0 · 0/100 XP, 100 to next',
  );
  await award.getByRole('checkbox', { name: 'Kim' }).first().uncheck();
  await award.getByLabel('Amount').fill('250');
  await expect(award.getByTestId('worth-jake')).toHaveText(' · ≈ 2.5 levels');
  await award.getByLabel('Reason (GM only)').fill(REASON);
  await gm.screenshot({ path: path.join(shots, 'gm-award-1366x768.png') });
  await award.getByRole('button', { name: 'Award XP' }).click();
  await expect(award.getByRole('status')).toHaveText('XP awarded');

  // MU.2: the phone's running log has the level-up, newest first.
  await expect(phone.getByTestId('class')).toHaveText('[Caster – lvl 2]');
  await expect(log).toContainText("*'DING!' Class: [Caster] has gained levels 1–2");
  await expect(log).toContainText('Cast [Ember Dart]: −30 MP (70 left)');
  await log.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'player-log-390x844.png') });

  // View as shows the GM the same log the phone shows.
  const viewAs = gm.getByRole('navigation', { name: 'View as' });
  await viewAs.getByRole('button', { name: 'Jake' }).click();
  const pane = gm.frameLocator('iframe[title="Jake (player view)"]');
  const paneLog = pane.getByTestId('running-log');
  await expect(paneLog.getByRole('listitem')).toHaveText(
    await log.getByRole('listitem').allTextContents(),
  );
  await gm.screenshot({ path: path.join(shots, 'gm-view-as-1366x768.png') });
  await viewAs.getByRole('button', { name: 'GM' }).click();

  // MU.6: the GM searches the reference lists.
  await openWindow(gm, 'reference');
  const ref = gm.locator('section[aria-labelledby="reference"]');
  await ref.getByLabel('Search the reference').fill('boar');
  await expect(ref.getByTestId('reference-results')).toContainText('Irontusk Boar');
  await gm.screenshot({ path: path.join(shots, 'gm-reference-1366x768.png') });

  // Canary: the phone never saw GM-only data; Kim never saw Jake's spell.
  const phoneAll = seen.join('\n') + (await phone.content());
  expect(seen.length).toBeGreaterThan(0);
  for (const secret of [GM_KEY, REASON, 'Irontusk', 'practice-capture']) {
    expect(phoneAll).not.toContain(secret);
  }
  const kimAll = kimSeen.join('\n') + (await kim.content());
  expect(kimSeen.length).toBeGreaterThan(0);
  expect(kimAll).not.toContain(NOTES);
  expect(kimAll).not.toContain('Ember Dart');

  expect(gmErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(kimErrors).toEqual([]);
});
