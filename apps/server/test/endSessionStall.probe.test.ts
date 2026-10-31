// QF.54 probe: at a 40-session campaign (about 13k events) ending a session
// through the real server blocks the event loop for under 300 ms at a time:
// the backup and the session report run off the request path, in their own
// turns, the report reuses the state the session started from (no fold of
// the whole campaign), and the GM still gets the result (with any warning)
// once they finish.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BIG_HEROES, bigCampaignLines } from '../../../scripts/big-campaign';
import { startApp } from '../src/app';

const KEY = 'k'.repeat(32);
const root = mkdtempSync(path.join(tmpdir(), 'the-system-endstall-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('QF.54 probe: End session at 40 sessions', () => {
  it(
    'no single block over 300 ms; backup and report still written',
    { timeout: 120_000 },
    async () => {
      const dataDir = path.join(root, 'data');
      const dir = path.join(dataDir, 'campaigns', 'main');
      mkdirSync(dir, { recursive: true });
      // 39 sessions on disk, the last still running.
      const lines = bigCampaignLines(12_700, { sessions: 39 });
      writeFileSync(path.join(dir, 'events.jsonl'), `${lines.join('\n')}\n`);
      const webRoot = path.join(root, 'web');
      mkdirSync(webRoot);
      writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
      const app = await startApp({ port: 0, host: '127.0.0.1', webRoot, dataDir, gmKey: KEY });
      try {
        const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
        const results = new Map<string, { ok: boolean; error?: string; warning?: string }>();
        ws.addEventListener('message', (event) => {
          const m = JSON.parse(String(event.data)) as { type: string; requestId?: string };
          if (m.type === 'result' && m.requestId) results.set(m.requestId, m as never);
        });
        await new Promise<void>((resolve) => ws.addEventListener('open', () => resolve()));
        ws.send(JSON.stringify({ type: 'join', role: 'gm', gmKey: KEY }));
        let r = 0;
        const send = async (command: object) => {
          const requestId = `r${++r}`;
          ws.send(JSON.stringify({ type: 'command', requestId, command }));
          const until = Date.now() + 20_000;
          while (!results.has(requestId) && Date.now() < until) {
            await new Promise((resolve) => setTimeout(resolve, 2));
          }
          return results.get(requestId);
        };
        // Session 39 (loaded from disk) ends; session 40 is played live.
        expect(await send({ type: 'session.end' })).toMatchObject({ ok: true });
        expect(await send({ type: 'session.start' })).toMatchObject({ ok: true });
        for (let i = 0; i < 300; i++) {
          const who = BIG_HEROES[i % BIG_HEROES.length];
          const step =
            i % 3 === 0
              ? {
                  type: 'xp.award',
                  track: 'class',
                  amount: 7,
                  participants: [{ characterId: who }],
                }
              : i % 3 === 1
                ? {
                    type: 'practice.log',
                    characterId: who,
                    action: `live ${i}`,
                    skills: ['Basic Archery'],
                  }
                : { type: 'system.broadcast', text: `Live ${i}`, characterIds: null };
          expect(await send(step)).toMatchObject({ ok: true });
        }
        // The longest gap between ticks of a 1 ms timer is the longest block.
        let last = performance.now();
        let blockMs = 0;
        const ticker = setInterval(() => {
          const t = performance.now();
          blockMs = Math.max(blockMs, t - last);
          last = t;
        }, 1);
        const result = await send({ type: 'session.end' });
        await new Promise((resolve) => setTimeout(resolve, 20));
        clearInterval(ticker);
        expect(result).toMatchObject({ ok: true });
        expect(result?.warning).toBeUndefined();
        expect(blockMs, `longest event-loop block ${blockMs.toFixed(0)} ms`).toBeLessThan(300);
        expect(existsSync(path.join(app.exportsDir, 'main', 'session-40.md'))).toBe(true);
        const backups = readdirSync(path.join(dir, 'backups'));
        expect(backups.some((n) => n.endsWith('-session-40-end'))).toBe(true);
        ws.close();
      } finally {
        await app.close();
      }
    },
  );
});
