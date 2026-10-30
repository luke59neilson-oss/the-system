import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { LiveHub } from '../src/hub';
import type { ServerMessage } from '../src/protocol';
import { createServer } from '../src/server';
import { transcriptsDir } from '../src/speech/routes';
import { FixtureSpeechToText } from '../src/speech/stt';
import { DEFAULT_VAD } from '../src/speech/vad';
import { CampaignStore } from '../src/store';

// MC.5 (DESIGN §11 "Listening"): the GM-only listen routes, the transcript
// file (text only, never audio) and the players' "listening" mark.
const GM = 'l'.repeat(32);
const RATE = DEFAULT_VAD.sampleRate;
let ids = 0;
const hubOpts = { gmKey: GM, now: () => '2026-10-26T07:00:00.000Z', newId: () => `h${++ids}` };
const tone = (ms: number) =>
  Float32Array.from({ length: (RATE * ms) / 1000 }, (_, i) => 0.2 * Math.sin(i / 5));
/** A tone whose level rises and falls 4 times a second, like syllables (MC.6 enrolment). */
const voice = (ms: number) =>
  Float32Array.from(
    { length: (RATE * ms) / 1000 },
    (_, i) => 0.2 * (0.55 + 0.45 * Math.sin((2 * Math.PI * 4 * i) / RATE)) * Math.sin(i / 5),
  );
const pcm = (...parts: Float32Array[]) => {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const buf = Buffer.alloc(n * 4);
  let at = 0;
  for (const p of parts) for (const x of p) buf.writeFloatLE(x, 4 * at++);
  return buf;
};

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
        { name: 'A', rarity: 'inferior' },
        { name: 'B', rarity: 'inferior' },
        { name: 'C', rarity: 'common' },
      ],
    },
  ]) {
    const r = execute(store.campaign, command as never, ctx);
    if (!r.ok) throw new Error(r.error);
    store.appendAll(r.events);
  }
  return store;
}

describe('listen routes (MC.5)', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  const stt = new FixtureSpeechToText(['We want an herbalist.', 'Jake draws his bow.']);
  const gm = { 'x-gm-key': GM };

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-listen-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    store = campaign(root);
    app = await createServer({
      webRoot: root,
      live: { store, ...hubOpts },
      speech: () => stt,
      now: () => Date.parse('2026-10-26T19:00:00.000Z'),
    });
  });
  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('is GM-only', async () => {
    for (const [method, url] of [
      ['GET', '/api/gm/listen'],
      ['POST', '/api/gm/listen'],
      ['POST', '/api/gm/listen/audio'],
    ] as const) {
      const r = await app.inject(
        method === 'POST' ? { method, url, payload: {} } : { method, url },
      );
      expect(r.statusCode, url).toBe(403);
    }
  });

  it('refuses audio while not listening and a bad body', async () => {
    const audio = await app.inject({
      method: 'POST',
      url: '/api/gm/listen/audio',
      headers: { ...gm, 'content-type': 'application/octet-stream' },
      payload: pcm(tone(100)),
    });
    expect(audio.statusCode).toBe(409);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/gm/listen',
      headers: gm,
      payload: { on: 'yes' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('transcribes what it hears to a text file and keeps no audio', async () => {
    const on = await app.inject({
      method: 'POST',
      url: '/api/gm/listen',
      headers: gm,
      payload: { on: true },
    });
    expect(on.json()).toEqual({ on: true });
    const send = (buf: Buffer) =>
      app.inject({
        method: 'POST',
        url: '/api/gm/listen/audio',
        headers: { ...gm, 'content-type': 'application/octet-stream' },
        payload: buf,
      });
    expect((await send(pcm(tone(600), new Float32Array(RATE)))).statusCode).toBe(200);
    expect((await send(pcm(tone(500)))).statusCode).toBe(200);
    expect((await send(Buffer.alloc(3))).statusCode).toBe(400);
    const off = await app.inject({
      method: 'POST',
      url: '/api/gm/listen',
      headers: gm,
      payload: { on: false },
    });
    expect(off.json()).toEqual({ on: false });
    const status = (await app.inject({ url: '/api/gm/listen', headers: gm })).json();
    expect(status.on).toBe(false);
    expect(status.available).toBe(true);
    expect(status.lines.map((l: { text: string }) => l.text)).toEqual([
      'We want an herbalist.',
      'Jake draws his bow.',
    ]);
    const dir = transcriptsDir(store);
    // Outside a session the file is session-00.
    expect(readdirSync(dir)).toEqual(['session-00.jsonl']);
    const text = readFileSync(path.join(dir, 'session-00.jsonl'), 'utf8');
    expect(text.trim().split('\n')).toHaveLength(2);
    expect(text).toContain('"at":"2026-10-26T19:00:00.000Z"');
  });

  it('says when speech-to-text is not installed', async () => {
    const r2 = mkdtempSync(path.join(tmpdir(), 'the-system-listen-'));
    writeFileSync(path.join(r2, 'index.html'), '<!doctype html>');
    const s2 = campaign(r2);
    const app2 = await createServer({ webRoot: r2, live: { store: s2, ...hubOpts } });
    const r = await app2.inject({
      method: 'POST',
      url: '/api/gm/listen',
      headers: gm,
      payload: { on: true },
    });
    expect(r.statusCode).toBe(503);
    expect((await app2.inject({ url: '/api/gm/listen', headers: gm })).json().available).toBe(
      false,
    );
    await app2.close();
    rmSync(r2, { recursive: true, force: true });
  });
});

describe('listening mark (MC.5)', () => {
  it('tells joined players and the GM when listening starts and stops, and late joiners', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'the-system-listen-'));
    const store = campaign(root);
    const hub = new LiveHub(store, hubOpts);
    const listening = (got: ServerMessage[]) =>
      got.filter((m) => m.type === 'listening').map((m) => (m as { on: boolean }).on);
    const player: ServerMessage[] = [];
    const stranger: ServerMessage[] = [];
    hub
      .connect((m) => player.push(m))
      .receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'jake' }));
    hub.connect((m) => stranger.push(m));
    hub.setListening(true);
    hub.setListening(true);
    const late: ServerMessage[] = [];
    hub
      .connect((m) => late.push(m))
      .receive(JSON.stringify({ type: 'join', role: 'gm', gmKey: GM }));
    hub.setListening(false);
    expect(listening(player)).toEqual([true, false]);
    expect(listening(late)).toEqual([true, false]);
    // A connection that has not joined hears nothing.
    expect(listening(stranger)).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});

// QF.35 (b): every test gets its own campaign, server and fake embedder
// queue, so each passes alone and in any order.
describe('voice enrolment routes (MC.6)', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  const gm = { 'x-gm-key': GM, 'content-type': 'application/octet-stream' };
  let embeds: number[][] = [];
  const embedder = {
    embed: () => Promise.resolve(embeds.shift() ?? null),
  };

  beforeEach(async () => {
    embeds = [];
    root = mkdtempSync(path.join(tmpdir(), 'the-system-enrol-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    store = campaign(root);
    app = await createServer({
      webRoot: root,
      live: { store, ...hubOpts },
      speech: () => new FixtureSpeechToText([]),
      speakers: () => embedder,
      now: () => Date.parse('2026-10-26T19:00:00.000Z'),
    });
  });
  afterEach(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('is GM-only', async () => {
    for (const [method, url] of [
      ['GET', '/api/gm/listen/speakers'],
      ['POST', '/api/gm/listen/speakers/jake'],
      ['DELETE', '/api/gm/listen/speakers/jake'],
    ] as const) {
      const r = await app.inject({ method, url });
      expect(r.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('enrols a 4 s sample, keeps only the embedding, lists names, and deletes it', async () => {
    embeds.push([1, 0, 0]);
    const r = await app.inject({
      method: 'POST',
      url: '/api/gm/listen/speakers/jake',
      headers: gm,
      payload: pcm(voice(4000)),
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      characterId: 'jake',
      name: 'Jake',
      enrolledAt: '2026-10-26T19:00:00.000Z',
    });
    const list = await app.inject({ method: 'GET', url: '/api/gm/listen/speakers', headers: gm });
    expect(list.json()).toEqual({
      available: true,
      model: null,
      enrolments: [{ characterId: 'jake', name: 'Jake', enrolledAt: '2026-10-26T19:00:00.000Z' }],
    });
    // No embedding leaves the server, and no audio is kept.
    expect(list.body).not.toContain('embedding');
    expect(readdirSync(path.join(store.dir, 'speakers'))).toEqual(['speakers.json']);
    expect(
      JSON.parse(readFileSync(path.join(store.dir, 'speakers', 'speakers.json'), 'utf8'))
        .enrolments[0].embedding,
    ).toEqual([1, 0, 0]);
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/gm/listen/speakers/jake',
      headers: gm,
    });
    expect(del.statusCode).toBe(200);
    const again = await app.inject({
      method: 'DELETE',
      url: '/api/gm/listen/speakers/jake',
      headers: gm,
    });
    expect(again.statusCode).toBe(404);
    const after = await app.inject({ method: 'GET', url: '/api/gm/listen/speakers', headers: gm });
    expect(after.json().enrolments).toEqual([]);
  });

  it('refuses an unknown character, a short sample, bad bytes and an unheard voice', async () => {
    const post = (url: string, payload: Buffer) =>
      app.inject({ method: 'POST', url, headers: gm, payload });
    expect((await post('/api/gm/listen/speakers/nobody', pcm(voice(4000)))).statusCode).toBe(404);
    expect((await post('/api/gm/listen/speakers/constructor', pcm(voice(4000)))).statusCode).toBe(
      404,
    );
    const short = await post('/api/gm/listen/speakers/jake', pcm(voice(1000)));
    expect(short.statusCode).toBe(400);
    expect(short.json().error).toMatch(/at least 3 seconds/);
    expect((await post('/api/gm/listen/speakers/jake', Buffer.alloc(7))).statusCode).toBe(400);
    // A steady hum (a fan, a tone) is not a voice either.
    const hum = await post('/api/gm/listen/speakers/jake', pcm(tone(4000)));
    expect(hum.statusCode).toBe(422);
    // 4 s of silence: refused before the embedder is asked (D241).
    const silent = await post('/api/gm/listen/speakers/jake', pcm(new Float32Array(RATE * 4)));
    expect(silent.statusCode).toBe(422);
    expect(silent.json().error).toMatch(/Could not hear a voice/);
    expect(embeds).toEqual([]);
    // The fake embedder is out of vectors: no voice heard.
    expect((await post('/api/gm/listen/speakers/jake', pcm(voice(4000)))).statusCode).toBe(422);
  });

  it('refuses to enrol while listening (one mic at a time, D241)', async () => {
    const on = await app.inject({
      method: 'POST',
      url: '/api/gm/listen',
      headers: { 'x-gm-key': GM, 'content-type': 'application/json' },
      payload: { on: true },
    });
    expect(on.statusCode, on.body).toBe(200);
    const r = await app.inject({
      method: 'POST',
      url: '/api/gm/listen/speakers/jake',
      headers: gm,
      payload: pcm(voice(4000)),
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toMatch(/Stop listening/);
    await app.inject({
      method: 'POST',
      url: '/api/gm/listen',
      headers: { 'x-gm-key': GM, 'content-type': 'application/json' },
      payload: { on: false },
    });
  });

  it('reports a damaged voices file and leaves it as it is (D241)', async () => {
    const dir = path.join(store.dir, 'speakers');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'speakers.json');
    writeFileSync(file, '{ damaged');
    const list = await app.inject({ method: 'GET', url: '/api/gm/listen/speakers', headers: gm });
    expect(list.statusCode).toBe(500);
    expect(list.json().error).toMatch(/damaged/);
    embeds.push([0, 1, 0]);
    const r = await app.inject({
      method: 'POST',
      url: '/api/gm/listen/speakers/jake',
      headers: gm,
      payload: pcm(voice(4000)),
    });
    expect(r.statusCode).toBe(500);
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/gm/listen/speakers/jake',
      headers: gm,
    });
    expect(del.statusCode).toBe(500);
    expect(readFileSync(file, 'utf8')).toBe('{ damaged');
  });

  it('takes a 15 s sample but not a longer one', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/gm/listen/speakers/jake',
      headers: gm,
      payload: pcm(voice(16000)),
    });
    expect(r.statusCode).toBe(413);
    // 15 s gets through the size check (the fake then hears no voice: 422).
    const ok = await app.inject({
      method: 'POST',
      url: '/api/gm/listen/speakers/jake',
      headers: { 'x-gm-key': GM, 'content-type': 'application/octet-stream' },
      payload: pcm(voice(15000)),
    });
    expect(ok.statusCode).toBe(422);
  });
});
