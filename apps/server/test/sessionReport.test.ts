// M9.1: the GM session-report route rebuilds any session's report (markdown
// or JSON) from the event log for the "Copy for Claude" button.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute, type Command, type CommandContext } from '@the-system/engine';
import { createServer } from '../src/server';
import { CampaignStore } from '../src/store';

const KEY = 'r'.repeat(32);
const CANARY_JOURNAL = 'CANARY-unshared-journal-m91';
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
  return { apply, get, player: ctx({ role: 'player', characterId: 'jake' }) };
}

describe('GET /api/gm/session-report (M9.1)', () => {
  it('is GM-only', async () => {
    const { apply, get } = await setup();
    apply({ type: 'session.start' });
    expect((await get('?n=1', null)).statusCode).toBe(403);
    expect((await get('?n=1', 'x'.repeat(32))).statusCode).toBe(403);
  });

  it('serves a past session as markdown and JSON, a running one as its log, and 404s unknown ones', async () => {
    const { apply, get, player } = await setup();
    apply({ type: 'session.start' });
    apply({
      type: 'xp.award',
      track: 'class',
      amount: 300,
      participants: [{ characterId: 'jake' }],
      reason: 'Pale hunters',
    });
    apply(
      {
        type: 'note.create',
        characterId: 'jake',
        kind: 'journal',
        title: 'Mine',
        body: CANARY_JOURNAL,
      },
      player,
    );
    apply({ type: 'session.end' });
    apply({ type: 'session.start' });

    const md = await get('?n=1&format=md');
    expect(md.statusCode).toBe(200);
    expect(md.headers['content-type']).toMatch(/^text\/markdown/);
    expect(md.headers['cache-control']).toBe('no-store');
    expect(md.body).toMatch(/^# Session 1 report: Whale$/m);
    expect(md.body).toContain('300 class XP for Pale hunters');
    expect(md.body).not.toContain(CANARY_JOURNAL);
    // Default format is markdown.
    expect((await get('?n=1')).body).toBe(md.body);

    const json = await get('?n=1&format=json');
    expect(json.statusCode).toBe(200);
    expect(json.headers['content-type']).toMatch(/^application\/json/);
    const body = json.json<{
      format: string;
      version: number;
      report: boolean;
      session: { number: number };
    }>();
    expect(body).toMatchObject({ format: 'the-system/session-report', version: 1, report: true });
    expect(body.session.number).toBe(1);
    expect(json.body).not.toContain(CANARY_JOURNAL);

    const running = await get('?n=2&format=md');
    expect(running.statusCode).toBe(200);
    expect(running.body).toMatch(/^# Session 2 log \(running\): Whale$/m);
    expect(running.body).not.toContain('Pale hunters');

    expect((await get('?n=3')).statusCode).toBe(404);
    for (const bad of ['', '?n=0', '?n=1.5', '?n=abc', '?n=1&format=html', '?n=-1']) {
      expect((await get(bad)).statusCode, bad).toBe(400);
    }
  });
});
