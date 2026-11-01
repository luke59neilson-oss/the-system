// QF.55 probe: GM console main-thread time per command on a long campaign.
// Usage (after `npm run build`): npx tsx scripts/gm-probe.ts [sessions] [commands]
// Loads a campaign of `sessions` sessions (400 events each, with notes), opens
// the GM console on each tab in turn, sends GM commands from the page's own
// origin and reads Chromium's TaskDuration (CDP Performance.getMetrics)
// before and after. Prints one JSON line per tab. Not part of CI: absolute
// numbers depend on the machine; compare runs on the same box.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { startBuiltServer } from '../e2e/helpers/server';
import { bigCampaignLines } from './big-campaign';

const sessions = Number(process.argv[2] ?? 40);
const commands = Number(process.argv[3] ?? 20);
const GM_KEY = 'probe-gm-key-0123456789abcdef0123456789';
const exe = '/opt/pw-browsers/chromium';

const dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-gm-probe-'));
const dir = path.join(dataDir, 'campaigns', 'main');
mkdirSync(dir, { recursive: true });
writeFileSync(
  path.join(dir, 'events.jsonl'),
  `${bigCampaignLines(sessions * 400, { withNotes: true, sessions }).join('\n')}\n`,
);
const server = await startBuiltServer({ GM_KEY }, { dataDir });
const browser = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
try {
  for (const tab of ['home', 'session', 'progression', 'evolutions', 'library']) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.addInitScript(`localStorage.setItem('the-system.gm.tab', ${JSON.stringify(tab)})`);
    await page.goto(`${server.url}/gm#key=${GM_KEY}`);
    await page.getByRole('tab', { selected: true }).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const task = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics');
      return metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0;
    };
    const before = await task();
    await sendCommands(server.url, commands);
    await page.waitForTimeout(1000);
    const ms = ((await task()) - before) * 1000;
    console.log(
      JSON.stringify({ sessions, tab, commands, msPerCommand: Math.round(ms / commands) }),
    );
    await page.close();
  }
} finally {
  await browser.close();
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
}

/** GM commands over the server's own socket (Node, so the page measures only the console). */
async function sendCommands(url: string, n: number): Promise<void> {
  const ws = new WebSocket(`${url.replace(/^http/, 'ws')}/ws`);
  const pending = new Map<string, () => void>();
  await new Promise<void>((joined, failed) => {
    ws.onerror = failed;
    ws.onmessage = (e: MessageEvent) => {
      const m = JSON.parse(String(e.data)) as { type: string; requestId?: string };
      if (m.type === 'hello')
        ws.send(JSON.stringify({ type: 'join', role: 'gm', gmKey: GM_KEY, lastSeq: 0 }));
      if (m.type === 'joined') joined();
      if (m.type === 'result' && m.requestId) pending.get(m.requestId)?.();
    };
  });
  for (let i = 0; i < n; i++) {
    const requestId = `probe-${i}`;
    await new Promise<void>((done) => {
      pending.set(requestId, done);
      ws.send(
        JSON.stringify({ type: 'command', requestId, command: { type: 'campaign.advanceDay' } }),
      );
    });
    await new Promise((r) => setTimeout(r, 150));
  }
  ws.close();
}
