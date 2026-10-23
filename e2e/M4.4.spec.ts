import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from './helpers/test';
import { startBuiltServer, type RunningServer } from './helpers/server';

// M4.4 Character creation: the GM creates characters with a name, a starting
// class from the library and an optional portrait; Identify is added on its
// own. Portraits show on the join list, the GM party table and players'
// party views, and changes reach every screen live.

const GM_KEY = 'e2e-gm-key-m44-0123456789abcdef';
const shots = path.resolve(import.meta.dirname, '../docs/screens/M4.4');
let dataDir: string;
let server: RunningServer;

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true });
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-e2e-m44-'));
  server = await startBuiltServer({ GM_KEY }, { dataDir });
});

test.afterAll(async () => {
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

/** A real PNG (diagonal colour bands) the browser can decode, built without dependencies. */
function png(width: number, height: number, seed: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = (crcTable[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const band = Math.floor((x + y) / 40) % 3;
      row[1 + x * 3] = band === 0 ? 200 : 40 + seed;
      row[2 + x * 3] = band === 1 ? 180 : 60;
      row[3 + x * 3] = band === 2 ? 220 : 90 + seed;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function watch(page: Page) {
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

test('the GM creates characters with portraits; players see them live', async ({ browser }) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watch(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Portrait Test');
  await gm.getByRole('button', { name: 'Create campaign' }).click();

  // Name, starting class from the default library, portrait with a preview.
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await create.getByLabel('Name', { exact: true }).fill('Jake Thayne');
  await create.getByLabel('Starting class').selectOption({ label: 'Warrior (Heavy)' });
  await expect(create).toContainText('[Identify (Common)] (race skill, added automatically)');
  await create.getByTestId('portrait-file').setInputFiles({
    name: 'jake.png',
    mimeType: 'image/png',
    buffer: png(600, 400, 0),
  });
  await expect(create.getByTestId('portrait').locator('img')).toBeVisible();
  await expect(create.getByRole('button', { name: 'Change portrait' })).toBeVisible();
  await noSidewaysScroll(gm);
  await create.screenshot({ path: path.join(shots, 'gm-new-character-1366x768.png') });
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(create.getByRole('status')).toHaveText('Character created');
  // The form is ready for the next character: name and portrait cleared.
  await expect(create.getByLabel('Name', { exact: true })).toHaveValue('');
  await expect(create.getByTestId('portrait')).toHaveText('?');

  // A second character without a portrait keeps the monogram.
  await create.getByLabel('Name', { exact: true }).fill('Kim');
  await create.getByLabel('Starting class').selectOption({ label: 'Caster' });
  await create.getByRole('button', { name: 'Create character' }).click();
  const party = gm.locator('section[aria-labelledby="party"]');
  const jakeRow = party.locator('tr', { hasText: 'Jake Thayne' });
  const kimRow = party.locator('tr', { hasText: 'Kim' });
  await expect(kimRow).toBeVisible();
  const jakeImg = jakeRow.getByTestId('portrait').locator('img');
  await expect(jakeImg).toHaveAttribute('src', /^\/portraits\/[0-9a-f]{64}\.(webp|png)$/);
  // Stored at portrait size: 600×400 shrinks to fit 512 px.
  await expect
    .poll(() =>
      jakeImg.evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth),
    )
    .toBe(512);
  await expect(kimRow.getByTestId('portrait')).toHaveText('K');
  await expect(kimRow.getByRole('button', { name: 'Remove Kim’s portrait' })).toHaveCount(0);
  await gm.screenshot({ path: path.join(shots, 'gm-party-1366x768.png'), fullPage: true });

  // Players: the join list shows Jake's portrait and Kim's monogram.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErrors = watch(phone);
  await phone.goto(server.url);
  const list = phone.getByTestId('characters');
  await expect(list.getByRole('link', { name: /Jake Thayne/ }).locator('img')).toBeVisible();
  await expect(list.getByRole('link', { name: /Kim/ }).getByTestId('portrait')).toHaveText('K');
  await noSidewaysScroll(phone);
  await phone.screenshot({ path: path.join(shots, 'join-390x844.png'), fullPage: true });

  // Kim's status screen: Identify is there, and Jake's portrait is in the party view.
  await list.getByRole('link', { name: /Kim/ }).click();
  await expect(phone.getByTestId('connection')).toHaveText('Connected');
  await expect(phone.getByText('[Identify (Common)]')).toBeVisible();
  const member = phone.getByTestId('party-member');
  await expect(member.getByTestId('portrait').locator('img')).toBeVisible();
  await noSidewaysScroll(phone);
  await phone.screenshot({ path: path.join(shots, 'player-status-390x844.png'), fullPage: true });

  // The GM gives Kim a portrait and removes Jake's; the phone follows live.
  await kimRow.getByTestId(/^portrait-file-/).setInputFiles({
    name: 'kim.png',
    mimeType: 'image/png',
    buffer: png(300, 300, 120),
  });
  await expect(kimRow.getByTestId('portrait').locator('img')).toBeVisible();
  await jakeRow.getByRole('button', { name: 'Remove Jake Thayne’s portrait' }).click();
  await expect(jakeRow.getByTestId('portrait')).toHaveText('JT');
  await expect(member.getByTestId('portrait')).toHaveText('JT');
  await noSidewaysScroll(phone);
  await member.screenshot({ path: path.join(shots, 'party-member-390x844.png') });

  // A file that is not an image is refused with a message; nothing changes.
  await create.getByTestId('portrait-file').setInputFiles({
    name: 'notes.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not really a picture'),
  });
  await expect(create.getByRole('alert')).toHaveText(
    'That file is not an image this browser can read',
  );

  // Phone layout of the GM form stays usable.
  const gmPhone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await gmPhone.goto(`${server.url}/gm#key=${GM_KEY}`);
  await expect(gmPhone.locator('form[aria-labelledby="new-character"]')).toBeVisible();
  await expect(gmPhone.getByRole('button', { name: 'Change Kim’s portrait' })).toBeVisible();
  await noSidewaysScroll(gmPhone);
  await gmPhone.screenshot({ path: path.join(shots, 'gm-console-390x844.png'), fullPage: true });

  expect(gmErrors).toEqual([]);
  expect(phoneErrors).toEqual([]);
});
