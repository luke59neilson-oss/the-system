// Session log autosave (M2.4): unit tests with a manual timer, and a scripted
// session against the real server writing on a short interval and on close.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute, type Command, type CommandContext } from '@the-system/engine';
import { startApp } from '../src/app';
import { LiveHub } from '../src/hub';
import { SESSION_LOG_INTERVAL_MS, SessionLogWriter, exportsDirFor } from '../src/sessionLog';
import { CampaignStore } from '../src/store';

const KEY = 'k'.repeat(32);
const CANARY_GM = 'CANARY-gm-only-note-41c';
const CANARY_JOURNAL = 'CANARY-unshared-journal-82e';
const dirs: string[] = [];
const tempDir = (name: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), `the-system-${name}-`));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const rules = () => JSON.parse(JSON.stringify(DEFAULT_RULES)) as unknown;
const kit = [
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic Stealth', rarity: 'inferior' },
  { name: 'Archer’s Eye', rarity: 'common' },
];

/** A clock that moves one second per call. */
function clock(start = Date.UTC(2026, 9, 22, 19)) {
  let tick = 0;
  return () => new Date(start + 1000 * tick++).toISOString();
}

/** Runs one command straight into the store (no hub). */
function apply(store: CampaignStore, command: Command, ctx: CommandContext) {
  const result = execute(store.campaign, command, ctx);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  store.appendAll(result.events);
}

describe('SessionLogWriter', () => {
  it('writes nothing for an empty sitting, then appears, grows, skips unchanged ticks and writes on close', () => {
    const dataDir = tempDir('log');
    const now = clock();
    const store = CampaignStore.open('main', { dataDir, now });
    let n = 0;
    const gm: CommandContext = {
      actor: { role: 'gm' },
      sessionId: null,
      now,
      newId: () => `e${++n}`,
    };
    apply(store, { type: 'campaign.create', name: 'Whale', rules: rules() }, gm);
    const timer: { tick: () => void } = { tick: () => undefined };
    let cancelled = false;
    let interval = 0;
    const writer = new SessionLogWriter(store, {
      exportsDir: exportsDirFor(dataDir),
      now,
      every: (fn, ms) => {
        timer.tick = fn;
        interval = ms;
        return () => {
          cancelled = true;
        };
      },
    });
    expect(interval).toBe(SESSION_LOG_INTERVAL_MS);
    expect(writer.file.startsWith(path.join(dataDir, 'exports', 'main', 'session-log-'))).toBe(
      true,
    );
    timer.tick();
    expect(existsSync(writer.file)).toBe(false); // The campaign creation predates the sitting.

    apply(
      store,
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
      gm,
    );
    timer.tick();
    expect(existsSync(writer.file)).toBe(true);
    const first = readFileSync(writer.file, 'utf8');
    expect(first).toContain('New character Jake');
    expect(first).not.toContain('XP');

    expect(writer.flush()).toBe(false); // Nothing changed since the last write.
    apply(
      store,
      {
        type: 'xp.award',
        track: 'class',
        amount: 300,
        participants: [{ characterId: 'jake' }],
        reason: 'Pale hunters',
      },
      gm,
    );
    timer.tick();
    const second = readFileSync(writer.file, 'utf8');
    expect(second.length).toBeGreaterThan(first.length);
    expect(second).toContain('300 class XP for Pale hunters');

    apply(store, { type: 'title.award', characterId: 'jake', title: 'Early Bird' }, gm);
    writer.close();
    expect(cancelled).toBe(true);
    expect(readFileSync(writer.file, 'utf8')).toContain('Jake earned the title Early Bird');
    // No temp files left behind.
    expect(readdirSync(path.dirname(writer.file))).toEqual([path.basename(writer.file)]);
    store.close();
  });

  it('reports a failed write without throwing from the timer or close', () => {
    const dataDir = tempDir('log-fail');
    const now = clock();
    const store = CampaignStore.open('main', { dataDir, now });
    const gm: CommandContext = { actor: { role: 'gm' }, sessionId: null, now, newId: () => 'c1' };
    // A plain file where the exports folder should be: every write fails.
    const blocked = path.join(dataDir, 'not-a-dir');
    writeFileSync(blocked, 'x');
    const errors: unknown[] = [];
    const timer: { tick: () => void } = { tick: () => undefined };
    const writer = new SessionLogWriter(store, {
      exportsDir: blocked,
      now,
      every: (fn) => {
        timer.tick = fn;
        return () => undefined;
      },
      onError: (error) => errors.push(error),
    });
    apply(store, { type: 'campaign.create', name: 'Whale', rules: rules() }, gm);
    expect(() => timer.tick()).not.toThrow();
    expect(() => writer.close()).not.toThrow();
    expect(errors).toHaveLength(2);
    expect(() => writer.flush()).toThrow();
    store.close();
  });
});

describe('SessionLogWriter edge cases', () => {
  it('leaves no temp file when the final rename fails, and follows an undo of a pre-sitting event', () => {
    const dataDir = tempDir('log-edge');
    const now = clock();
    const store = CampaignStore.open('main', { dataDir, now });
    let n = 0;
    const gm: CommandContext = {
      actor: { role: 'gm' },
      sessionId: null,
      now,
      newId: () => `e${++n}`,
    };
    apply(store, { type: 'campaign.create', name: 'Whale', rules: rules() }, gm);
    apply(
      store,
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
      gm,
    );
    apply(
      store,
      { type: 'xp.award', track: 'class', amount: 300, participants: [{ characterId: 'jake' }] },
      gm,
    );
    const earlier = store.campaign.events[store.campaign.events.length - 1]?.id ?? '';
    const writer = new SessionLogWriter(store, {
      exportsDir: exportsDirFor(dataDir),
      now,
      every: () => () => undefined,
    });
    apply(
      store,
      { type: 'xp.award', track: 'class', amount: 100, participants: [{ characterId: 'jake' }] },
      gm,
    );
    expect(writer.flush()).toBe(true);
    expect(readFileSync(writer.file, 'utf8')).toContain('Jake: class Archer 3 → 4');
    // Undo the pre-sitting award: the cached base must be refolded.
    apply(store, { type: 'event.undo', eventId: earlier }, gm);
    apply(
      store,
      { type: 'xp.award', track: 'class', amount: 100, participants: [{ characterId: 'jake' }] },
      gm,
    );
    expect(writer.flush()).toBe(true);
    const text = readFileSync(writer.file, 'utf8');
    expect(text).toContain('GM undid an earlier change');
    expect(text).toContain('Jake: class Archer 0 → 1');
    expect(text).toContain('Jake: class Archer 1 → 2');
    // A directory where the log file goes makes the rename fail: no temp file stays.
    rmSync(writer.file);
    mkdirSync(writer.file);
    apply(store, { type: 'title.award', characterId: 'jake', title: 'Blocked' }, gm);
    expect(() => writer.flush()).toThrow();
    expect(readdirSync(path.dirname(writer.file)).filter((f) => f.includes('.tmp-'))).toEqual([]);
    store.close();
  });
});

describe('session log during a scripted session (M2.4 acceptance)', () => {
  it('appears and grows while the GM and a player play, leaves out private notes, and is written on shutdown', async () => {
    const dataDir = tempDir('log-app');
    const webRoot = tempDir('log-web');
    writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
    const app = await startApp({
      port: 0,
      host: '127.0.0.1',
      webRoot,
      dataDir,
      gmKey: KEY,
      sessionLogIntervalMs: 40,
    });
    const logDir = path.join(app.exportsDir, 'main');
    const logFile = () => {
      const files = existsSync(logDir) ? readdirSync(logDir).filter((f) => f.endsWith('.md')) : [];
      return files.length === 1 && files[0] ? path.join(logDir, files[0]) : null;
    };
    const waitFor = async (check: () => boolean, what: string) => {
      const until = Date.now() + 5_000;
      while (!check()) {
        if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
        await new Promise((r) => setTimeout(r, 20));
      }
    };
    const clients: WebSocket[] = [];
    try {
      expect(app.exportsDir).toBe(path.join(path.resolve(dataDir), 'exports'));
      const connect = async (join: object) => {
        const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
        clients.push(ws);
        const results = new Map<string, { ok: boolean; error?: string }>();
        ws.addEventListener('message', (event) => {
          const m = JSON.parse(String(event.data)) as {
            type: string;
            requestId?: string;
            ok?: boolean;
          };
          if (m.type === 'result' && m.requestId) results.set(m.requestId, m as never);
        });
        await new Promise<void>((resolve, reject) => {
          ws.addEventListener('open', () => resolve());
          ws.addEventListener('error', () => reject(new Error('WebSocket error')));
        });
        ws.send(JSON.stringify({ type: 'join', ...join }));
        let r = 0;
        return async (command: Command) => {
          const requestId = `r${++r}`;
          ws.send(JSON.stringify({ type: 'command', requestId, command }));
          await waitFor(() => results.has(requestId), command.type);
          const result = results.get(requestId);
          if (!result?.ok) throw new Error(`${command.type}: ${result?.error}`);
        };
      };
      const gm = await connect({ role: 'gm', gmKey: KEY });
      await gm({ type: 'campaign.create', name: 'Whale', rules: rules() });
      await gm({
        type: 'character.create',
        id: 'jake',
        name: 'Jake',
        className: 'Archer',
        classSkills: kit,
      });
      await waitFor(() => logFile() !== null, 'the session log file');
      const file = logFile() ?? '';
      const size1 = statSync(file).size;

      const jake = await connect({ role: 'player', characterId: 'jake' });
      await gm({
        type: 'xp.award',
        track: 'class',
        amount: 300,
        participants: [{ characterId: 'jake' }],
        reason: 'Pale hunters',
      });
      await jake({
        type: 'practice.log',
        characterId: 'jake',
        action: 'Climbed the rib bones',
        stat: 'agility',
      });
      await jake({
        type: 'note.create',
        characterId: 'jake',
        kind: 'journal',
        title: 'Mine',
        body: CANARY_JOURNAL,
      });
      await jake({
        type: 'note.create',
        characterId: 'jake',
        kind: 'party',
        title: 'Loot list',
        body: 'Two pale hides',
      });
      await gm({
        type: 'note.create',
        characterId: null,
        kind: 'gm',
        title: 'Twist',
        body: CANARY_GM,
      });
      await gm({
        type: 'note.create',
        characterId: null,
        kind: 'gm',
        title: 'For Claude',
        body: 'Recap the eel',
        tags: ['export'],
      });
      await waitFor(() => readFileSync(file, 'utf8').includes('Recap the eel'), 'the log to grow');
      expect(statSync(file).size).toBeGreaterThan(size1);

      await gm({ type: 'title.award', characterId: 'jake', title: 'Last Word' });
      for (const ws of clients) ws.close();
      await app.close();
      // The shutdown write catches the last change even if no tick ran after it.
      const text = readFileSync(file, 'utf8');
      expect(text).toContain('Jake earned the title Last Word');
      expect(text).toContain('Jake: class Archer 0 → 3');
      expect(text).toContain('Climbed the rib bones');
      expect(text).toContain('Two pale hides');
      expect(text).not.toContain(CANARY_GM);
      expect(text).not.toContain(CANARY_JOURNAL);
      // The log is a copy: the campaign itself is untouched and reopens.
      const reopened = CampaignStore.open('main', { dataDir, now: clock() });
      expect(reopened.campaign.state?.characters['jake']?.titles).toEqual(['Last Word']);
      reopened.close();
    } finally {
      for (const ws of clients) ws.close();
      await app.close();
    }
  });

  it('keeps a log per hub-driven campaign without touching the event log', () => {
    // The writer reads the store; the hub writes it. Both share one store.
    const dataDir = tempDir('log-hub');
    const now = clock();
    const store = CampaignStore.open('main', { dataDir, now });
    let n = 0;
    const hub = new LiveHub(store, { gmKey: KEY, now, newId: () => `h${++n}` });
    const writer = new SessionLogWriter(store, {
      exportsDir: exportsDirFor(dataDir),
      now,
      every: () => () => undefined,
    });
    const results: string[] = [];
    const conn = hub.connect((m) => {
      if (m.type === 'result') results.push(m.ok ? 'ok' : `no: ${m.error}`);
    });
    conn.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey: KEY }));
    conn.receive(
      JSON.stringify({
        type: 'command',
        requestId: 'a',
        command: { type: 'campaign.create', name: 'W', rules: rules() },
      }),
    );
    conn.receive(
      JSON.stringify({
        type: 'command',
        requestId: 'b',
        command: {
          type: 'character.create',
          id: 'jake',
          name: 'Jake',
          className: 'Archer',
          classSkills: kit,
        },
      }),
    );
    conn.receive(
      JSON.stringify({
        type: 'command',
        requestId: 'c',
        command: { type: 'system.broadcast', text: 'Welcome' },
      }),
    );
    expect(results).toEqual(['ok', 'ok', 'ok']);
    const before = readFileSync(path.join(store.dir, 'events.jsonl'), 'utf8');
    writer.close();
    expect(readFileSync(writer.file, 'utf8')).toContain('System message to everyone: Welcome');
    expect(readFileSync(path.join(store.dir, 'events.jsonl'), 'utf8')).toBe(before);
    conn.close();
    store.close();
  });
});
