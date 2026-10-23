// Session log autosave (M2.4) following play sessions (M4.3): unit tests with
// a manual timer, and a scripted session against the real server writing on a
// short interval, at session end (report + backup) and on close.
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
import { connect } from 'node:net';
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
  it('writes nothing before a session, then appears, grows, skips unchanged ticks, writes on close and becomes the report', () => {
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
    expect(writer.file).toBeNull();
    apply(
      store,
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
      gm,
    );
    timer.tick();
    // Prep between sessions writes nothing.
    expect(existsSync(path.join(dataDir, 'exports'))).toBe(false);

    apply(store, { type: 'session.start' }, gm);
    const file = writer.file ?? '';
    expect(file).toBe(path.join(dataDir, 'exports', 'main', 'session-01.md'));
    timer.tick();
    const first = readFileSync(file, 'utf8');
    expect(first).toMatch(/^# Session 1 log \(running\): Whale$/m);
    expect(first).toContain('Session 1 started (day 1)');
    expect(first).not.toContain('New character Jake'); // Before the session.

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
    const second = readFileSync(file, 'utf8');
    expect(second.length).toBeGreaterThan(first.length);
    expect(second).toContain('300 class XP for Pale hunters');

    apply(store, { type: 'campaign.advanceDay', days: 2 }, gm);
    apply(store, { type: 'session.end' }, gm);
    expect(writer.flush()).toBe(true);
    const report = readFileSync(file, 'utf8');
    expect(report).toMatch(/^# Session 1 report: Whale$/m);
    expect(report).toContain('- In-game days: 1–3');
    // Between sessions the report stays as it was.
    apply(store, { type: 'title.award', characterId: 'jake', title: 'Early Bird' }, gm);
    expect(writer.flush()).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(report);

    apply(store, { type: 'session.start' }, gm);
    apply(store, { type: 'title.award', characterId: 'jake', title: 'Late Bird' }, gm);
    writer.close();
    expect(cancelled).toBe(true);
    const two = readFileSync(path.join(dataDir, 'exports', 'main', 'session-02.md'), 'utf8');
    expect(two).toContain('Jake earned the title Late Bird');
    expect(two).not.toContain('Early Bird');
    // No temp files left behind.
    expect(readdirSync(path.dirname(file)).sort()).toEqual(['session-01.md', 'session-02.md']);
    store.close();
  });

  it('reports a failed write without throwing from the timer or close', () => {
    const dataDir = tempDir('log-fail');
    const now = clock();
    const store = CampaignStore.open('main', { dataDir, now });
    let id = 0;
    const gm: CommandContext = {
      actor: { role: 'gm' },
      sessionId: null,
      now,
      newId: () => `c${++id}`,
    };
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
    apply(store, { type: 'session.start', sessionId: 's1' }, gm);
    expect(() => timer.tick()).not.toThrow();
    expect(() => writer.close()).not.toThrow();
    expect(errors).toHaveLength(2);
    expect(() => writer.flush()).toThrow();
    store.close();
  });
});

describe('SessionLogWriter edge cases', () => {
  it('follows undos of a session end (running again) and start (marked undone)', () => {
    const dataDir = tempDir('log-undo');
    const now = clock();
    const store = CampaignStore.open('main', { dataDir, now });
    let n = 0;
    const gm: CommandContext = {
      actor: { role: 'gm' },
      sessionId: null,
      now,
      newId: () => `u${++n}`,
    };
    apply(store, { type: 'campaign.create', name: 'Whale', rules: rules() }, gm);
    const writer = new SessionLogWriter(store, {
      exportsDir: exportsDirFor(dataDir),
      now,
      every: () => () => undefined,
    });
    apply(store, { type: 'session.start' }, gm);
    const startId = store.campaign.events.at(-1)?.id ?? '';
    apply(store, { type: 'session.end' }, gm);
    const endId = store.campaign.events.at(-1)?.id ?? '';
    const file = writer.file ?? '';
    expect(writer.flush()).toBe(true);
    expect(readFileSync(file, 'utf8')).toMatch(/^# Session 1 report/m);
    apply(store, { type: 'event.undo', eventId: endId }, gm);
    expect(writer.flush()).toBe(true);
    expect(readFileSync(file, 'utf8')).toMatch(/^# Session 1 log \(running\)/m);
    apply(store, { type: 'event.undo', eventId: startId }, gm);
    expect(writer.file).toBeNull();
    expect(writer.flush()).toBe(true);
    expect(readFileSync(file, 'utf8')).toMatch(/^# Session 1: undone/m);
    expect(writer.flush()).toBe(false);
    // A new session 1 takes the file over.
    apply(store, { type: 'session.start' }, gm);
    expect(writer.flush()).toBe(true);
    expect(readFileSync(file, 'utf8')).toMatch(/^# Session 1 log \(running\)/m);
    writer.close();
    store.close();
  });

  it('leaves no temp file when the final rename fails, and follows an undo of a pre-session event', () => {
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
    apply(store, { type: 'session.start' }, gm);
    apply(
      store,
      { type: 'xp.award', track: 'class', amount: 100, participants: [{ characterId: 'jake' }] },
      gm,
    );
    expect(writer.flush()).toBe(true);
    expect(readFileSync(writer.file ?? '', 'utf8')).toContain('Jake: class Archer 3 → 4');
    // Undo the pre-sitting award: the cached base must be refolded.
    apply(store, { type: 'event.undo', eventId: earlier }, gm);
    apply(
      store,
      { type: 'xp.award', track: 'class', amount: 100, participants: [{ characterId: 'jake' }] },
      gm,
    );
    expect(writer.flush()).toBe(true);
    const text = readFileSync(writer.file ?? '', 'utf8');
    expect(text).toContain('GM undid an earlier change');
    expect(text).toContain('Jake: class Archer 0 → 1');
    expect(text).toContain('Jake: class Archer 1 → 2');
    // A directory where the log file goes makes the rename fail: no temp file stays.
    const file = writer.file ?? '';
    rmSync(file);
    mkdirSync(file);
    apply(store, { type: 'title.award', characterId: 'jake', title: 'Blocked' }, gm);
    expect(() => writer.flush()).toThrow();
    expect(readdirSync(path.dirname(file)).filter((f) => f.includes('.tmp-'))).toEqual([]);
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
      await gm({ type: 'session.start' });
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

  it('writes the log and closes quickly even when a socket never answers the close handshake', async () => {
    const dataDir = tempDir('log-zombie');
    const webRoot = tempDir('log-zombie-web');
    writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
    const app = await startApp({ port: 0, host: '127.0.0.1', webRoot, dataDir, gmKey: KEY });
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
    const done = new Set<string>();
    ws.addEventListener('message', (event) => {
      const m = JSON.parse(String(event.data)) as { type: string; requestId?: string };
      if (m.type === 'result' && m.requestId) done.add(m.requestId);
    });
    await new Promise<void>((resolve) => ws.addEventListener('open', () => resolve()));
    ws.send(JSON.stringify({ type: 'join', role: 'gm', gmKey: KEY }));
    ws.send(
      JSON.stringify({
        type: 'command',
        requestId: 'a',
        command: { type: 'campaign.create', name: 'Z', rules: rules() },
      }),
    );
    ws.send(
      JSON.stringify({ type: 'command', requestId: 'b', command: { type: 'session.start' } }),
    );
    const until = Date.now() + 5000;
    while (!done.has('b') && Date.now() < until) await new Promise((r) => setTimeout(r, 10));
    ws.close();
    // A "sleeping phone": completes the upgrade, then never reads or answers again.
    const zombie = connect(app.port, '127.0.0.1');
    await new Promise<void>((resolve) => zombie.on('connect', () => resolve()));
    zombie.write(
      `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${app.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
    );
    await new Promise<void>((resolve) => zombie.once('data', () => resolve()));
    zombie.pause();
    const started = Date.now();
    try {
      await app.close();
      // What this guards is ws's 30 s close-handshake wait (QF.8): without the
      // terminate in preClose, close takes 30 s. 10 s leaves room for a loaded
      // machine and still tells the two apart.
      expect(Date.now() - started).toBeLessThan(10_000);
      const dir = path.join(app.exportsDir, 'main');
      expect(readdirSync(dir).filter((f) => f.endsWith('.md'))).toHaveLength(1);
      expect(existsSync(path.join(dataDir, 'campaigns', 'main', 'LOCK'))).toBe(false);
    } finally {
      zombie.destroy();
    }
  }, 20_000);

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
    conn.receive(
      JSON.stringify({ type: 'command', requestId: 'd', command: { type: 'session.start' } }),
    );
    conn.receive(
      JSON.stringify({
        type: 'command',
        requestId: 'e',
        command: { type: 'system.broadcast', text: 'Session begins' },
      }),
    );
    expect(results).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    const before = readFileSync(path.join(store.dir, 'events.jsonl'), 'utf8');
    writer.close();
    const text = readFileSync(writer.file ?? '', 'utf8');
    expect(text).toContain('System message to everyone: Session begins');
    expect(text).not.toContain('Welcome');
    expect(readFileSync(path.join(store.dir, 'events.jsonl'), 'utf8')).toBe(before);
    conn.close();
    store.close();
  });

  it('backs up and writes the report when the GM ends a session, keeps it on reopen, and warns when the backup fails', async () => {
    const dataDir = tempDir('log-end');
    const webRoot = tempDir('log-end-web');
    writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
    const start = () => startApp({ port: 0, host: '127.0.0.1', webRoot, dataDir, gmKey: KEY });
    const session = async (port: number) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const results = new Map<string, { ok: boolean; error?: string; warning?: string }>();
      ws.addEventListener('message', (event) => {
        const m = JSON.parse(String(event.data)) as { type: string; requestId?: string };
        if (m.type === 'result' && m.requestId) results.set(m.requestId, m as never);
      });
      await new Promise<void>((resolve) => ws.addEventListener('open', () => resolve()));
      ws.send(JSON.stringify({ type: 'join', role: 'gm', gmKey: KEY }));
      let r = 0;
      const send = async (command: Command) => {
        const requestId = `r${++r}`;
        ws.send(JSON.stringify({ type: 'command', requestId, command }));
        const until = Date.now() + 5000;
        while (!results.has(requestId)) {
          if (Date.now() > until) throw new Error(`timed out on ${command.type}`);
          await new Promise((res) => setTimeout(res, 10));
        }
        const result = results.get(requestId);
        if (!result?.ok) throw new Error(`${command.type}: ${result?.error}`);
        return result;
      };
      return { ws, send };
    };
    let app = await start();
    const report = path.join(app.exportsDir, 'main', 'session-01.md');
    const backups = path.join(dataDir, 'campaigns', 'main', 'backups');
    try {
      const gm = await session(app.port);
      await gm.send({ type: 'campaign.create', name: 'Whale', rules: rules() });
      await gm.send({
        type: 'character.create',
        id: 'jake',
        name: 'Jake',
        className: 'Archer',
        classSkills: kit,
      });
      await gm.send({ type: 'session.start' });
      await gm.send({ type: 'system.broadcast', text: 'Into the canyons' });
      await gm.send({ type: 'campaign.advanceDay' });
      const ended = await gm.send({ type: 'session.end' });
      expect(ended.warning).toBeUndefined();
      // Written at once, not on the next tick.
      const text = readFileSync(report, 'utf8');
      expect(text).toMatch(/^# Session 1 report: Whale$/m);
      expect(text).toContain('Into the canyons');
      expect(text).toContain('- In-game days: 1–2');
      const [backup] = readdirSync(backups);
      expect(backup).toMatch(/-session-1-end$/);
      const copied = readFileSync(path.join(backups, backup ?? '', 'events.jsonl'), 'utf8');
      expect(copied).toContain('session.ended');
      gm.ws.close();
      await app.close();

      // Reopening does not rewrite the finished report.
      const mtime = statSync(report).mtimeMs;
      app = await start();
      await app.close();
      expect(statSync(report).mtimeMs).toBe(mtime);

      // A plain file where the backups folder goes: the end is saved, the GM is warned.
      app = await start();
      rmSync(backups, { recursive: true });
      writeFileSync(backups, 'x');
      const again = await session(app.port);
      await again.send({ type: 'session.start' });
      const warned = await again.send({ type: 'session.end' });
      expect(warned.warning).toMatch(/the backup could not be saved/);
      const second = path.join(app.exportsDir, 'main', 'session-02.md');
      expect(readFileSync(second, 'utf8')).toMatch(/^# Session 2 report/m);
      // Undoing the end rewrites the file at once, not on the next tick.
      const exported = (await (
        await fetch(`http://127.0.0.1:${app.port}/api/gm/export`, { headers: { 'x-gm-key': KEY } })
      ).json()) as { events: { id: string; type: string }[] };
      const endId = exported.events.filter((e) => e.type === 'session.ended').at(-1)?.id ?? '';
      await again.send({ type: 'event.undo', eventId: endId });
      expect(readFileSync(second, 'utf8')).toMatch(/^# Session 2 log \(running\)/m);
      await again.send({ type: 'session.end' });

      again.ws.close();
    } finally {
      await app.close();
    }
    rmSync(backups, { force: true });
    const reopened = CampaignStore.open('main', { dataDir, now: clock() });
    expect(reopened.campaign.state?.sessions.map((x) => x.endedAt !== null)).toEqual([true, true]);
    reopened.close();
  });
});
