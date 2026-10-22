// Character portraits (M4.4): GM-only upload of PNG/JPEG/WebP bytes into the
// campaign folder, public read by content-hash name, and the join list URL.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute, type Command } from '@the-system/engine';
import { PORTRAIT_MAX_BYTES, detectPortrait, portraitFile } from '../src/portraits';
import { createServer } from '../src/server';
import { CampaignStore } from '../src/store';

const KEY = 'p'.repeat(32);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake png body'),
]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jfif')]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('detectPortrait', () => {
  it('knows PNG, JPEG and WebP by their magic bytes and nothing else', () => {
    expect(detectPortrait(PNG)).toBe('png');
    expect(detectPortrait(JPG)).toBe('jpg');
    expect(detectPortrait(WEBP)).toBe('webp');
    expect(detectPortrait(SVG)).toBeNull();
    expect(detectPortrait(Buffer.from('GIF89a'))).toBeNull();
    expect(detectPortrait(Buffer.alloc(0))).toBeNull();
  });
});

describe('portrait routes', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-portraits-'));
    const dataDir = path.join(root, 'data');
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    store = CampaignStore.open('main', { dataDir, now: () => '2026-10-22T13:00:00.000Z' });
    let n = 0;
    const ctx = {
      actor: { role: 'gm' as const },
      sessionId: null,
      now: () => '2026-10-22T13:00:00.000Z',
      newId: () => `e${++n}`,
    };
    const commands: Command[] = [
      { type: 'campaign.create', name: 'P', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
      {
        type: 'character.create',
        id: 'jake',
        name: 'Jake',
        className: 'Archer',
        classSkills: [
          { name: 'Basic Archery', rarity: 'inferior' },
          { name: 'Basic Stealth', rarity: 'inferior' },
          { name: 'Archer’s Eye', rarity: 'common' },
        ],
      },
    ];
    for (const command of commands) {
      const r = execute(store.campaign, command, ctx);
      if (!r.ok) throw new Error(r.error);
      store.appendAll(r.events);
    }
    app = await createServer({
      webRoot: root,
      live: { store, gmKey: KEY, now: ctx.now, newId: ctx.newId },
    });
  });

  afterAll(async () => {
    await app.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });

  const upload = (body: Buffer, type: string, key: string | null = KEY) =>
    app.inject({
      method: 'POST',
      url: '/api/gm/portraits',
      headers: { 'content-type': type, ...(key === null ? {} : { 'x-gm-key': key }) },
      payload: body,
    });

  it('refuses uploads without the GM key', async () => {
    expect((await upload(PNG, 'image/png', null)).statusCode).toBe(403);
    expect((await upload(PNG, 'image/png', 'wrong')).statusCode).toBe(403);
    expect(existsSync(path.join(store.dir, 'portraits'))).toBe(false);
  });

  it('stores PNG, JPEG and WebP under their content hash, once', async () => {
    for (const [body, type, ext] of [
      [PNG, 'image/png', 'png'],
      [JPG, 'image/jpeg', 'jpg'],
      [WEBP, 'image/webp', 'webp'],
    ] as const) {
      const res = await upload(body, type);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ portrait: `${sha(body)}.${ext}` });
    }
    expect((await upload(PNG, 'image/png')).json()).toEqual({ portrait: `${sha(PNG)}.png` });
    expect(readdirSync(path.join(store.dir, 'portraits'))).toHaveLength(3);
  });

  it('refuses other formats, lying content types, empty and oversized bodies', async () => {
    expect((await upload(SVG, 'image/svg+xml')).statusCode).toBe(415);
    expect((await upload(SVG, 'image/png')).json()).toEqual({
      error: 'Use a PNG, JPEG or WebP image',
    });
    expect((await upload(Buffer.from('x'), 'text/plain')).statusCode).toBe(415);
    const big = Buffer.concat([PNG, Buffer.alloc(PORTRAIT_MAX_BYTES)]);
    expect((await upload(big, 'image/png')).statusCode).toBe(413);
  });

  it('serves stored portraits to anyone with an image type and nosniff, and nothing else', async () => {
    const name = `${sha(PNG)}.png`;
    const res = await app.inject({ url: `/portraits/${name}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.rawPayload.equals(PNG)).toBe(true);
    for (const url of [
      `/portraits/${'c'.repeat(64)}.png`,
      '/portraits/..%2F..%2Fevents.jsonl',
      '/portraits/events.jsonl',
      `/portraits/${sha(PNG)}.svg`,
    ]) {
      expect((await app.inject({ url })).statusCode, url).not.toBe(200);
    }
    expect(portraitFile(store.dir, '../events.jsonl')).toBeNull();
  });

  it('lists the portrait URL in the public join list once the GM sets it', async () => {
    const before = await app.inject({ url: '/api/characters' });
    expect(before.json()).toEqual([expect.objectContaining({ id: 'jake', portrait: null })]);
    const r = execute(
      store.campaign,
      { type: 'character.setPortrait', characterId: 'jake', portrait: `${sha(JPG)}.jpg` },
      {
        actor: { role: 'gm' },
        sessionId: null,
        now: () => '2026-10-22T13:00:01.000Z',
        newId: () => 'set1',
      },
    );
    if (!r.ok) throw new Error(r.error);
    store.appendAll(r.events);
    const after = await app.inject({ url: '/api/characters' });
    expect(after.json()).toEqual([
      expect.objectContaining({ id: 'jake', portrait: `/portraits/${sha(JPG)}.jpg` }),
    ]);
  });
});
