import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M3.12 Party view: other characters' names, race/class/profession levels and
// pool bars (whole percents, never raw values; D5, D39), updating live.

const GM_KEY = 'e2e-gm-key-m312-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M3.12');
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

test('the party view shows the others and follows the GM live', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  gm.on('dialog', (d) => void d.accept());
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Party Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  await gm.getByRole('button', { name: 'Load demo campaign' }).click();
  await expect(gm.getByTestId('demo-badge')).toBeVisible();

  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = watchErrors(laptop);
  await laptop.goto(server.url);
  await laptop.getByRole('link', { name: /Jake/ }).click();
  const party = laptop.getByTestId('party');
  const members = party.getByTestId('party-member');
  // Everyone but Jake, in creation order.
  await expect(members).toHaveCount(3);
  await expect(party.getByRole('heading', { level: 3 })).toHaveText([
    'Miranda',
    'Casper',
    'Sultan',
  ]);
  const miranda = party.getByRole('listitem', { name: 'Miranda' });
  await expect(miranda.getByTestId('party-race')).toHaveText('[Human (E) – lvl 20]');
  await expect(miranda.getByTestId('party-class')).toHaveText('[Storm Ranger – lvl 22]');
  await expect(miranda.getByTestId('party-profession')).toHaveText('[Cook – lvl 18]');
  const casper = party.getByRole('listitem', { name: 'Casper' });
  await expect(casper.getByTestId('party-profession')).toHaveCount(0);
  // Demo pools are refilled (D70): full bars, labelled by the rules' pool names.
  const mirandaHp = miranda.getByRole('meter', { name: 'Miranda Health Points (HP)' });
  await expect(mirandaHp).toHaveAttribute('aria-valuenow', '100');
  await expect(miranda.getByTestId('party-pool-hp').getByTestId('party-pool-label')).toHaveText(
    'Full',
  );
  // No raw "current/max" values anywhere in the party window (D39).
  expect(await party.textContent()).not.toMatch(/\d+\s*\/\s*\d+/);
  await party.scrollIntoViewIfNeeded();
  await laptop.screenshot({ path: path.join(shots, 'player-party-1366x768.png') });

  // Miranda on her phone: her own raw HP, and Jake in her party list.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watchErrors(phone);
  await phone.goto(server.url);
  await phone.getByRole('link', { name: /Miranda/ }).click();
  const [, , hpMax] = ((await phone.getByTestId('pool-hp').textContent()) ?? '').match(
    /^(\d+)\/(\d+)$/,
  ) ?? [null, null, '0'];
  expect(Number(hpMax)).toBeGreaterThan(0);
  const phoneParty = phone.getByTestId('party');
  await expect(phoneParty.getByRole('heading', { level: 3 })).toHaveText([
    'Jake',
    'Casper',
    'Sultan',
  ]);
  // Phones: Status, then the party, before the inventory.
  const order = await phone.evaluate(() => {
    const d = (
      globalThis as unknown as {
        document: {
          querySelector: (s: string) => { getBoundingClientRect: () => { top: number } } | null;
        };
      }
    ).document;
    const top = (s: string) => d.querySelector(s)?.getBoundingClientRect().top ?? -1;
    return [
      top('[data-testid=status]'),
      top('[data-testid=party]'),
      top('[data-testid=inventory]'),
    ];
  });
  expect(order[0]).toBeLessThan(order[1] ?? 0);
  expect(order[1]).toBeLessThan(order[2] ?? 0);
  // No horizontal scroll on a phone.
  const overflow = await phone.evaluate(() => {
    const el = (
      globalThis as unknown as {
        document: { documentElement: { scrollWidth: number; clientWidth: number } };
      }
    ).document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  await phoneParty.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(shots, 'player-party-390x844.png') });

  // Live: Miranda is hurt to a fifth, then knocked out.
  await gmCommand(gm, {
    type: 'character.setPools',
    characterId: 'demo-miranda',
    pools: { hp: Math.round(Number(hpMax) / 5) },
  });
  await expect(mirandaHp).toHaveAttribute('aria-valuenow', '20');
  const hpRow = miranda.getByTestId('party-pool-hp');
  await expect(hpRow.getByTestId('party-pool-label')).toHaveText('20%');
  await expect(hpRow).toHaveClass(/\blow\b/);
  await laptop.screenshot({ path: path.join(shots, 'player-party-hurt-1366x768.png') });
  await gmCommand(gm, {
    type: 'character.setPools',
    characterId: 'demo-miranda',
    pools: { hp: 0 },
  });
  await expect(hpRow.getByTestId('party-pool-label')).toHaveText('Empty');
  await expect(hpRow).toHaveClass(/\bempty\b/);

  // Live: Casper levels up.
  await gmCommand(gm, {
    type: 'xp.award',
    amount: 5000,
    track: 'class',
    participants: [{ characterId: 'demo-casper' }],
  });
  await expect(casper.getByTestId('party-class')).not.toHaveText('[Ranger – lvl 7]');
  const casperClass = (await casper.getByTestId('party-class').textContent()) ?? '';
  expect(Number(casperClass.match(/lvl (\d+)/)?.[1] ?? 0)).toBeGreaterThan(7);
  await expect(
    phoneParty.getByRole('listitem', { name: 'Casper' }).getByTestId('party-class'),
  ).toHaveText(casperClass);

  expect(errors).toEqual([]);
  expect(phoneErrors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
