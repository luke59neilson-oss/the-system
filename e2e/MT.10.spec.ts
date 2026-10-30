import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from './helpers/test';
import { reveal } from './helpers/gmTabs';
import { startBuiltServer, type RunningServer } from './helpers/server';

// MT.10 (Q40, DESIGN §9): the status window shows the character's portrait at
// the top; the GM export carries the portraits folder.

const GM_KEY = 'e2e-gm-key-mt10-0123456789abcdef0';
const shots = path.resolve(import.meta.dirname, '../docs/screens/MT.10');
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

test('the status window shows the portrait at the top; the export carries it', async ({
  browser,
}) => {
  const gm = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const gmErrors = watchErrors(gm);
  await gm.goto(`${server.url}/gm#key=${GM_KEY}`);
  await gm.getByLabel('Campaign name').fill('Whale');
  await gm.getByRole('button', { name: 'Create campaign' }).click();
  const create = gm.locator('form[aria-labelledby="new-character"]');
  await reveal(gm, create);
  await create.getByLabel('Name', { exact: true }).fill('Jake');
  await create.getByTestId('portrait-file').setInputFiles({
    name: 'jake.png',
    mimeType: 'image/png',
    buffer: png(300, 300, 0),
  });
  await expect(create.getByTestId('portrait').locator('img')).toBeVisible();
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(create.getByRole('status')).toHaveText('Character created');
  await create.getByLabel('Name', { exact: true }).fill('Kim');
  await create.getByRole('button', { name: 'Create character' }).click();
  await expect(gm.getByRole('heading', { level: 3, name: 'Kim', exact: true })).toBeVisible();

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = watchErrors(page);
  await page.goto(server.url);
  await page.getByRole('link', { name: /Jake/ }).click();
  const status = page.getByTestId('status');
  const portrait = status.getByTestId('status-portrait').locator('img');
  await expect(portrait).toBeVisible();
  await expect(portrait).toHaveAttribute('src', /^\/portraits\/[0-9a-f]{64}\.(webp|png)$/);
  await expect
    .poll(() =>
      portrait.evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth),
    )
    .toBeGreaterThan(0);
  // At the top: above the Name row.
  const portraitBox = await portrait.boundingBox();
  const nameBox = await status.getByTestId('name').boundingBox();
  expect(portraitBox!.y + portraitBox!.height).toBeLessThanOrEqual(nameBox!.y);
  await page.screenshot({ path: path.join(shots, 'player-status-portrait-390x844.png') });

  // A character without a portrait shows no empty frame.
  await page.goto(server.url);
  await page.getByRole('link', { name: /Kim/ }).click();
  await expect(page.getByTestId('name')).toHaveText('Kim');
  await expect(page.getByTestId('status-portrait')).toHaveCount(0);

  // The GM export carries the portrait file (base64) under its name.
  const res = await gm.request.get(`${server.url}/api/gm/export`, {
    headers: { 'x-gm-key': GM_KEY },
  });
  expect(res.status()).toBe(200);
  const exported = (await res.json()) as { version: number; portraits: Record<string, string> };
  expect(exported.version).toBe(2);
  const names = Object.keys(exported.portraits);
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^[0-9a-f]{64}\.(webp|png)$/);
  const served = await page.request.get(`${server.url}/portraits/${names[0]}`);
  expect(Buffer.from(await served.body()).toString('base64')).toBe(exported.portraits[names[0]!]);

  expect(errors).toEqual([]);
  expect(gmErrors).toEqual([]);
});
