import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { CoDm } from '../src/ai/coDm';
import { FixtureAiClient } from '../src/ai/fake';
import { draftsDir } from '../src/ai/practiceRoutes';
import { createServer } from '../src/server';
import { transcriptsDir } from '../src/speech/routes';
import { transcriptFile } from '../src/speech/transcript';
import { CampaignStore } from '../src/store';

// MC.7: GM-only practice-draft routes, backed by the fixture fast model.
const GM = 'p'.repeat(32);
let ids = 0;
const hubOpts = { gmKey: GM, now: () => '2026-10-26T07:00:00.000Z', newId: () => `h${++ids}` };
const gm = { 'x-gm-key': GM };

function campaign(root: string): CampaignStore {
  const now = () => '2026-10-26T07:00:00.000Z';
  const store = CampaignStore.open('main', { dataDir: path.join(root, 'data'), now });
  let n = 0;
  const ctx = { actor: { role: 'gm' as const }, sessionId: null, now, newId: () => `e${++n}` };
  for (const command of [
    { type: 'campaign.create', name: 'Whale', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
    {
      type: 'character.create',
      id: 'jake',
      name: 'Jake',
      className: 'Archer',
      classSkills: [
        { name: 'Basic Archery', rarity: 'inferior' },
        { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
        { name: "Archer's Eye", rarity: 'common' },
      ],
    },
  ]) {
    const r = execute(store.campaign, command as never, ctx);
    if (!r.ok) throw new Error(r.error);
    store.appendAll(r.events);
  }
  return store;
}

describe('practice draft routes (MC.7)', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  let fake: FixtureAiClient;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-drafts-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    store = campaign(root);
    const coDm = new CoDm({
      dir: path.join(root, 'app-data'),
      cipher: null,
      makeClient: () => {
        fake = new FixtureAiClient([
          {
            role: 'fast',
            match: 'Practice drafts.',
            text: JSON.stringify({
              drafts: [
                {
                  line: 2,
                  character: 'Jake',
                  skill: "Archer's Eye",
                  action: 'Spots the weak scale',
                  confidence: 'high',
                },
              ],
            }),
          },
        ]);
        return fake;
      },
    });
    app = await createServer({ webRoot: root, live: { store, ...hubOpts }, coDm });
  });
  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('is GM-only', async () => {
    for (const [method, url] of [
      ['GET', '/api/gm/ai/practice-drafts'],
      ['POST', '/api/gm/ai/practice-drafts'],
      ['DELETE', '/api/gm/ai/practice-drafts/x'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('drafts from the saved transcript once, lists, and removes a draft', async () => {
    const empty = await app.inject({
      method: 'POST',
      url: '/api/gm/ai/practice-drafts',
      headers: gm,
    });
    expect(empty.json()).toMatchObject({ drafts: [], added: 0, read: 0 });
    expect(fake.requests).toHaveLength(0);

    const dir = transcriptsDir(store);
    mkdirSync(dir, { recursive: true });
    const lines = [
      {
        at: '2026-10-26T19:00:00.000Z',
        startMs: 0,
        endMs: 900,
        text: 'What does Archer’s Eye do?',
      },
      {
        at: '2026-10-26T19:00:05.000Z',
        startMs: 5000,
        endMs: 6000,
        text: 'Jake uses Archer’s Eye.',
      },
    ];
    writeFileSync(
      transcriptFile(dir, 0),
      lines.map((l) => JSON.stringify(l)).join('\n') + '\n{"torn',
    );
    const r = await app.inject({ method: 'POST', url: '/api/gm/ai/practice-drafts', headers: gm });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ added: 1, read: 2 });
    const [draft] = r.json().drafts;
    expect(draft).toMatchObject({
      characterId: 'jake',
      skill: "Archer's Eye",
      quote: 'Jake uses Archer’s Eye.',
      at: '2026-10-26T19:00:05.000Z',
      attributedBy: 'gm-named',
      // No play session was running (MC.7 review M4).
      sessionId: null,
    });
    // Nothing changed in the campaign: drafts are not practice entries.
    expect(store.campaign.state?.practice).toEqual([]);

    // A second run reads only new lines (none), so no call and no duplicate.
    const again = await app.inject({
      method: 'POST',
      url: '/api/gm/ai/practice-drafts',
      headers: gm,
    });
    expect(again.json()).toMatchObject({ added: 0, read: 0 });
    expect(fake.requests).toHaveLength(1);

    const list = await app.inject({
      method: 'GET',
      url: '/api/gm/ai/practice-drafts',
      headers: gm,
    });
    expect(list.json().drafts).toHaveLength(1);
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/gm/ai/practice-drafts/${draft.id}`,
      headers: gm,
    });
    expect(del.json().drafts).toEqual([]);
    const gone = await app.inject({
      method: 'DELETE',
      url: `/api/gm/ai/practice-drafts/${draft.id}`,
      headers: gm,
    });
    expect(gone.statusCode).toBe(404);
  });

  it('drafts the session that just ended from the end-of-session review (round 2)', async () => {
    let n = 0;
    const ctx = {
      actor: { role: 'gm' as const },
      sessionId: null,
      now: () => '2026-10-26T20:00:00.000Z',
      newId: () => `s${++n}`,
    };
    for (const command of [{ type: 'session.start' }, { type: 'session.end' }]) {
      const r = execute(store.campaign, command as never, {
        ...ctx,
        sessionId: store.campaign.state?.currentSession ?? null,
      });
      if (!r.ok) throw new Error(r.error);
      store.appendAll(r.events);
    }
    const state = store.campaign.state!;
    expect(state.currentSession).toBeNull();
    const ended = state.sessions.at(-1)!;
    const dir = transcriptsDir(store);
    mkdirSync(dir, { recursive: true });
    const lines = [
      { at: '2026-10-26T20:01:00.000Z', startMs: 0, endMs: 900, text: 'Into the canyon.' },
      {
        at: '2026-10-26T20:01:05.000Z',
        startMs: 5000,
        endMs: 6000,
        text: 'Jake uses Archer’s Eye.',
      },
    ];
    writeFileSync(
      transcriptFile(dir, ended.number),
      lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
    );
    const r = await app.inject({ method: 'POST', url: '/api/gm/ai/practice-drafts', headers: gm });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ added: 1, read: 2 });
    expect(r.json().drafts.at(-1)).toMatchObject({
      quote: 'Jake uses Archer’s Eye.',
      sessionId: ended.id,
    });
  });

  it('reports a damaged drafts file without overwriting it', async () => {
    const dir = draftsDir(store);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'practice-drafts.json'), 'nope');
    const r = await app.inject({ method: 'GET', url: '/api/gm/ai/practice-drafts', headers: gm });
    expect(r.statusCode).toBe(500);
    rmSync(path.join(dir, 'practice-drafts.json'));
  });
});

// QF.33 (review round 1 M1): its own campaign and server, so it passes alone
// and in any order.
describe('practice drafts across sessions (QF.33)', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  let fake: FixtureAiClient | undefined;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-drafts-qf33-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    store = campaign(root);
    fake = undefined;
    const coDm = new CoDm({
      dir: path.join(root, 'app-data'),
      cipher: null,
      makeClient: () => {
        fake = new FixtureAiClient([
          {
            role: 'fast',
            match: 'Practice drafts.',
            text: JSON.stringify({
              drafts: [
                {
                  line: 2,
                  character: 'Jake',
                  skill: "Archer's Eye",
                  action: 'Spots the weak scale',
                  confidence: 'high',
                },
              ],
            }),
          },
        ]);
        return fake;
      },
    });
    app = await createServer({ webRoot: root, live: { store, ...hubOpts }, coDm });
  });
  afterEach(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  const run = (type: string, at: string) => {
    let n = 0;
    const r = execute(store.campaign, { type } as never, {
      actor: { role: 'gm' as const },
      sessionId: store.campaign.state?.currentSession ?? null,
      now: () => at,
      newId: () => `${type}-${at}-${++n}`,
    });
    if (!r.ok) throw new Error(r.error);
    store.appendAll(r.events);
  };
  const say = (at: string, lines: readonly string[]) => {
    const state = store.campaign.state!;
    const current = state.sessions.find((x) => x.id === state.currentSession)!;
    const dir = transcriptsDir(store);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      transcriptFile(dir, current.number),
      lines
        .map((text, i) => JSON.stringify({ at, startMs: i * 5000, endMs: i * 5000 + 900, text }))
        .join('\n') + '\n',
    );
    return current.id;
  };
  const post = () => app.inject({ method: 'POST', url: '/api/gm/ai/practice-drafts', headers: gm });

  it('a pending draft from an earlier session does not block the same use now', async () => {
    run('session.start', '2026-10-26T19:00:00.000Z');
    const first = say('2026-10-26T19:01:00.000Z', ['Into the canyon.', 'Jake uses Archer’s Eye.']);
    const r1 = await post();
    expect(r1.statusCode, r1.body).toBe(200);
    expect(r1.json()).toMatchObject({ added: 1 });
    run('session.end', '2026-10-26T22:00:00.000Z');
    // Session 1's draft is still pending (never confirmed or dismissed).
    run('session.start', '2026-10-27T19:00:00.000Z');
    const second = say('2026-10-27T19:01:00.000Z', [
      'Back to the canyon.',
      'Jake uses Archer’s Eye.',
    ]);
    expect(second).not.toBe(first);
    const r2 = await post();
    expect(r2.statusCode, r2.body).toBe(200);
    expect(r2.json()).toMatchObject({ added: 1, read: 2 });
    const drafts = r2.json().drafts as { skill: string; sessionId: string }[];
    expect(drafts.map((d) => d.sessionId)).toEqual([first, second]);
    // This session's own pending draft still blocks drafting it twice.
    say('2026-10-27T19:09:00.000Z', [
      'Back to the canyon.',
      'Jake uses Archer’s Eye.',
      'Again.',
      'Jake uses Archer’s Eye.',
    ]);
    const r3 = await post();
    expect(r3.statusCode, r3.body).toBe(200);
    expect(r3.json()).toMatchObject({ added: 0 });
    expect(fake?.requests.at(-1)?.messages.at(-1)?.content).toContain('Jake uses Archer’s Eye.');
  });
});
