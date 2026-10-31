import { createHash } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  readdirSync,
  writeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  fsyncSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  EventRejectedError,
  execute,
  replay,
  type Command,
  type CommandContext,
} from '@the-system/engine';
import {
  CampaignStore,
  StoreError,
  checkCampaignId,
  importCampaign,
  parseLogText,
  type CampaignExport,
  type StoreOptions,
} from '../src/store';
import { portraitFile, savePortrait } from '../src/portraits';
import { PORTRAIT_MAX_BYTES } from '../src/portraitFormat';

let dataDir: string;
let options: StoreOptions;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-store-'));
  let clock = 0;
  options = {
    dataDir,
    now: () => new Date(Date.UTC(2026, 9, 21, 18) + 1000 * clock++).toISOString(),
    snapshotEvery: 1000,
  };
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const kit = [
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic Stealth', rarity: 'inferior' },
  { name: 'Archer’s Eye', rarity: 'common' },
];

function context(prefix = 'ev'): CommandContext {
  let tick = 0;
  let id = 0;
  return {
    actor: { role: 'gm' },
    sessionId: 's1',
    now: () => new Date(Date.UTC(2026, 9, 21, 12) + 1000 * tick++).toISOString(),
    newId: () => `${prefix}${++id}`,
  };
}

const script: Command[] = [
  { type: 'campaign.create', name: 'Whale', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'casper', name: 'Casper', className: 'Mage', classSkills: kit },
  {
    type: 'xp.award',
    track: 'class',
    amount: 500,
    participants: [{ characterId: 'jake' }, { characterId: 'casper' }],
  },
  { type: 'character.setPools', characterId: 'jake', pools: { hp: 40 } },
  { type: 'event.undo', eventId: 'ev5' },
  {
    type: 'freePoints.assign',
    characterId: 'jake',
    raceLevel: 1,
    allocation: { strength: 2 },
  },
];

/** Runs commands through the store, as the server will. */
function play(store: CampaignStore, commands: Command[], ctx = context()) {
  for (const command of commands) {
    const result = execute(store.campaign, command, ctx);
    if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
    store.appendAll(result.events);
  }
  return store.campaign;
}

/** Reopen after the owning process "died" (its lock is stale). */
const afterCrash = () => ({ ...options, isAlive: () => false });

const logFile = (id = 'main') => path.join(dataDir, 'campaigns', id, 'events.jsonl');

describe('CampaignStore', () => {
  it('keeps state across a restart (from the snapshot)', () => {
    const store = CampaignStore.open('main', options);
    expect(store.campaign.state).toBeNull();
    const before = play(store, script);
    expect(before.state?.characters.jake?.classLevel).toBeGreaterThan(0);
    store.close();
    const reopened = CampaignStore.open('main', options);
    expect(reopened.loadedFromSnapshot).toBe(true);
    expect(reopened.campaign).toEqual(before);
    reopened.close();
  });

  it('keeps state across a crash (no close): snapshot plus tail, or full replay', () => {
    const store = CampaignStore.open('main', { ...options, snapshotEvery: 3 });
    const before = play(store, script);
    // No close(): the process "dies" with events after the last snapshot.
    expect(() => CampaignStore.open('main', options)).toThrow(/already open/);
    const reopened = CampaignStore.open('main', afterCrash());
    expect(reopened.loadedFromSnapshot).toBe(true);
    expect(reopened.campaign).toEqual(before);
    rmSync(path.join(dataDir, 'campaigns', 'main', 'snapshot.json'));
    const replayed = CampaignStore.open('main', afterCrash());
    expect(replayed.loadedFromSnapshot).toBe(false);
    expect(replayed.campaign).toEqual(before);
    for (const s of [store, reopened, replayed]) s.close();
  });

  it('ignores a snapshot that does not match the log, or is damaged', () => {
    const store = CampaignStore.open('main', options);
    const before = play(store, script);
    store.close();
    const file = path.join(dataDir, 'campaigns', 'main', 'snapshot.json');
    const snap = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    for (const bad of [
      { ...snap, lastEventId: 'other' },
      { ...snap, eventCount: 999 },
      { ...snap, format: 0 },
      { ...snap, stateSchemaVersion: 1 },
      { ...snap, eventVersions: {} },
      { ...snap, undone: {} },
    ]) {
      writeFileSync(file, JSON.stringify(bad));
      const s = CampaignStore.open('main', options);
      expect(s.loadedFromSnapshot).toBe(false);
      expect(s.campaign).toEqual(before);
      s.close();
    }
    writeFileSync(file, '{not json');
    const s = CampaignStore.open('main', options);
    expect(s.loadedFromSnapshot).toBe(false);
    expect(s.campaign).toEqual(before);
    s.close();
  });

  it('cuts a torn last line and keeps working', () => {
    const store = CampaignStore.open('main', options);
    const before = play(store, script);
    const torn = '{"id":"ev99","type":"character.ren';
    appendFileSync(logFile(), torn);
    const reopened = CampaignStore.open('main', afterCrash());
    expect(reopened.tornCopy).not.toBeNull();
    // The torn bytes are kept beside the log, never just deleted.
    expect(readFileSync(reopened.tornCopy ?? '', 'utf8')).toBe(torn);
    expect(reopened.campaign).toEqual(before);
    expect(readFileSync(logFile(), 'utf8').endsWith('}\n')).toBe(true);
    play(
      reopened,
      [{ type: 'character.rename', characterId: 'jake', name: 'Jake T.' }],
      context('r'),
    );
    reopened.close();
    const again = CampaignStore.open('main', options);
    expect(again.tornCopy).toBeNull();
    expect(again.campaign.state?.characters.jake?.name).toBe('Jake T.');
    for (const s of [store, reopened, again]) s.close();
  });

  it('keeps a complete last event whose newline was lost', () => {
    const store = CampaignStore.open('main', options);
    const before = play(store, script);
    const text = readFileSync(logFile(), 'utf8');
    writeFileSync(logFile(), text.slice(0, -1));
    const reopened = CampaignStore.open('main', afterCrash());
    expect(reopened.tornCopy).not.toBeNull();
    expect(reopened.campaign).toEqual(before);
    expect(readFileSync(logFile(), 'utf8')).toBe(text);
    store.close();
    reopened.close();
  });

  it('refuses a log damaged before its last line', () => {
    const store = CampaignStore.open('main', options);
    play(store, script);
    store.close();
    const lines = readFileSync(logFile(), 'utf8').split('\n');
    lines[2] = '{"broken":';
    writeFileSync(logFile(), lines.join('\n'));
    expect(() => CampaignStore.open('main', options)).toThrow(/line 3 is damaged/);
  });

  it('writes nothing when an event is rejected', () => {
    const store = CampaignStore.open('main', options);
    const before = play(store, script);
    const size = readFileSync(logFile(), 'utf8').length;
    const bad = { ...before.events[1], id: 'dup-of-create' } as (typeof before.events)[number];
    expect(() => store.append(bad)).toThrow(EventRejectedError);
    expect(readFileSync(logFile(), 'utf8').length).toBe(size);
    expect(store.campaign).toEqual(before);
    store.close();
  });

  it('appends a command atomically: one rejected event writes none of them', () => {
    const store = CampaignStore.open('main', options);
    const before = play(store, script);
    const size = readFileSync(logFile(), 'utf8').length;
    const ctx = context('a');
    const ok = execute(before, { type: 'character.rename', characterId: 'jake', name: 'J' }, ctx);
    if (!ok.ok) throw new Error(ok.error);
    const dup = { ...before.events[1], id: 'dup' } as (typeof before.events)[number];
    expect(() => store.appendAll([...ok.events, dup])).toThrow(EventRejectedError);
    expect(readFileSync(logFile(), 'utf8').length).toBe(size);
    expect(store.campaign).toEqual(before);
    store.close();
  });

  it('lets one process write a campaign at a time', () => {
    const store = CampaignStore.open('main', options);
    expect(() => CampaignStore.open('main', options)).toThrow(/already open/);
    store.close();
    const again = CampaignStore.open('main', options);
    // A stale lock (owner gone) is taken over; the presumed-dead store then
    // closes without touching the snapshot or the new owner's lock.
    const takeover = CampaignStore.open('main', afterCrash());
    again.close();
    expect(existsSync(path.join(takeover.dir, 'LOCK'))).toBe(true);
    takeover.close();
    expect(existsSync(path.join(takeover.dir, 'LOCK'))).toBe(false);
  });

  it('refuses a lock from another computer, and takes over one from before a reboot', () => {
    const dir = CampaignStore.open('main', options).dir;
    const lock = path.join(dir, 'LOCK');
    const info = JSON.parse(readFileSync(lock, 'utf8')) as Record<string, unknown>;
    writeFileSync(lock, JSON.stringify({ ...info, host: 'other-laptop', machine: 'other-laptop' }));
    expect(() => CampaignStore.open('main', options)).toThrow(/open on other-laptop/);
    // A lock from before machine ids: judged by host name.
    const legacy: Record<string, unknown> = { ...info, host: 'old-laptop' };
    delete legacy['machine'];
    writeFileSync(lock, JSON.stringify(legacy));
    expect(() => CampaignStore.open('main', options)).toThrow(/open on old-laptop/);
    // Same machine, live pid, but an earlier boot: the pid was reused.
    writeFileSync(lock, JSON.stringify({ ...info, boot: (info.boot as number) - 600 }));
    const store = CampaignStore.open('main', options);
    store.close();
    writeFileSync(lock, 'garbage');
    CampaignStore.open('main', options).close();
  });

  it('judges a same-machine lock by its holder, not just its pid (QF.41)', () => {
    const store = CampaignStore.open('main', options);
    const lock = path.join(store.dir, 'LOCK');
    const info = JSON.parse(readFileSync(lock, 'utf8')) as Record<string, unknown>;
    expect(info['pid']).toBe(process.pid);
    expect(typeof info['started']).toBe('number');
    // Held by this process: refused, naming the LOCK and what to do.
    expect(() => CampaignStore.open('main', options)).toThrow(
      `already open in this window. If The System is not running, delete ${lock}`,
    );
    store.close();
    // A crash left a LOCK whose pid is now this process (pid reuse): stale.
    writeFileSync(lock, JSON.stringify({ ...info, token: 'left-by-a-crash' }));
    CampaignStore.open('main', options).close();
    // Another live pid that started when the lock says: still open.
    const other = { ...info, pid: 4242, token: 'other' };
    const started = info['started'] as number;
    const live = { isAlive: () => true, processStart: () => started + 2_000 };
    writeFileSync(lock, JSON.stringify(other));
    expect(() => CampaignStore.open('main', { ...options, ...live })).toThrow(
      `already open (process 4242). If The System is not running, delete ${lock}`,
    );
    // The same pid given to a process that started later (reuse, Fast Startup): stale.
    const reused = { isAlive: () => true, processStart: () => started + 3_600_000 };
    CampaignStore.open('main', { ...options, ...reused }).close();
    // Start time unreadable, or a lock from before start times: never two writers.
    writeFileSync(lock, JSON.stringify(other));
    const unknown = { isAlive: () => true, processStart: () => null };
    expect(() => CampaignStore.open('main', { ...options, ...unknown })).toThrow(/process 4242/);
    const legacy: Record<string, unknown> = { ...other };
    delete legacy['started'];
    writeFileSync(lock, JSON.stringify(legacy));
    expect(() => CampaignStore.open('main', { ...options, ...reused })).toThrow(/process 4242/);
    // A dead holder is stale whatever its start time.
    CampaignStore.open('main', { ...options, isAlive: () => false }).close();
    expect(existsSync(lock)).toBe(false);
  });

  it('judges a lock by machine id, not the host name, once the lock has one', () => {
    const withId = { ...options, machineId: 'install-1234abcd' };
    const dir = CampaignStore.open('main', withId).dir;
    const lock = path.join(dir, 'LOCK');
    const info = JSON.parse(readFileSync(lock, 'utf8')) as Record<string, unknown>;
    expect(info['machine']).toBe('install-1234abcd');
    // Left by a crash while the network gave the laptop another host name: still ours, and stale.
    writeFileSync(lock, JSON.stringify({ ...info, host: 'lukes-mbp.lan', pid: 999_999_999 }));
    CampaignStore.open('main', { ...withId, isAlive: () => false }).close();
    // Another install's lock is refused whatever the host name says.
    const held = CampaignStore.open('main', withId);
    const other = JSON.parse(readFileSync(lock, 'utf8')) as Record<string, unknown>;
    writeFileSync(lock, JSON.stringify({ ...other, machine: 'install-other999' }));
    expect(() => CampaignStore.open('main', { ...withId, isAlive: () => false })).toThrow(
      /is open on/,
    );
    held.close();
  });

  it('commits events even when the snapshot cannot be written', () => {
    const store = CampaignStore.open('main', { ...options, snapshotEvery: 1 });
    rmSync(path.join(store.dir, 'snapshot.json'), { force: true });
    mkdirSync(path.join(store.dir, 'snapshot.json'));
    const before = play(store, script);
    store.close();
    const reopened = CampaignStore.open('main', options);
    expect(reopened.loadedFromSnapshot).toBe(false);
    expect(reopened.campaign).toEqual(before);
    reopened.close();
  });

  it('falls back to replay for a garbled snapshot shape', () => {
    const store = CampaignStore.open('main', options);
    const before = play(store, script);
    store.close();
    const file = path.join(dataDir, 'campaigns', 'main', 'snapshot.json');
    const snap = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const noState = { ...snap };
    delete noState.state;
    for (const bad of [
      { ...snap, eventVersions: null },
      { ...snap, undone: null },
      noState,
      5,
      null,
    ]) {
      writeFileSync(file, JSON.stringify(bad));
      const s = CampaignStore.open('main', options);
      expect(s.loadedFromSnapshot).toBe(false);
      expect(s.campaign).toEqual(before);
      s.close();
    }
  });

  it('backs up the log and a snapshot at session end', () => {
    const store = CampaignStore.open('main', options);
    play(store, script);
    const folder = store.backup();
    expect(path.basename(folder)).toMatch(/^2026-10-21T18-00-00-000Z-session-end$/);
    expect(readFileSync(path.join(folder, 'events.jsonl'), 'utf8')).toBe(
      readFileSync(logFile(), 'utf8'),
    );
    expect(existsSync(path.join(folder, 'snapshot.json'))).toBe(true);
    expect(() => store.backup('../x')).toThrow(StoreError);
    store.close();
    expect(() => store.backup()).toThrow(/closed/);
  });

  it('lists campaigns and validates ids', () => {
    CampaignStore.open('main', options).close();
    CampaignStore.open('demo', options).close();
    expect(CampaignStore.list(dataDir)).toEqual(['demo', 'main']);
    for (const bad of ['', '../x', 'A', 'a/b', '.hidden', 'x'.repeat(65), 'con', 'nul', 'com1']) {
      expect(() => checkCampaignId(bad)).toThrow(StoreError);
    }
  });
});

describe('disk faults (QF.7)', () => {
  const diskFull = () =>
    Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
  const rename = (name: string): Command => ({
    type: 'character.rename',
    characterId: 'jake',
    name,
  });

  /** One command's events, built against the store's current campaign. */
  function eventsFor(store: CampaignStore, command: Command, ctx: CommandContext) {
    const result = execute(store.campaign, command, ctx);
    if (!result.ok) throw new Error(result.error);
    return result.events;
  }

  it('cuts a failed write back to the last good length and keeps writing', () => {
    let failNext = false;
    const store = CampaignStore.open('main', {
      ...options,
      logIo: {
        // Writes half the bytes, then the disk fills up.
        write: (fd, data, offset, length) => {
          if (!failNext) return writeSync(fd, data, offset, length);
          failNext = false;
          writeSync(fd, data, offset, Math.max(1, Math.floor(length / 2)));
          throw diskFull();
        },
      },
    });
    const before = play(store, script);
    const good = readFileSync(logFile());
    const ctx = context('f');
    failNext = true;
    expect(() => store.appendAll(eventsFor(store, rename('Lost'), ctx))).toThrow(/ENOSPC/);
    expect(readFileSync(logFile())).toEqual(good);
    expect(store.campaign).toEqual(before);
    // The store is not latched: the next command writes and replays cleanly.
    const after = play(store, [rename('Kept')], ctx);
    expect(after.state?.characters.jake?.name).toBe('Kept');
    store.close();
    const reopened = CampaignStore.open('main', options);
    expect(reopened.campaign).toEqual(after);
    expect(reopened.campaign.events.some((e) => JSON.stringify(e).includes('Lost'))).toBe(false);
    reopened.close();
  });

  it('refuses every later write when a failed write cannot be undone', () => {
    let fail = false;
    const store = CampaignStore.open('main', {
      ...options,
      logIo: {
        write: (fd, data, offset, length) => {
          if (!fail) return writeSync(fd, data, offset, length);
          writeSync(fd, data, offset, 1);
          throw diskFull();
        },
        ftruncate: () => {
          if (fail) throw new Error('EIO: i/o error');
        },
      },
    });
    play(store, script);
    const ctx = context('u');
    fail = true;
    expect(() => store.appendAll(eventsFor(store, rename('A'), ctx))).toThrow(/ENOSPC/);
    fail = false;
    expect(() => store.appendAll(eventsFor(store, rename('B'), ctx))).toThrow(StoreError);
    expect(() => store.appendAll(eventsFor(store, rename('B'), ctx))).toThrow(
      /a failed write could not be undone \(Error: EIO: i\/o error\)/,
    );
    store.close();
  });

  it('refuses every later write after a failed fsync, and says why', () => {
    let failSync = false;
    const store = CampaignStore.open('main', {
      ...options,
      logIo: {
        fsync: (fd) => {
          if (failSync) throw Object.assign(new Error('EIO: i/o error, fsync'), { code: 'EIO' });
          fsyncSync(fd);
        },
      },
    });
    const before = play(store, script);
    const ctx = context('s');
    failSync = true;
    expect(() => store.appendAll(eventsFor(store, rename('Maybe'), ctx))).toThrow(/EIO/);
    // The write's durable state is unknown, so memory keeps the last known state.
    expect(store.campaign).toEqual(before);
    failSync = false; // even once the disk recovers, the latch holds
    for (const name of ['Again', 'Still']) {
      let thrown: unknown;
      try {
        store.appendAll(eventsFor(store, rename(name), ctx));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(StoreError);
      expect(String((thrown as Error).message)).toBe(
        'Campaign "main": the event log could not be synced to disk (Error: EIO: i/o error, fsync)',
      );
    }
    expect(readFileSync(logFile(), 'utf8')).not.toMatch(/Again|Still/);
    store.close();
  });
});

describe('export and import', () => {
  const TOKEN = 'ghp_CANARYTOKEN1234567890';

  it('round-trips a campaign exactly', () => {
    const store = CampaignStore.open('main', options);
    const before = play(store, script);
    const exported = JSON.parse(JSON.stringify(store.exportCampaign())) as unknown;
    const imported = importCampaign(exported, 'copy', options);
    expect(imported.campaign).toEqual(before);
    expect(readFileSync(logFile('copy'), 'utf8')).toBe(readFileSync(logFile('main'), 'utf8'));
    imported.close();
    const reopened = CampaignStore.open('copy', options);
    expect(reopened.campaign).toEqual(before);
    reopened.close();
    store.close();
  });

  it('never carries secrets', () => {
    // Settings (where a GitHub token will live, M9.4) sit outside every campaign.
    writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ githubToken: TOKEN }));
    const store = CampaignStore.open('main', options);
    play(store, script);
    writeFileSync(path.join(store.dir, 'stray.json'), JSON.stringify({ token: TOKEN }));
    const exported = store.exportCampaign();
    const json = JSON.stringify(exported);
    expect(json).not.toContain(TOKEN);
    // No key anywhere in the export names a credential.
    const keys: string[] = [];
    JSON.parse(json, (key: string, value: unknown) => {
      keys.push(key);
      return value;
    });
    expect(keys.filter((k) => /token|secret|password|gmkey|apikey/i.test(k))).toEqual([]);
    expect(Object.keys(exported).sort()).toEqual([
      'campaignId',
      'events',
      'exportedAt',
      'format',
      'portraits',
      'version',
    ]);
    store.close();
  });

  it('rejects bad exports and never overwrites a campaign', () => {
    const store = CampaignStore.open('main', options);
    play(store, script);
    const good = store.exportCampaign();
    expect(() => importCampaign(null, 'x', options)).toThrow(/Not a campaign export/);
    expect(() => importCampaign({ ...good, version: 9 }, 'x', options)).toThrow(/version/);
    expect(() => importCampaign({ ...good, events: 'no' }, 'x', options)).toThrow(/event list/);
    expect(() => importCampaign(good, 'main', options)).toThrow(/already exists/);
    expect(() => importCampaign(good, '../evil', options)).toThrow(StoreError);
    const broken = { ...good, events: good.events.slice(1) };
    expect(() => importCampaign(broken, 'x', options)).toThrow(/cannot load/);
    expect(CampaignStore.list(dataDir)).toEqual(['main']);
    store.close();
  });

  // MT.10 (Q40): backups and exports carry the portraits folder and restore it.
  const png = (seed: number) =>
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from(`portrait-${seed}`),
    ]);

  it('backs up the portraits folder; copying a backup back restores them', () => {
    const store = CampaignStore.open('main', options);
    play(store, script);
    const a = savePortrait(store.dir, png(1));
    const b = savePortrait(store.dir, png(2));
    writeFileSync(path.join(store.dir, 'portraits', 'stray.txt'), 'not a portrait');
    const folder = store.backup();
    expect(readdirSync(path.join(folder, 'portraits')).sort()).toEqual([a, b].sort());
    expect(readFileSync(path.join(folder, 'portraits', a))).toEqual(png(1));
    const before = store.campaign;
    store.close();
    // The restore TROUBLESHOOTING describes: the backup's files into a campaign folder.
    const restored = path.join(CampaignStore.campaignsDir(dataDir), 'restored');
    cpSync(folder, restored, { recursive: true });
    const reopened = CampaignStore.open('restored', options);
    expect(reopened.campaign).toEqual(before);
    expect(portraitFile(reopened.dir, a)).not.toBeNull();
    expect(readFileSync(portraitFile(reopened.dir, b)!)).toEqual(png(2));
    reopened.close();
  });

  it('a backup without portraits has no portraits folder', () => {
    const store = CampaignStore.open('main', options);
    play(store, script);
    expect(existsSync(path.join(store.backup(), 'portraits'))).toBe(false);
    store.close();
  });

  it('exports portraits and imports them back; version 1 files still import', () => {
    const store = CampaignStore.open('main', options);
    play(store, script);
    const a = savePortrait(store.dir, png(3));
    const exported = JSON.parse(JSON.stringify(store.exportCampaign())) as CampaignExport;
    expect(exported.version).toBe(2);
    expect(Object.keys(exported.portraits ?? {})).toEqual([a]);
    const copy = importCampaign(exported, 'copy', options);
    expect(readFileSync(portraitFile(copy.dir, a)!)).toEqual(png(3));
    copy.close();
    const v1 = { ...exported, version: 1, portraits: undefined };
    const old = importCampaign(v1, 'old', options);
    expect(existsSync(path.join(old.dir, 'portraits'))).toBe(false);
    old.close();
    store.close();
  });

  it('rejects portraits that do not match their names', () => {
    const store = CampaignStore.open('main', options);
    play(store, script);
    const a = savePortrait(store.dir, png(4));
    const good = store.exportCampaign();
    const bad = (portraits: unknown) => () => importCampaign({ ...good, portraits }, 'x', options);
    expect(bad('nope')).toThrow(/must be an object/);
    expect(bad({ '../evil.png': png(4).toString('base64') })).toThrow(/is not a portrait/);
    expect(bad({ [a]: 5 })).toThrow(/is not a portrait/);
    expect(bad({ [a]: png(5).toString('base64') })).toThrow(/does not match/);
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const htmlName = `${createHash('sha256').update(html).digest('hex')}.png`;
    expect(bad({ [htmlName]: html.toString('base64') })).toThrow(/does not match/);
    expect(bad({ [a.replace('.png', '.jpg')]: png(4).toString('base64') })).toThrow(
      /does not match/,
    );
    // QF.28: a real PNG one byte over the upload limit, correctly named, is refused…
    const huge = Buffer.concat([png(6), Buffer.alloc(PORTRAIT_MAX_BYTES + 1 - png(6).length)]);
    expect(huge.length).toBe(PORTRAIT_MAX_BYTES + 1);
    const hugeName = `${createHash('sha256').update(huge).digest('hex')}.png`;
    expect(bad({ [hugeName]: huge.toString('base64') })).toThrow(/over the 2 MB limit/);
    // …one at the limit is not (so the refusal above is the size check's).
    const max = huge.subarray(0, PORTRAIT_MAX_BYTES);
    const maxName = `${createHash('sha256').update(max).digest('hex')}.png`;
    const fits = importCampaign(
      { ...good, portraits: { [maxName]: max.toString('base64') } },
      'max',
      options,
    );
    expect(portraitFile(fits.dir, maxName)).not.toBeNull();
    fits.close();
    // An empty file named by the hash of nothing is refused too.
    const emptyName = `${createHash('sha256').update(Buffer.alloc(0)).digest('hex')}.png`;
    expect(bad({ [emptyName]: '' })).toThrow(/is empty/);
    expect(CampaignStore.list(dataDir).sort()).toEqual(['main', 'max']);
    store.close();
  });

  it('imports logs exactly as replay reads them', () => {
    const store = CampaignStore.open('main', options);
    const before = play(store, script);
    expect(replay(store.exportCampaign().events)).toEqual(before);
    store.close();
  });
});

describe('parseLogText', () => {
  it('parses whole lines and skips blanks', () => {
    expect(parseLogText('{"a":1}\n\n{"b":2}\n')).toEqual({
      lines: [{ a: 1 }, { b: 2 }],
      goodBytes: 17,
      torn: false,
      completeTail: false,
    });
    expect(parseLogText('')).toEqual({ lines: [], goodBytes: 0, torn: false, completeTail: false });
  });

  it('reports a torn tail and its byte offset (multi-byte safe)', () => {
    expect(parseLogText('{"a":"é"}\n{"b":')).toEqual({
      lines: [{ a: 'é' }],
      goodBytes: 11,
      torn: true,
      completeTail: false,
    });
    expect(parseLogText('{"a":1}\n{"b":2}')).toEqual({
      lines: [{ a: 1 }, { b: 2 }],
      goodBytes: 8,
      torn: true,
      completeTail: true,
    });
  });

  it('keeps exact byte offsets when a line holds invalid UTF-8, and skips a BOM', () => {
    const data = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('{"a":"'),
      Buffer.from([0xe9]),
      Buffer.from('"}\n{"b":'),
    ]);
    const result = parseLogText(data);
    expect(result.lines).toHaveLength(1);
    expect(result.torn).toBe(true);
    expect(result.goodBytes).toBe(3 + 10);
  });

  it('throws on damage before the last line', () => {
    expect(() => parseLogText('{"a":1}\nnope\n{"b":2}\n')).toThrow(/line 2/);
  });
});
