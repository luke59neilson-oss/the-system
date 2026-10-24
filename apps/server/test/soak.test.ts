// M11.1 soak: 1 GM + 4 player clients over real
// WebSockets, 2,000 random valid commands from a fixed seed; no desync (each
// player's last state equals the server's projection for that player), no
// crash, heap growth < 20% after warm-up.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, projectForGm, projectForPlayer, type PlayerView } from '@the-system/engine';
import { newGmKey } from '../src/security';
import { createServer } from '../src/server';
import { CampaignStore } from '../src/store';

export const SOAK_SEED = 0x5eed_1101;
export const SOAK_STEPS = Number(process.env['SOAK_STEPS'] ?? 2_000);
/** Steps before the heap baseline is taken (JIT, caches and pools settle). */
export const SOAK_WARMUP = Math.floor(SOAK_STEPS / 4);

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
  /** Messages not yet consumed; drained after each command so a long soak keeps no history. */
  private inbox: Record<string, unknown>[] = [];
  /** The latest player view or GM state, kept for the desync check. */
  lastView: unknown = undefined;
  lastState: unknown = undefined;
  /** The first `error` frame the server sent; it fails every wait. */
  serverError: string | null = null;
  /** Set when a frame carried `canary` (GM-only text that must never reach a player). */
  leaked = false;
  private readonly ws: WebSocket;
  private waiters: {
    test: (m: Record<string, unknown>) => boolean;
    done: (m: Record<string, unknown>) => void;
    reject: (e: Error) => void;
  }[] = [];

  constructor(
    url: string,
    private readonly canary: string | null = null,
  ) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', (event) => {
      // Parsed once on arrival: re-parsing every frame per wait made the
      // first draft of this test quadratic.
      const text = String(event.data);
      if (this.canary !== null && text.includes(this.canary)) this.leaked = true;
      const message = JSON.parse(text) as Record<string, unknown>;
      if (message.type === 'view') this.lastView = message['view'];
      if (message.type === 'state') this.lastState = message['state'];
      if (message.type === 'error') {
        this.serverError ??= JSON.stringify(message);
        const error = new Error(`server error frame: ${this.serverError}`);
        for (const w of this.waiters) w.reject(error);
        this.waiters = [];
        return;
      }
      this.inbox.push(message);
      this.waiters = this.waiters.filter((w) => {
        if (!w.test(message)) return true;
        w.done(message);
        return false;
      });
    });
  }

  /** Resolves with the first message (already received or future) matching `test`. */
  waitFor(
    test: (m: Record<string, unknown>) => boolean,
    ms = 5000,
  ): Promise<Record<string, unknown>> {
    if (this.serverError !== null) {
      return Promise.reject(new Error(`server error frame: ${this.serverError}`));
    }
    const seen = this.inbox.find(test);
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for a message')), ms);
      this.waiters.push({
        test,
        done: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
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
    this.inbox = [];
    this.send({ type: 'command', requestId, command });
    const result = await this.waitFor((m) => m.type === 'result' && m.requestId === requestId);
    this.inbox = [];
    return result;
  }

  drain(): void {
    this.inbox = [];
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.CLOSED) return resolve();
      this.ws.addEventListener('close', () => resolve());
      this.ws.close();
    });
  }
}

/** A full garbage collection, so heap readings compare live data only. */
const gc: () => void = (() => {
  setFlagsFromString('--expose-gc');
  return runInNewContext('gc') as () => void;
})();

/**
 * Waits until a client's latest frame equals the server's projection (frames
 * are in flight after the actor's result arrives). Throws with `label` after `ms`.
 */
async function settled(read: () => unknown, want: string, label: string, ms = 10_000) {
  const until = Date.now() + ms;
  while (JSON.stringify(read()) !== want) {
    if (Date.now() > until) throw new Error(`desync: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

function liveHeap(): number {
  gc();
  gc();
  return process.memoryUsage().heapUsed;
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

  /** Every socket the test opened, closed even when the test fails. */
  const clients: Client[] = [];

  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await app.close();
    store.close();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(webDir, { recursive: true, force: true });
  });

  it(`runs ${SOAK_STEPS} random valid commands (seed ${SOAK_SEED}) with no desync`, async () => {
    const random = rng(SOAK_SEED);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
    const gm = await new Client(`ws://${base}/ws`).open();
    clients.push(gm);
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
    // A GM-only note: no player frame may ever carry its text.
    const canary = 'CANARY-gm-only-7f3a';
    const secret = await gm.command({
      type: 'note.create',
      characterId: null,
      kind: 'gm',
      title: 'GM secret',
      body: canary,
    });
    expect(secret.ok, JSON.stringify(secret)).toBe(true);
    const players = await Promise.all(
      heroes.map(async (id) => {
        const c = await new Client(`ws://${base}/ws`, canary).open();
        c.send({ type: 'join', role: 'player', characterId: id });
        await c.waitFor((m) => m.type === 'view');
        clients.push(c);
        return { id, client: c };
      }),
    );
    const stats = DEFAULT_RULES.stats.list.map((s) => s.id);
    const counts: Record<string, number> = {};
    let heapAtWarmup = 0;
    for (let step = 0; step < SOAK_STEPS; step++) {
      if (step === SOAK_WARMUP) heapAtWarmup = liveHeap();
      const roll = random();
      const player = pick(players);
      const view = player.client.lastView as PlayerView | undefined;
      const open = view?.me.freePointBatches.find((b) => b.allocation === null && !b.locked);
      const assigned = view?.me.freePointBatches.find((b) => b.allocation !== null);
      let actor: Client = gm;
      let command: Record<string, unknown>;
      if (roll < 0.45) {
        command = {
          type: 'xp.award',
          track: 'class',
          amount: 1 + Math.floor(random() * 40),
          participants: heroes
            .filter((id, i) => i === 0 || random() < 0.6)
            .map((characterId) => ({ characterId })),
          reason: `soak step ${step}`,
        };
      } else if (roll < 0.55) {
        command = { type: 'character.rename', characterId: pick(heroes), name: `Hero ${step}` };
      } else if (roll < 0.6) {
        command = { type: 'system.broadcast', text: `Soak notice ${step}`, characterIds: null };
      } else if (roll < 0.63 && assigned) {
        // The GM unassigns a spent batch (it unlocks), so players spend again.
        command = {
          type: 'freePoints.override',
          characterId: player.id,
          raceLevel: assigned.raceLevel,
          allocation: null,
        };
      } else if (roll < 0.75 && open) {
        // A player spends an open batch of free points, all on random stats.
        const allocation: Record<string, number> = {};
        for (let k = 0; k < open.points; k++) {
          const stat = pick(stats);
          allocation[stat] = (allocation[stat] ?? 0) + 1;
        }
        actor = player.client;
        command = {
          type: 'freePoints.assign',
          characterId: player.id,
          raceLevel: open.raceLevel,
          allocation,
        };
      } else if (roll < 0.85) {
        actor = player.client;
        command = {
          type: 'practice.log',
          characterId: player.id,
          action: `practised at step ${step}`,
          skills: [`${player.id} skill ${pick(['a', 'b', 'c'])}`],
        };
      } else if (roll < 0.93) {
        actor = player.client;
        command = {
          type: 'note.create',
          characterId: player.id,
          kind: pick(['journal', 'party'] as const),
          title: `Note ${step}`,
          body: `Written at soak step ${step}.`,
        };
      } else {
        // A valid nickname change: clearing only a nickname that is set.
        const skill = `${player.id} skill ${pick(['a', 'b', 'c'])}`;
        const current = view?.me.skills.find((s) => s.name === skill)?.nickname ?? null;
        actor = player.client;
        command = {
          type: 'skill.nickname',
          characterId: player.id,
          skill,
          nickname: current !== null && random() < 0.3 ? null : `Nick ${step}`,
        };
      }
      const result = await actor.command(command);
      expect(result.ok, `seed ${SOAK_SEED} step ${step}: ${JSON.stringify(result)}`).toBe(true);
      counts[String(command['type'])] = (counts[String(command['type'])] ?? 0) + 1;
      for (const p of players) p.client.drain();
      gm.drain();
      // No desync at any step: once the frames for this command land, every
      // client holds the server's projection for it. The next command is then
      // built from an up-to-date view, so it is valid by construction.
      const now = store.campaign.state;
      if (!now) throw new Error('no campaign');
      for (const p of players) {
        await settled(
          () => p.client.lastView,
          JSON.stringify(projectForPlayer(now, p.id)),
          `seed ${SOAK_SEED} step ${step}: ${p.id}'s view`,
        );
      }
      await settled(
        () => gm.lastState,
        JSON.stringify(projectForGm(now)),
        `seed ${SOAK_SEED} step ${step}: the GM's state`,
      );
    }
    console.log(`soak seed ${SOAK_SEED}: ${JSON.stringify(counts)}`);
    // Every kind of command ran, players' as well as the GM's.
    for (const type of [
      'xp.award',
      'character.rename',
      'system.broadcast',
      'freePoints.assign',
      'freePoints.override',
      'practice.log',
      'note.create',
      'skill.nickname',
    ]) {
      expect(counts[type] ?? 0, `seed ${SOAK_SEED}: no ${type} ran`).toBeGreaterThan(0);
    }
    expect(store.campaign.events.length).toBeGreaterThan(SOAK_STEPS);
    // The desync checks compared each player's view and the GM's state with
    // the server's projection (GM: private journals left out, M1.8) after every
    // step; the GM-only note never reached a player.
    for (const p of players) expect(p.client.leaked, `${p.id} received GM-only text`).toBe(false);
    // Heap growth after warm-up stays under 20% (live objects, after a full GC).
    const heapAtEnd = liveHeap();
    const growth = (heapAtEnd - heapAtWarmup) / heapAtWarmup;
    console.log(
      `soak heap: ${(heapAtWarmup / 2 ** 20).toFixed(1)} MiB at step ${SOAK_WARMUP}, ` +
        `${(heapAtEnd / 2 ** 20).toFixed(1)} MiB at the end (${(growth * 100).toFixed(1)}%)`,
    );
    expect(growth).toBeLessThan(0.2);
  }, 120_000);
});
