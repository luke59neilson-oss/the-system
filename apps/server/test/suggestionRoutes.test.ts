import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { CoDm } from '../src/ai/coDm';
import { e2eFakeCipher } from '../src/ai/e2eFake';
import { FixtureAiClient } from '../src/ai/fake';
import { createServer } from '../src/server';
import { transcriptsDir } from '../src/speech/routes';
import { transcriptFile } from '../src/speech/transcript';
import { CampaignStore } from '../src/store';

// MC.8: GM-only suggestion routes, backed by the fixture fast model. A test
// key is saved: without one nothing is asked (MD.2, D258).
const withKey = (c: CoDm): CoDm => {
  c.keys.save('sk-ant-e2e-suggest-0123456789abcdef');
  return c;
};
const GM = 's'.repeat(32);
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

const CHIPS = JSON.stringify({
  chips: [
    {
      line: 1,
      type: 'generate',
      kind: 'shop',
      title: 'Herbalist shop',
      request: 'An herbalist near the canyon',
    },
    { line: 1, type: 'complication', kind: 'encounter', title: 'Pale hunters', request: 'Ambush' },
  ],
});

describe('suggestion routes (MC.8)', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  let fake: FixtureAiClient;
  let coDm: CoDm;
  let clock = Date.parse('2026-10-26T19:00:00.000Z');

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-chips-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    store = campaign(root);
    coDm = withKey(
      new CoDm({
        dir: path.join(root, 'app-data'),
        cipher: e2eFakeCipher,
        makeClient: () => {
          fake = new FixtureAiClient([
            {
              role: 'fast',
              match: 'Suggestions.',
              usage: { inputTokens: 1000, outputTokens: 200 },
              text: CHIPS,
            },
          ]);
          return fake;
        },
      }),
    );
    app = await createServer({
      webRoot: root,
      live: { store, ...hubOpts },
      coDm,
      now: () => clock,
    });
  });
  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  const post = (payload: object = {}) =>
    app.inject({ method: 'POST', url: '/api/gm/ai/suggestions', headers: gm, payload });
  const say = (texts: string[]) => {
    const dir = transcriptsDir(store);
    mkdirSync(dir, { recursive: true });
    const body = texts.map((text, i) =>
      JSON.stringify({ at: '2026-10-26T19:00:00.000Z', startMs: i, endMs: i, text }),
    );
    writeFileSync(transcriptFile(dir, 0), body.join('\n') + '\n');
  };
  const titles = (chips: { title: string }[]) => chips.map((c) => c.title);

  it('is GM-only', async () => {
    for (const [method, url] of [
      ['GET', '/api/gm/ai/suggestions'],
      ['POST', '/api/gm/ai/suggestions'],
      ['DELETE', '/api/gm/ai/suggestions/x'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('suggests from new talk, paces calls, counts spend, and keeps dismissed chips away', async () => {
    expect((await post()).json()).toMatchObject({ chips: [], called: false });
    expect(fake.requests).toHaveLength(0);

    say(['We should find an herbalist before the canyon.', 'Jake nocks an arrow and waits.']);
    const r = await post();
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().called).toBe(true);
    const chips = r.json().chips as { id: string; title: string; quote: string }[];
    expect(chips.map((c) => [c.title, c.quote])).toEqual([
      ['Herbalist shop', 'We should find an herbalist before the canyon.'],
      ['Pale hunters', 'We should find an herbalist before the canyon.'],
    ]);
    expect(fake.requests[0]!.role).toBe('fast');
    expect(coDm.spend.snapshot().calls).toBe(1);
    // Nothing changed in the campaign.
    expect(store.campaign.state?.practice).toEqual([]);

    // New talk 30 s later: not due yet, even when asked by hand.
    say(['a', 'b', 'Someone mentions an old friend.']);
    clock += 30_000;
    expect((await post({ manual: true })).json().called).toBe(false);
    expect(fake.requests).toHaveLength(1);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/gm/ai/suggestions/${chips[0]!.id}`,
      headers: gm,
    });
    expect(del.statusCode).toBe(200);
    expect(titles(del.json().chips)).toEqual(['Pale hunters']);

    clock += 90_000;
    const again = await post();
    expect(again.json().called).toBe(true);
    expect(fake.requests).toHaveLength(2);
    // Only the line heard since the last call was read.
    const prompt = fake.requests[1]!.messages[0]!.content;
    expect(prompt).toContain('1. Someone mentions an old friend.');
    expect(prompt).not.toContain('herbalist');
    // The model offered the herbalist again; it stays dismissed.
    expect(titles(again.json().chips)).toEqual(['Pale hunters']);
  });

  it('refuses a bad interval', async () => {
    expect((await post({ intervalS: 5 })).statusCode).toBe(400);
  });
});

describe('suggestion routes after a bad reply (MC.8 review M1)', () => {
  let root: string;
  let app: FastifyInstance;
  let fake: FixtureAiClient;
  let clock = Date.parse('2026-10-26T19:00:00.000Z');

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-chips-bad-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    const store = campaign(root);
    const coDm = withKey(
      new CoDm({
        dir: path.join(root, 'app-data'),
        cipher: e2eFakeCipher,
        makeClient: () => {
          fake = new FixtureAiClient([{ role: 'fast', match: 'Suggestions.', text: 'not json' }]);
          return fake;
        },
      }),
    );
    app = await createServer({
      webRoot: root,
      live: { store, ...hubOpts },
      coDm,
      now: () => clock,
    });
    const dir = transcriptsDir(store);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      transcriptFile(dir, 0),
      JSON.stringify({
        at: '2026-10-26T19:00:00.000Z',
        startMs: 0,
        endMs: 0,
        text: 'An herbalist?',
      }) + '\n',
    );
  });
  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('does not ask again on the next poll after a reply it could not read', async () => {
    const post = () =>
      app.inject({ method: 'POST', url: '/api/gm/ai/suggestions', headers: gm, payload: {} });
    expect((await post()).statusCode).not.toBe(200);
    expect(fake.requests).toHaveLength(1);
    clock += 15_000;
    expect((await post()).json()).toMatchObject({ called: false });
    expect(fake.requests).toHaveLength(1);
    // The line is a question, but it already had its early look: a failed
    // call is not retried every 30 s (MD.2 review M1).
    clock += 20_000;
    expect((await post()).json()).toMatchObject({ called: false });
    expect(fake.requests).toHaveLength(1);
    clock += 120_000;
    await post();
    expect(fake.requests).toHaveLength(2);
  });
});

describe('suggestion routes with a dismissal mid-call (MC.8 review M2)', () => {
  let root: string;
  let app: FastifyInstance;
  let release: () => void = () => {};
  let gated = false;
  let started = false;
  let clock = Date.parse('2026-10-26T19:00:00.000Z');

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-chips-race-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    const store = campaign(root);
    const coDm = withKey(
      new CoDm({
        dir: path.join(root, 'app-data'),
        cipher: e2eFakeCipher,
        makeClient: () => {
          const inner = new FixtureAiClient([{ role: 'fast', match: 'Suggestions.', text: CHIPS }]);
          return {
            complete: async (request) => {
              started = true;
              if (gated) await new Promise<void>((resolve) => (release = resolve));
              return inner.complete(request);
            },
          };
        },
      }),
    );
    app = await createServer({
      webRoot: root,
      live: { store, ...hubOpts },
      coDm,
      now: () => clock,
    });
    const dir = transcriptsDir(store);
    mkdirSync(dir, { recursive: true });
    const line = (text: string, i: number) =>
      JSON.stringify({ at: '2026-10-26T19:00:00.000Z', startMs: i, endMs: i, text });
    writeFileSync(transcriptFile(dir, 0), line('We should find an herbalist.', 0) + '\n');
    afterFirst = () =>
      writeFileSync(
        transcriptFile(dir, 0),
        [line('We should find an herbalist.', 0), line('The herbalist again.', 1)].join('\n') +
          '\n',
      );
  });
  let afterFirst: () => void = () => {};
  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('keeps a chip dismissed while a call is running gone', async () => {
    const post = () =>
      app.inject({ method: 'POST', url: '/api/gm/ai/suggestions', headers: gm, payload: {} });
    const first = await post();
    expect(first.statusCode, first.body).toBe(200);
    const herb = (first.json().chips as { id: string; title: string }[]).find(
      (c) => c.title === 'Herbalist shop',
    )!;
    afterFirst();
    clock += 120_000;
    gated = true;
    started = false;
    const pending = post();
    while (!started) await new Promise((r) => setTimeout(r, 5));
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/gm/ai/suggestions/${herb.id}`,
      headers: gm,
    });
    expect(del.statusCode).toBe(200);
    // QF.35 (a): a second POST while one is asking is refused, never a second
    // paid call (without the guard it would start a call and wait on the gate).
    const overlap = await Promise.race([
      post(),
      new Promise<'hung'>((r) => setTimeout(() => r('hung'), 2_000)),
    ]);
    expect(overlap === 'hung' ? 'hung' : overlap.statusCode).toBe(409);
    if (overlap !== 'hung') expect(overlap.json().error).toBe('Already suggesting');
    release();
    const second = await pending;
    expect(second.statusCode, second.body).toBe(200);
    expect((second.json().chips as { title: string }[]).map((c) => c.title)).not.toContain(
      'Herbalist shop',
    );
  });
});

describe('the co-DM row of five (MD.2)', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  let fake: FixtureAiClient;
  let clock = Date.parse('2026-10-26T19:00:00.000Z');
  const ideas = (line: number, names: string[]) =>
    JSON.stringify({
      chips: names.map((title) => ({ line, type: 'generate', kind: 'npc', title, request: title })),
    });

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-chips-row-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    store = campaign(root);
    const coDm = withKey(
      new CoDm({
        dir: path.join(root, 'app-data'),
        cipher: e2eFakeCipher,
        makeClient: () => {
          fake = new FixtureAiClient([
            { role: 'fast', match: 'The camp is quiet.', text: ideas(1, ['A', 'B', 'C']) },
            { role: 'fast', match: 'Can we cross', text: ideas(1, ['D', 'E', 'F', 'G']) },
            { role: 'fast', match: 'Suggestions.', text: ideas(1, ['Z']) },
          ]);
          return fake;
        },
      }),
    );
    app = await createServer({
      webRoot: root,
      live: { store, ...hubOpts },
      coDm,
      now: () => clock,
    });
  });
  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  const heard: string[] = [];
  const say = (text: string) => {
    heard.push(text);
    const dir = transcriptsDir(store);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      transcriptFile(dir, 0),
      heard
        .map((t, i) =>
          JSON.stringify({ at: '2026-10-26T19:00:00.000Z', startMs: i, endMs: i, text: t }),
        )
        .join('\n') + '\n',
    );
  };
  const post = () =>
    app.inject({ method: 'POST', url: '/api/gm/ai/suggestions', headers: gm, payload: {} });
  type Row = { slots: ({ title: string; id: string } | null)[]; more: { title: string }[] };
  const shape = (r: Row) => ({
    slots: r.slots.map((c) => c?.title ?? null),
    more: r.more.map((c) => c.title),
  });

  it('fills slots, keeps them stable, refreshes on a question, and refills a dismissed slot', async () => {
    say('The camp is quiet.');
    const first = await post();
    expect(first.json().called).toBe(true);
    expect(shape(first.json())).toEqual({ slots: ['A', 'B', 'C', null, null], more: [] });

    // 30 s later a plain line is not enough (the interval is 90 s)…
    clock += 30_000;
    say('The fire crackles.');
    expect((await post()).json().called).toBe(false);
    // …but a player question is: the row refreshes without waiting for the timer.
    say('Can we cross the river tonight?');
    const second = await post();
    expect(second.json().called).toBe(true);
    expect(fake.requests).toHaveLength(2);
    expect(shape(second.json())).toEqual({ slots: ['A', 'B', 'C', 'D', 'E'], more: ['F', 'G'] });

    // Dismissing B empties slot 7 and the first waiting chip takes it; nothing else moves.
    const b = (second.json() as Row).slots[1]!;
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/gm/ai/suggestions/${b.id}`,
      headers: gm,
    });
    expect(shape(del.json())).toEqual({ slots: ['A', 'F', 'C', 'D', 'E'], more: ['G'] });
    const got = await app.inject({ method: 'GET', url: '/api/gm/ai/suggestions', headers: gm });
    expect(shape(got.json())).toEqual({ slots: ['A', 'F', 'C', 'D', 'E'], more: ['G'] });
  });
});

describe('suggestions without a key (MD.2, D258)', () => {
  let root: string;
  let app: FastifyInstance;
  let coDm: CoDm;
  let fake: FixtureAiClient;
  const clock = Date.parse('2026-10-26T19:00:00.000Z');

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-chips-nokey-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    const store = campaign(root);
    coDm = new CoDm({
      dir: path.join(root, 'app-data'),
      cipher: e2eFakeCipher,
      makeClient: () => {
        fake = new FixtureAiClient([{ role: 'fast', match: 'Suggestions.', text: CHIPS }]);
        return fake;
      },
    });
    app = await createServer({
      webRoot: root,
      live: { store, ...hubOpts },
      coDm,
      now: () => clock,
    });
    const dir = transcriptsDir(store);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      transcriptFile(dir, 0),
      JSON.stringify({ at: '2026-10-26T19:00:00.000Z', startMs: 0, endMs: 0, text: 'Hi.' }) + '\n',
    );
  });
  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('asks nothing and keeps the pace free until a key is saved', async () => {
    const post = (manual = false) =>
      app.inject({
        method: 'POST',
        url: '/api/gm/ai/suggestions',
        headers: gm,
        payload: { manual },
      });
    // A poll is a quiet no; "Suggest now" says why.
    const r = await post();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ called: false, needsKey: true });
    const asked = await post(true);
    expect(asked.statusCode).toBe(409);
    expect(asked.json()).toMatchObject({ called: false, error: 'No API key is set' });
    expect(fake.requests).toHaveLength(0);
    coDm.keys.save('sk-ant-e2e-suggest-0123456789abcdef');
    // At the same moment: the keyless poll did not start the 60 s wait.
    const now = await post(true);
    expect(now.json().called).toBe(true);
    expect(fake.requests).toHaveLength(1);
  });
});
