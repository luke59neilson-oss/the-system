// Integration (M2.2): GM + 2 players over real WebSockets on a random port.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '@the-system/engine';
import { newGmKey } from '../src/security';
import { createServer } from '../src/server';
import { CampaignStore } from '../src/store';

const GM_CANARY = 'CANARY-GM-only';
const GM_NUMBER = 987654321;

let rawBase = '';
/** Raw HTTP request (exact request-target, no client normalization). */
function raw(
  method: string,
  target: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  const [host, port] = rawBase.split(':');
  return new Promise((resolve, reject) => {
    const req = request({ host, port: Number(port), method, path: target, agent: false, headers });
    req.on('response', (res) => {
      let body = '';
      res.on('data', (c: Buffer) => (body += c.toString()));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

class Client {
  readonly frames: string[] = [];
  private readonly ws: WebSocket;
  private waiters: { test: (m: Record<string, unknown>) => boolean; done: () => void }[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', (event) => {
      const text = String(event.data);
      this.frames.push(text);
      const message = JSON.parse(text) as Record<string, unknown>;
      this.waiters = this.waiters.filter((w) => {
        if (!w.test(message)) return true;
        w.done();
        return false;
      });
    });
  }

  messages(): Record<string, unknown>[] {
    return this.frames.map((f) => JSON.parse(f) as Record<string, unknown>);
  }

  /** Resolves with the first message (already received or future) matching `test`. */
  waitFor(
    test: (m: Record<string, unknown>) => boolean,
    from = 0,
    ms = 3000,
  ): Promise<Record<string, unknown>> {
    const seen = this.messages().slice(from).find(test);
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for a message')), ms);
      this.waiters.push({
        test,
        done: () => {
          clearTimeout(timer);
          resolve(this.messages().slice(from).find(test) as Record<string, unknown>);
        },
      });
    });
  }

  send(message: unknown): void {
    this.ws.send(JSON.stringify(message));
  }

  async open(): Promise<this> {
    await this.waitFor((m) => m.type === 'hello');
    return this;
  }

  private nextRequest = 0;
  /** Sends a command and waits for its result. */
  async command(command: Record<string, unknown>): Promise<Record<string, unknown>> {
    const requestId = `r${++this.nextRequest}`;
    const from = this.frames.length;
    this.send({ type: 'command', requestId, command });
    return this.waitFor((m) => m.type === 'result' && m.requestId === requestId, from);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.CLOSED) return resolve();
      this.ws.addEventListener('close', () => resolve());
      this.ws.close();
    });
  }
}

describe('live protocol and authority', () => {
  let dataDir: string;
  let webDir: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  let base: string;
  const gmKey = newGmKey();
  const clients: Client[] = [];
  const httpBodies: string[] = [];
  let ids = 0;

  const connect = async () => {
    const c = await new Client(`ws://${base}/ws`).open();
    clients.push(c);
    return c;
  };

  beforeAll(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-sync-'));
    webDir = mkdtempSync(path.join(tmpdir(), 'the-system-web-'));
    writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>shell</title>');
    store = CampaignStore.open('main', { dataDir, now: () => new Date().toISOString() });
    app = await createServer({
      webRoot: webDir,
      live: {
        store,
        gmKey,
        now: () => new Date(Date.UTC(2026, 9, 21, 12) + 1000 * ids).toISOString(),
        newId: () => `ev${++ids}`,
      },
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    rawBase = base;
  });

  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await app.close();
    store.close();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(webDir, { recursive: true, force: true });
  });

  it('runs a table: GM commands, filtered player updates, authority, reconnect, no leaks', async () => {
    const gm = await connect();
    gm.send({ type: 'join', role: 'gm', gmKey });
    await gm.waitFor((m) => m.type === 'joined' && m.role === 'gm');

    const rules = JSON.parse(JSON.stringify(DEFAULT_RULES)) as {
      campaign: { plannedSessions: number };
    };
    rules.campaign.plannedSessions = GM_NUMBER;
    expect((await gm.command({ type: 'campaign.create', name: 'Whale', rules })).ok).toBe(true);
    for (const id of ['jake', 'casper']) {
      const created = await gm.command({
        type: 'character.create',
        id,
        name: id,
        className: 'Archer',
        classSkills: [
          { name: `CANARY-${id}-skill-a`, rarity: 'inferior' },
          { name: `CANARY-${id}-skill-b`, rarity: 'inferior' },
          { name: `CANARY-${id}-skill-c`, rarity: 'common' },
        ],
      });
      expect(created.ok, JSON.stringify(created)).toBe(true);
    }

    // Join list over HTTP: names only.
    const list = await fetch(`http://${base}/api/characters`);
    const listBody = await list.text();
    httpBodies.push(listBody);
    expect(JSON.parse(listBody)).toEqual([
      { id: 'jake', name: 'jake', grade: 'G', theme: 'aluminum' },
      { id: 'casper', name: 'casper', grade: 'G', theme: 'aluminum' },
    ]);

    const jake = await connect();
    jake.send({ type: 'join', role: 'player', characterId: 'jake' });
    await jake.waitFor((m) => m.type === 'view');
    const casper = await connect();
    casper.send({ type: 'join', role: 'player', characterId: 'casper' });
    await casper.waitFor((m) => m.type === 'view');

    // GM awards XP: both players get their own DING, live.
    const jakeFrom = jake.frames.length;
    const award = await gm.command({
      type: 'xp.award',
      track: 'class',
      amount: 400,
      participants: [{ characterId: 'jake' }, { characterId: 'casper' }],
      reason: `${GM_CANARY} reason: the secret boss`,
    });
    expect(award.ok).toBe(true);
    const ding = await jake.waitFor((m) => m.type === 'notifications', jakeFrom);
    expect(JSON.stringify(ding)).toContain('"track":"class"');
    await casper.waitFor((m) => m.type === 'notifications');

    // Players may act only on their own character, and never as GM.
    const gmOnly = await jake.command({ type: 'character.rename', characterId: 'jake', name: 'X' });
    expect(gmOnly).toMatchObject({ ok: false });
    const cross = await jake.command({
      type: 'freePoints.assign',
      characterId: 'casper',
      raceLevel: 1,
      allocation: { strength: 2 },
    });
    expect(cross).toMatchObject({ ok: false, error: expect.stringContaining('own character') });
    const own = await jake.command({
      type: 'freePoints.assign',
      characterId: 'jake',
      raceLevel: 1,
      allocation: { strength: 2 },
    });
    expect(own.ok).toBe(true);

    // A GM join with a wrong key, or a command before joining, is refused.
    const intruder = await connect();
    intruder.send({ type: 'join', role: 'gm', gmKey: 'guess' });
    await intruder.waitFor((m) => m.type === 'error');
    expect(
      await intruder.command({ type: 'character.rename', characterId: 'jake', name: 'X' }),
    ).toMatchObject({ ok: false, error: 'Join first' });
    intruder.send({ type: 'join', role: 'player', characterId: 'ghost' });
    await intruder.waitFor((m) => m.type === 'error' && m.error === 'No such character');
    intruder.send({ nonsense: true });
    await intruder.waitFor((m) => m.type === 'error' && m.error === 'Message has an unknown shape');

    // GM HTTP routes need the key.
    const denied = await fetch(`http://${base}/api/gm/export`);
    httpBodies.push(await denied.text());
    expect(denied.status).toBe(403);
    // Encodings and request forms that could slip past a string check.
    for (const [method, target] of [
      ['GET', '/%61pi/gm/export'],
      ['GET', '/a%70i/gm/export'],
      ['HEAD', '/%61pi/gm/export'],
      ['GET', `http://${base}/api/gm/export`],
      ['GET', '//api/gm/export'],
      ['GET', '/api/gm/export/'],
    ] as const) {
      const res = await raw(method, target);
      httpBodies.push(res.body);
      expect([400, 403, 404], `${method} ${target} → ${res.status}`).toContain(res.status);
    }
    const rebound = await raw('GET', '/api/characters', {
      Host: `evil.example:${base.split(':')[1]}`,
    });
    expect(rebound.status).toBe(421);
    const allowed = await fetch(`http://${base}/api/gm/export`, { headers: { 'x-gm-key': gmKey } });
    expect(allowed.status).toBe(200);
    expect(((await allowed.json()) as { events: unknown[] }).events.length).toBe(
      store.campaign.events.length,
    );

    // Reconnect: Casper drops, misses a level-up, and gets it on rejoin.
    const lastSeq = Math.max(
      ...casper.messages().map((m) => (typeof m.seq === 'number' ? m.seq : 0)),
    );
    await casper.close();
    const award2 = await gm.command({
      type: 'xp.award',
      track: 'class',
      amount: 300,
      participants: [{ characterId: 'casper' }],
    });
    expect(award2.ok).toBe(true);
    const back = await connect();
    back.send({ type: 'join', role: 'player', characterId: 'casper', lastSeq });
    const missed = await back.waitFor((m) => m.type === 'notifications');
    const items = missed.items as { seq: number; notification: { characterId: string } }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.seq > lastSeq && i.notification.characterId === 'casper')).toBe(
      true,
    );
    const view = (await back.waitFor((m) => m.type === 'view')) as {
      view: { me: { classLevel: number } };
    };
    expect(view.view.me.classLevel).toBe(store.campaign.state?.characters.casper?.classLevel);

    // Undo: the undone award's notifications are not replayed on a later rejoin.
    const award2Id = store.campaign.events[store.campaign.events.length - 1]?.id;
    expect((await gm.command({ type: 'event.undo', eventId: award2Id })).ok).toBe(true);
    const later = await connect();
    later.send({ type: 'join', role: 'player', characterId: 'casper', lastSeq });
    await later.waitFor((m) => m.type === 'view');
    const replayed = later
      .messages()
      .filter((m) => m.type === 'notifications')
      .flatMap((m) => m.items as { notification: { kind: string } }[]);
    expect(replayed.filter((i) => i.notification.kind === 'level')).toEqual([]);
    // A lastSeq inside this server's history is fully covered (no gap).
    const old = await connect();
    old.send({ type: 'join', role: 'player', characterId: 'casper', lastSeq: 0 });
    expect(await old.waitFor((m) => m.type === 'notifications')).toMatchObject({ gap: false });

    // Broadcasts: one to Jake alone reaches only Jake; one to all reaches both.
    const jakeAt = jake.frames.length;
    const casperAt = back.frames.length;
    const whisper = `CANARY-jake-skill whisper for Jake only`;
    expect(
      (await gm.command({ type: 'system.broadcast', text: whisper, characterIds: ['jake'] })).ok,
    ).toBe(true);
    const whisperFrame = await jake.waitFor((m) => m.type === 'notifications', jakeAt);
    expect(whisperFrame.items).toEqual([
      expect.objectContaining({
        notification: { kind: 'broadcast', characterId: 'jake', text: whisper },
      }),
    ]);
    expect((await gm.command({ type: 'system.broadcast', text: 'Day 2 dawns.' })).ok).toBe(true);
    for (const [client, at, id] of [
      [jake, jakeAt, 'jake'],
      [back, casperAt, 'casper'],
    ] as const) {
      const frame = await client.waitFor(
        (m) => m.type === 'notifications' && JSON.stringify(m).includes('Day 2 dawns.'),
        at,
      );
      expect(frame.items).toEqual([
        expect.objectContaining({
          notification: { kind: 'broadcast', characterId: id, text: 'Day 2 dawns.' },
        }),
      ]);
    }

    // Canary: no player frame or public HTTP body carries GM-only or others' data.
    const check = (frames: string[], owner: string | null, label: string) => {
      const text = frames.join('\n');
      expect(text, label).not.toContain(GM_CANARY);
      expect(text, label).not.toMatch(new RegExp(`(?<![0-9])${GM_NUMBER}(?![0-9])`));
      for (const id of ['jake', 'casper']) {
        if (id === owner) expect(text, label).toContain(`CANARY-${id}-skill`);
        else expect(text, label).not.toContain(`CANARY-${id}-skill`);
      }
    };
    check(jake.frames, 'jake', 'jake');
    check(casper.frames, 'casper', 'casper (before reconnect)');
    check(back.frames, 'casper', 'casper (after reconnect)');
    check(intruder.frames, null, 'intruder');
    check(later.frames, 'casper', 'casper (after undo)');
    check(old.frames, 'casper', 'casper (old seq)');
    check(httpBodies, null, 'http');
    // The GM does see everything.
    expect(gm.frames.join('\n')).toContain('CANARY-jake-skill');
  });

  it('refuses WebSocket upgrades from another origin', async () => {
    const [host, port] = base.split(':');
    const status = (origin: string) =>
      new Promise<number>((resolve, reject) => {
        const req = request({
          host,
          port: Number(port),
          path: '/ws',
          agent: false,
          headers: {
            Connection: 'Upgrade',
            Upgrade: 'websocket',
            Origin: origin,
            'Sec-WebSocket-Version': '13',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          },
        });
        req.on('upgrade', (_res, socket) => {
          socket.destroy();
          resolve(101);
        });
        req.on('response', (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
      });
    expect(await status('http://evil.example')).toBe(403);
    expect(await status(`http://${base}`)).toBe(101);
  });
});
