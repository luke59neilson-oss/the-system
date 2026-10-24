// M11.1 soak (work in progress): 1 GM + 4 player clients over real
// WebSockets, 2,000 random valid commands from a fixed seed; no desync (each
// player's last state equals the server's projection for that player), no
// crash, heap growth < 20% after warm-up.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, projectForPlayer } from '@the-system/engine';
import { newGmKey } from '../src/security';
import { createServer } from '../src/server';
import { CampaignStore } from '../src/store';

export const SOAK_SEED = 0x5eed_1101;
export const SOAK_STEPS = Number(process.env['SOAK_STEPS'] ?? 2_000);

/** mulberry32: small, fixed-seed RNG for the command stream. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

describe('M11.1 soak', () => {
  let dataDir: string;
  let webDir: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  let base: string;
  const gmKey = newGmKey();
  let ids = 0;

  beforeAll(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-soak-'));
    webDir = mkdtempSync(path.join(tmpdir(), 'the-system-soak-web-'));
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
  });

  afterAll(async () => {
    await app.close();
    store.close();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(webDir, { recursive: true, force: true });
  });

  it(`runs ${SOAK_STEPS} random valid commands (seed ${SOAK_SEED}) with no desync`, async () => {
    const random = rng(SOAK_SEED);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
    const gm = await new Client(`ws://${base}/ws`).open();
    gm.send({ type: 'join', role: 'gm', gmKey });
    await gm.waitFor((m) => m.type === 'joined' && m.role === 'gm');
    const rules = JSON.parse(JSON.stringify(DEFAULT_RULES)) as unknown;
    expect((await gm.command({ type: 'campaign.create', name: 'Soak', rules })).ok).toBe(true);
    const heroes = ['ana', 'bo', 'cy', 'di'] as const;
    for (const id of heroes) {
      const created = await gm.command({
        type: 'character.create',
        id,
        name: id,
        className: 'Archer',
        classSkills: [
          { name: `${id} skill a`, rarity: 'inferior' },
          { name: `${id} skill b`, rarity: 'inferior' },
          { name: `${id} skill c`, rarity: 'common' },
        ],
      });
      expect(created.ok, JSON.stringify(created)).toBe(true);
    }
    const players = await Promise.all(
      heroes.map(async (id) => {
        const c = await new Client(`ws://${base}/ws`).open();
        c.send({ type: 'join', role: 'player', characterId: id });
        await c.waitFor((m) => m.type === 'view');
        return { id, client: c };
      }),
    );
    for (let step = 0; step < SOAK_STEPS; step++) {
      const roll = random();
      const command =
        roll < 0.7
          ? {
              type: 'xp.award',
              track: 'class',
              amount: 1 + Math.floor(random() * 300),
              participants: heroes
                .filter((id, i) => i === 0 || random() < 0.6)
                .map((characterId) => ({ characterId })),
              reason: `soak step ${step}`,
            }
          : { type: 'character.rename', characterId: pick(heroes), name: `Hero ${step}` };
      const result = await gm.command(command);
      expect(result.ok, `seed ${SOAK_SEED} step ${step}: ${JSON.stringify(result)}`).toBe(true);
    }
    // No desync: every player's latest view is the server's projection for them.
    const state = store.campaign.state;
    if (!state) throw new Error('no campaign');
    for (const { id, client } of players) {
      const want = JSON.stringify(projectForPlayer(state, id));
      await expect
        .poll(() => {
          const views = client.messages().filter((m) => m.type === 'view');
          return JSON.stringify(views[views.length - 1]?.['view']);
        })
        .toBe(want);
    }
    await Promise.all([gm.close(), ...players.map((p) => p.client.close())]);
  }, 120_000);
});
