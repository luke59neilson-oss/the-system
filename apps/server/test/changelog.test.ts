// QF.13: the GM change-log route serves bounded, filtered pages from a cache.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  CHANGE_LOG_DEFAULT_PAGE,
  DEFAULT_RULES,
  execute,
  type ChangeLogPage,
  type Command,
  type CommandContext,
} from '@the-system/engine';
import { createServer, parseChangeLogQuery } from '../src/server';
import { CampaignStore } from '../src/store';

const KEY = 'g'.repeat(32);
const dirs: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-cl-'));
  const webRoot = mkdtempSync(path.join(tmpdir(), 'the-system-web-'));
  dirs.push(dataDir, webRoot);
  writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
  let n = 0;
  const now = () => new Date(Date.UTC(2026, 9, 23, 12) + 1000 * n).toISOString();
  const store = CampaignStore.open('main', { dataDir, now });
  const ctx: CommandContext = {
    actor: { role: 'gm' },
    sessionId: null,
    now,
    newId: () => `e${++n}`,
  };
  const apply = (command: Command) => {
    const r = execute(store.campaign, command, ctx);
    if (!r.ok) throw new Error(r.error);
    store.appendAll(r.events);
  };
  apply({
    type: 'campaign.create',
    name: 'Pages',
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
  const app = await createServer({ webRoot, live: { store, gmKey: KEY, now, newId: ctx.newId } });
  apps.push(app);
  const get = async (query = '') => {
    const res = await app.inject({
      url: `/api/gm/changelog${query}`,
      headers: { 'x-gm-key': KEY },
    });
    expect(res.statusCode).toBe(200);
    return res.json<ChangeLogPage>();
  };
  return { app, apply, get };
}

describe('GET /api/gm/changelog (QF.13)', () => {
  it('is GM-only', async () => {
    const { app } = await setup();
    expect((await app.inject({ url: '/api/gm/changelog' })).statusCode).toBe(403);
  });

  it('returns the newest page with an older cursor, follows it, and stays live', async () => {
    const { apply, get } = await setup();
    for (let i = 0; i < 250; i++) apply({ type: 'system.broadcast', text: `Line ${i}` });
    const head = await get();
    expect(head.rows).toHaveLength(CHANGE_LOG_DEFAULT_PAGE);
    expect(head.rows[0]!.lines.join(' ')).toContain('Line 249');
    expect(head.matching).toBe(252);
    const next = await get(`?before=${head.older}`);
    expect(next.rows[0]!.seq).toBe(head.older! - 1);
    apply({ type: 'system.broadcast', text: 'Fresh' });
    expect((await get()).rows[0]!.lines.join(' ')).toContain('Fresh');
    const search = await get('?text=line%2017&kind=messages&who=gm&limit=5');
    expect(search.rows.map((r) => r.lines.join(' '))).toHaveLength(5);
    expect(search.matching).toBe(11); // 17 and 170–179
    // An undo is reflected on the next request.
    const last = head.rows[0]!;
    apply({ type: 'event.undo', eventId: last.id });
    const after = await get('?text=Line%20249');
    expect(after.rows[0]!.undoneBy).not.toBeNull();
    expect(after.undone).toBe(1);
  });
});

describe('GET /api/gm/changelog/undo-preview (QF.40)', () => {
  it('is GM-only, says what an undo changes, says why one is refused, and saves nothing', async () => {
    const { app, apply } = await setup();
    expect((await app.inject({ url: '/api/gm/changelog/undo-preview?id=e1' })).statusCode).toBe(
      403,
    );
    const preview = async (id: string) =>
      (
        await app.inject({
          url: `/api/gm/changelog/undo-preview?id=${id}`,
          headers: { 'x-gm-key': KEY },
        })
      ).json<{ ok: boolean; changes?: string[]; error?: string }>();
    const award = (amount: number): Command => ({
      type: 'xp.award',
      track: 'class',
      amount,
      participants: [{ characterId: 'jake' }],
    });
    apply(award(200)); // e3: class 2
    expect(await preview('e3')).toEqual({ ok: true, changes: ['Jake: class 2 → 0, race 2 → 0'] });
    apply(award(200)); // e4: class 4, top of G
    apply({
      type: 'evolution.release',
      characterId: 'jake',
      options: [{ className: 'Hunter' }],
      rerateApproved: true,
      override: true,
    });
    apply({ type: 'evolution.choose', characterId: 'jake', optionId: 'o1' });
    apply(award(900));
    const chosen = 'e6';
    const refused = await preview(chosen);
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain('Jake would lose 900 XP (class 7 → 4)');
    expect(
      (await app.inject({ url: '/api/gm/changelog/undo-preview', headers: { 'x-gm-key': KEY } }))
        .statusCode,
    ).toBe(400);
  });
});

describe('parseChangeLogQuery', () => {
  it('keeps valid values and drops anything else', () => {
    expect(
      parseChangeLogQuery({ before: '12', limit: '50', who: 'player', kind: 'xp', text: 'ding' }),
    ).toEqual({ before: 12, limit: 50, who: 'player', kind: 'xp', text: 'ding' });
    expect(
      parseChangeLogQuery({ before: '-1', limit: '1e9', who: 'root', kind: 'x', text: ['a'] }),
    ).toEqual({ before: null, limit: null, who: 'all', kind: 'all', text: '' });
    expect(parseChangeLogQuery(null)).toEqual({
      before: null,
      limit: null,
      who: 'all',
      kind: 'all',
      text: '',
    });
    expect(parseChangeLogQuery({ text: 'x'.repeat(500) }).text).toHaveLength(200);
  });
});
