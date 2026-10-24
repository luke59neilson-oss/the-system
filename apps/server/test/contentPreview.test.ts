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
      headers: key === null ? {} : { 'x-gm-key': key },
      payload: body as object,
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
});
