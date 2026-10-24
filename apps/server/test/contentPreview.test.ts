// M9.3 (in progress): the GM import preview route checks a content file and changes nothing.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute, type Command, type CommandContext } from '@the-system/engine';
import { createServer } from '../src/server';
import { CampaignStore } from '../src/store';

const KEY = 'r'.repeat(32);
const dirs: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-sr-'));
  const webRoot = mkdtempSync(path.join(tmpdir(), 'the-system-web-'));
  dirs.push(dataDir, webRoot);
  writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
  let n = 0;
  const now = () => new Date(Date.UTC(2026, 9, 24, 12) + 1000 * n).toISOString();
  const store = CampaignStore.open('main', { dataDir, now });
  const ctx = (actor: CommandContext['actor']): CommandContext => ({
    actor,
    sessionId: null,
    now,
    newId: () => `e${++n}`,
  });
  const gm = ctx({ role: 'gm' });
  const apply = (command: Command, c: CommandContext = gm) => {
    const r = execute(store.campaign, command, c);
    if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
    store.appendAll(r.events);
  };
  apply({
    type: 'campaign.create',
    name: 'Whale',
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) as unknown,
  });
  apply({
    type: 'character.create',
    id: 'jake',
    name: 'Jake',
    className: 'Archer',
    classSkills: [
      { name: 'Basic Archery', rarity: 'inferior' },
      { name: 'Basic Stealth', rarity: 'inferior' },
      { name: 'Archer’s Eye', rarity: 'common' },
    ],
  });
  const app = await createServer({ webRoot, live: { store, gmKey: KEY, now, newId: gm.newId } });
  apps.push(app);
  const get = (query: string, key: string | null = KEY) =>
    app.inject({
      url: `/api/gm/session-report${query}`,
      headers: key === null ? {} : { 'x-gm-key': key },
    });
  const post = (body: unknown, key: string | null = KEY) =>
    app.inject({
      method: 'POST',
      url: '/api/gm/content/preview',
      // As the GM screen sends it: JSON, with a file's text as a JSON string.
      headers: {
        'content-type': 'application/json',
        ...(key === null ? {} : { 'x-gm-key': key }),
      },
      payload: JSON.stringify(body),
    });
  return { apply, get, post, store, player: ctx({ role: 'player', characterId: 'jake' }) };
}

describe('POST /api/gm/content/preview (M9.3)', () => {
  it('is GM-only, previews entries and changes nothing', async () => {
    const { post, store } = await setup();
    const file = {
      format: 'the-system/content',
      version: 1,
      skills: [{ name: 'New', rarity: 'rare' }],
    };
    expect((await post(file, null)).statusCode).toBe(403);
    const before = store.campaign.events.length;
    const res = await post(file);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, entries: [{ path: 'skills[0]', error: null }] });
    expect(store.campaign.events.length).toBe(before);
    expect((await post({ format: 'x', version: 1 })).json()).toMatchObject({ ok: false });
  });

  it('refuses a wrong key, and an invalid file appends nothing', async () => {
    const { post, store } = await setup();
    expect(
      (await post({ format: 'the-system/content', version: 1 }, 'w'.repeat(32))).statusCode,
    ).toBe(403);
    const before = store.campaign.events.length;
    const bad = await post('{"format":"the-system/content","version":1,"items":[{"name":""}]}');
    expect(bad.statusCode).toBe(200);
    expect(bad.json()).toMatchObject({ ok: false });
    expect(store.campaign.events.length).toBe(before);
  });

  it('re-checks only the ticked entries with { file, only }', async () => {
    const { post } = await setup();
    const skill = { name: 'Twice', rarity: 'rare' };
    const file = JSON.stringify({
      format: 'the-system/content',
      version: 1,
      skills: [skill, skill],
    });
    const all = (await post(file)).json() as { entries: { error: string | null }[] };
    expect(all.entries.map((e) => e.error === null)).toEqual([true, false]);
    const one = (await post({ file, only: ['skills[1]'] })).json() as {
      entries: { error: string | null }[];
    };
    expect(one.entries.map((e) => e.error)).toEqual([null, null]);
    // A wrapped file is still checked for shape.
    expect((await post({ file: { format: 'x' }, only: [] })).json()).toMatchObject({ ok: false });
  });

  it('reports characters that are not in the campaign', async () => {
    const { post } = await setup();
    const res = await post({
      format: 'the-system/content',
      version: 1,
      skillOffers: [{ character: 'Nobody', level: 5, options: [{ name: 'A', rarity: 'common' }] }],
    });
    expect(res.json()).toMatchObject({
      ok: true,
      entries: [],
      errors: [{ path: 'skillOffers[0].character' }],
    });
  });
});

describe('POST /api/gm/content/preview with no campaign', () => {
  it('replies 404', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-sr-'));
    const webRoot = mkdtempSync(path.join(tmpdir(), 'the-system-web-'));
    dirs.push(dataDir, webRoot);
    writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
    const now = () => '2026-10-24T12:00:00.000Z';
    let n = 0;
    const store = CampaignStore.open('main', { dataDir, now });
    const app = await createServer({
      webRoot,
      live: { store, gmKey: KEY, now, newId: () => `n${++n}` },
    });
    apps.push(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/gm/content/preview',
      headers: { 'x-gm-key': KEY },
      payload: { format: 'the-system/content', version: 1 },
    });
    expect(res.statusCode).toBe(404);
  });
});
