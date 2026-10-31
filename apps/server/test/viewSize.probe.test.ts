// QF.52 probe: at a 40-session campaign (about 13k events) a player's view
// frame stays under 150 KB, and the server's work per command is at least
// halved against the old way (whole GM state and whole player views, each
// player view stringified twice).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { projectForGm, projectForPlayer, type CampaignState } from '@the-system/engine';
import { BIG_HEROES, bigCampaignLines } from '../../../scripts/big-campaign';
import { LiveHub } from '../src/hub';
import { CampaignStore } from '../src/store';

const EVENTS = 13_000;
const GM_KEY = 'k'.repeat(32);
const root = mkdtempSync(path.join(tmpdir(), 'the-system-viewsize-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
}

describe('QF.52 probe (13k events)', () => {
  it('player frames ≤ 150 KB and server work per command at least halved', () => {
    const dir = path.join(root, 'campaigns', 'long');
    mkdirSync(dir, { recursive: true });
    const lines = bigCampaignLines(EVENTS, { withNotes: true });
    writeFileSync(path.join(dir, 'events.jsonl'), `${lines.join('\n')}\n`);
    let ms = Date.UTC(2027, 0, 1);
    const now = () => new Date((ms += 1000)).toISOString();
    const store = CampaignStore.open('long', { dataDir: root, now });
    let n = 0;
    const hub = new LiveHub(store, { gmKey: GM_KEY, now, newId: () => `p${++n}` });

    const frames: { who: string; bytes: number; type: string }[] = [];
    const conns = [null, ...BIG_HEROES].map((who) => {
      const conn = hub.connect((message, raw) => {
        const text = raw ?? JSON.stringify(message);
        frames.push({ who: who ?? 'gm', bytes: Buffer.byteLength(text), type: message.type });
      });
      conn.receive(
        JSON.stringify(
          who === null
            ? { type: 'join', role: 'gm', gmKey: GM_KEY }
            : { type: 'join', role: 'player', characterId: who },
        ),
      );
      return conn;
    });
    const gm = conns[0] as (typeof conns)[number];
    let req = 0;
    const command = (c: object) =>
      gm.receive(JSON.stringify({ type: 'command', requestId: `r${++req}`, command: c }));
    // A mix the table makes: broadcasts (every view), practice, XP.
    const step = (i: number) =>
      command(
        i % 3 === 0
          ? { type: 'system.broadcast', text: `Probe ${i}`, characterIds: null }
          : i % 3 === 1
            ? {
                type: 'practice.log',
                characterId: 'ana',
                action: `probe ${i}`,
                skills: ['Basic Archery'],
              }
            : {
                type: 'xp.award',
                track: 'class',
                amount: 3,
                participants: [{ characterId: 'bo' }],
              },
      );

    // The old way, for the same state: what one command cost before QF.52.
    const oldWay = (state: CampaignState) => {
      JSON.stringify({ type: 'state', seq: 1, state: projectForGm(state) });
      for (const who of BIG_HEROES) {
        const view = projectForPlayer(state, who);
        JSON.stringify(view);
        JSON.stringify({ type: 'view', seq: 1, view });
      }
    };
    const fullPlayer = Buffer.byteLength(
      JSON.stringify(projectForPlayer(store.campaign.state as CampaignState, 'ana')),
    );

    const newTimes: number[] = [];
    const oldTimes: number[] = [];
    for (let i = 0; i < 60; i++) {
      const t0 = performance.now();
      step(i);
      newTimes.push(performance.now() - t0);
      const t1 = performance.now();
      oldWay(store.campaign.state as CampaignState);
      oldTimes.push(performance.now() - t1);
    }
    const playerFrames = frames.filter((f) => f.type === 'view');
    const maxPlayer = Math.max(...playerFrames.map((f) => f.bytes));
    const gmPatches = frames.filter((f) => f.type === 'statePatch');
    const gmFull = frames.find((f) => f.type === 'state')?.bytes ?? 0;
    const [newMs, oldMs] = [median(newTimes.slice(10)), median(oldTimes.slice(10))];
    console.log(
      `QF.52 probe: ${store.campaign.events.length} events; player view ${(fullPlayer / 1024).toFixed(0)} KB whole, ` +
        `largest sent ${(maxPlayer / 1024).toFixed(1)} KB; GM state ${(gmFull / 1024).toFixed(0)} KB, ` +
        `largest patch ${(Math.max(...gmPatches.map((f) => f.bytes)) / 1024).toFixed(1)} KB; ` +
        `per command ${newMs.toFixed(1)} ms now vs ${oldMs.toFixed(1)} ms before`,
    );
    expect(store.campaign.events.length).toBeGreaterThan(EVENTS);
    expect(maxPlayer).toBeLessThanOrEqual(150 * 1024);
    expect(gmPatches.length).toBeGreaterThan(0);
    expect(newMs).toBeLessThanOrEqual(oldMs / 2);
    store.close();
  }, 120_000);
});
