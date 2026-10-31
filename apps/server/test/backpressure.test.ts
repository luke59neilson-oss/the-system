// QF.53: sleeping phones don't grow the laptop's memory. A socket that stops
// reading gets no per-command views while its send queue is over the backlog
// limit, and one whole view when it drains; a socket that misses two pongs
// is dropped.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { projectForGm } from '@the-system/engine';
import { BIG_HEROES, bigCampaignLines } from '../../../scripts/big-campaign';
import { LiveHub } from '../src/hub';
import type { ServerMessage } from '../src/protocol';
import { createServer } from '../src/server';
import { CampaignStore } from '../src/store';

const GM_KEY = 'k'.repeat(32);
const roots: string[] = [];
const apps: FastifyInstance[] = [];
const raws: Socket[] = [];
afterEach(async () => {
  for (const raw of raws.splice(0)) raw.destroy();
  for (const app of apps.splice(0)) await app.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function campaignStore(events: number): CampaignStore {
  const root = mkdtempSync(path.join(tmpdir(), 'the-system-backpressure-'));
  roots.push(root);
  const dir = path.join(root, 'campaigns', 'long');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'events.jsonl'), `${bigCampaignLines(events).join('\n')}\n`);
  let ms = Date.UTC(2027, 0, 1);
  return CampaignStore.open('long', {
    dataDir: root,
    now: () => new Date((ms += 1000)).toISOString(),
  });
}

let ids = 0;
async function serve(store: CampaignStore, extra: { wsHeartbeatMs?: number } = {}) {
  let ms = Date.UTC(2027, 1, 1);
  const webRoot = mkdtempSync(path.join(tmpdir(), 'the-system-backpressure-web-'));
  roots.push(webRoot);
  writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
  const app = await createServer({
    webRoot,
    live: {
      store,
      gmKey: GM_KEY,
      now: () => new Date((ms += 1000)).toISOString(),
      newId: () => `bp${++ids}`,
    },
    ...extra,
  });
  apps.push(app);
  await app.listen({ port: 0, host: '127.0.0.1' });
  return `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

/** One masked client text frame (RFC 6455 §5.2). */
function frame(text: string): Buffer {
  const payload = Buffer.from(text);
  const mask = randomBytes(4);
  const len = payload.length;
  const head =
    len < 126
      ? Buffer.from([0x81, 0x80 | len])
      : Buffer.from([0x81, 0x80 | 126, (len >> 8) & 0xff, len & 0xff]);
  const body = Buffer.alloc(len);
  for (let i = 0; i < len; i++) body[i] = (payload[i] as number) ^ (mask[i % 4] as number);
  return Buffer.concat([head, mask, body]);
}

/**
 * A WebSocket client on a raw TCP socket, so the test can stop it reading
 * (a sleeping phone): `pause()` leaves frames and pings unread.
 */
async function rawClient(
  host: string,
  join: object,
): Promise<{ socket: Socket; frames: FrameReader }> {
  const socket = connect({ host: '127.0.0.1', port: Number(host.split(':')[1]) });
  raws.push(socket);
  const frames = new FrameReader();
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.once('connect', () => {
      socket.write(
        [
          'GET /ws HTTP/1.1',
          `Host: ${host}`,
          `Origin: http://${host}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`,
          'Sec-WebSocket-Version: 13',
          '',
          '',
        ].join('\r\n'),
      );
    });
    let head = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) return;
      socket.off('data', onData);
      // Every byte after the headers is frames: read them from the first one.
      socket.on('data', (more: Buffer) => frames.push(more));
      frames.push(head.subarray(end + 4));
      if (!head.toString('latin1').startsWith('HTTP/1.1 101')) reject(new Error('no upgrade'));
      else resolve();
    };
    socket.on('data', onData);
  });
  socket.write(frame(JSON.stringify({ ...join, lastSeq: 0 })));
  return { socket, frames };
}

/** A reading client (Node's WebSocket) that keeps the newest GM state. */
function gmReader(host: string) {
  const ws = new WebSocket(`ws://${host}/ws`);
  let state: unknown;
  let results = 0;
  ws.addEventListener('message', (event) => {
    const m = JSON.parse(String(event.data)) as Record<string, unknown>;
    if (m.type === 'hello') ws.send(JSON.stringify({ type: 'join', role: 'gm', gmKey: GM_KEY }));
    if (m.type === 'state') state = m['state'];
    if (m.type === 'statePatch') {
      const next = { ...(state as object), ...(m['set'] as object) } as Record<string, unknown>;
      for (const key of (m['unset'] as string[] | undefined) ?? []) delete next[key];
      state = next;
    }
    if (m.type === 'result') results++;
  });
  let req = 0;
  return {
    ws,
    get state() {
      return state;
    },
    get results() {
      return results;
    },
    command: (c: object) =>
      ws.send(JSON.stringify({ type: 'command', requestId: `q${++req}`, command: c })),
  };
}

/** Parses unmasked server frames (text only; pings and closes skipped). */
class FrameReader {
  readonly messages: Record<string, unknown>[] = [];
  private buffer = Buffer.alloc(0);
  private parts: Buffer[] = [];
  push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      if (this.buffer.length < 2) return;
      const b0 = this.buffer[0] as number;
      let len = (this.buffer[1] as number) & 0x7f;
      let at = 2;
      if (len === 126) {
        if (this.buffer.length < 4) return;
        len = this.buffer.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (this.buffer.length < 10) return;
        len = Number(this.buffer.readBigUInt64BE(2));
        at = 10;
      }
      if (this.buffer.length < at + len) return;
      const payload = this.buffer.subarray(at, at + len);
      this.buffer = this.buffer.subarray(at + len);
      const opcode = b0 & 0x0f;
      if (opcode === 0x1 || opcode === 0x0) {
        this.parts.push(payload);
        if (b0 & 0x80) {
          this.messages.push(
            JSON.parse(Buffer.concat(this.parts).toString('utf8')) as Record<string, unknown>,
          );
          this.parts = [];
        }
      }
    }
  }
}

async function until(test: () => boolean, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

function exposeGc(): () => void {
  setFlagsFromString('--expose-gc');
  return runInNewContext('gc') as () => void;
}

/** Live memory (heap plus buffers), after collecting garbage. */
const queued = () => {
  const gc = exposeGc();
  gc();
  gc();
  const m = process.memoryUsage();
  return m.heapUsed + m.arrayBuffers;
};

describe('QF.53 backpressure', () => {
  it('the hub holds views back from a backlogged client and sends one whole view on resume', () => {
    const store = campaignStore(200);
    let n = 0;
    const hub = new LiveHub(store, {
      gmKey: GM_KEY,
      now: () => '2027-03-01T00:00:00.000Z',
      newId: () => `h${++n}`,
    });
    let backlogged = false;
    const gm: ServerMessage[] = [];
    const player: ServerMessage[] = [];
    const gmConn = hub.connect((m) => gm.push(m), { backlogged: () => backlogged });
    const playerConn = hub.connect((m) => player.push(m), { backlogged: () => backlogged });
    gmConn.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey: GM_KEY }));
    playerConn.receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'ana' }));
    // A reader drives the commands.
    const driver: ServerMessage[] = [];
    const drive = hub.connect((m) => driver.push(m));
    drive.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey: GM_KEY }));
    let req = 0;
    const broadcast = (text: string) =>
      drive.receive(
        JSON.stringify({
          type: 'command',
          requestId: `r${++req}`,
          command: { type: 'system.broadcast', text, characterIds: null },
        }),
      );

    backlogged = true;
    gm.length = 0;
    player.length = 0;
    for (let i = 0; i < 5; i++) broadcast(`held ${i}`);
    const heavy = (ms: ServerMessage[]) =>
      ms.filter((m) => m.type === 'view' || m.type === 'state' || m.type === 'statePatch');
    expect(heavy(gm)).toEqual([]);
    expect(heavy(player)).toEqual([]);
    // The commands themselves went through.
    expect(driver.filter((m) => m.type === 'result' && m.ok)).toHaveLength(5);

    // Resuming while still backlogged sends nothing.
    gmConn.resume();
    expect(heavy(gm)).toEqual([]);

    backlogged = false;
    gmConn.resume();
    playerConn.resume();
    const gmFrames = heavy(gm);
    expect(gmFrames.map((m) => m.type)).toEqual(['state']);
    const whole = gmFrames[0] as Extract<ServerMessage, { type: 'state' }>;
    expect(whole.state).toEqual(projectForGm(store.campaign.state!));
    const views = heavy(player);
    expect(views.map((m) => m.type)).toEqual(['view']);
    const view = (views[0] as Extract<ServerMessage, { type: 'view' }>).view;
    expect(JSON.stringify(view)).toContain('held 4');

    // A second resume is a no-op; the next command patches normally again.
    gmConn.resume();
    expect(heavy(gm)).toHaveLength(1);
    broadcast('after');
    expect(heavy(gm).map((m) => m.type)).toEqual(['state', 'statePatch']);
  });

  it(
    'two paused clients keep memory growth under 50 MB over 300 commands, then catch up',
    { timeout: 180_000 },
    async () => {
      const store = campaignStore(13_000);
      const host = await serve(store, { wsHeartbeatMs: 0 });
      const driver = gmReader(host);
      await until(() => driver.state !== undefined);
      const sleepingGm = await rawClient(host, { type: 'join', role: 'gm', gmKey: GM_KEY });
      const sleepingPhone = await rawClient(host, {
        type: 'join',
        role: 'player',
        characterId: BIG_HEROES[0],
      });
      sleepingGm.socket.pause();
      sleepingPhone.socket.pause();
      // Let the joins land and the warm-up settle before the baseline.
      for (let i = 0; i < 10; i++) {
        driver.command({ type: 'system.broadcast', text: `warm ${i}`, characterIds: null });
      }
      await until(() => driver.results >= 10);
      const before = queued();
      let peak = 0;
      for (let i = 0; i < 300; i++) {
        driver.command({
          type: i % 2 ? 'system.broadcast' : 'practice.log',
          ...(i % 2
            ? { text: `Sleep ${i}`, characterIds: null }
            : { characterId: BIG_HEROES[0], action: `step ${i}`, skills: ['Basic Archery'] }),
        });
        if (i % 25 === 24) {
          await until(() => driver.results >= 11 + i);
          peak = Math.max(peak, queued() - before);
        }
      }
      await until(() => driver.results >= 310);
      peak = Math.max(peak, queued() - before);
      expect(peak).toBeLessThan(50 * 1024 * 1024);

      // Both sleepers wake and read everything queued. The phone's views were
      // held back, so its last view (with the last broadcast) can only be the
      // whole one sent after the drain (`resume`).
      sleepingPhone.socket.resume();
      sleepingGm.socket.resume();
      const phone = sleepingPhone.frames;
      const gm = sleepingGm.frames;
      const lastOf = (frames: FrameReader, types: string[]) =>
        [...frames.messages].reverse().find((m) => types.includes(String(m.type)));
      await until(() => {
        const view = lastOf(phone, ['view']);
        return view !== undefined && JSON.stringify(view).includes('Sleep 299');
      });
      // The GM's per-command patches are small since QF.52, so its socket may
      // never pass the limit; either way its newest frame is current.
      await until(() => {
        const state = lastOf(gm, ['state', 'statePatch']);
        return state !== undefined && JSON.stringify(state).includes('Sleep 299');
      });
      expect(driver.state).toEqual(projectForGm(store.campaign.state!));
    },
  );

  it('drops a socket that misses two pongs', { timeout: 20_000 }, async () => {
    const store = campaignStore(20);
    const host = await serve(store, { wsHeartbeatMs: 100 });
    const { socket: asleep } = await rawClient(host, {
      type: 'join',
      role: 'player',
      characterId: 'ana',
    });
    const awake = gmReader(host);
    await until(() => awake.state !== undefined);
    asleep.pause();
    await new Promise((r) => setTimeout(r, 600));
    // The reading client answered every ping and is still here.
    expect(awake.ws.readyState).toBe(WebSocket.OPEN);
    // The sleeping one was dropped: once it reads again it sees the end.
    const ended = new Promise<void>((resolve) => asleep.once('close', () => resolve()));
    asleep.resume();
    await ended;
    awake.ws.close();
  });
});
