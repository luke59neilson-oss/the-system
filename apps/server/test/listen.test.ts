import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
