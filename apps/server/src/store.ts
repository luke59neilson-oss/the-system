import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  ftruncateSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { hostname, uptime } from 'node:os';
import path from 'node:path';
import {
  EventRejectedError,
  PORTRAIT_REF,
  appendEvent,
  emptyCampaign,
  parseEvent,
  replay,
  resume,
  snapshotOf,
  type Campaign,
  type DomainEvent,
  type Snapshot,
} from '@the-system/engine';
import { PORTRAIT_MAX_BYTES, detectPortrait } from './portraitFormat';

/**
 * Campaign persistence (ROADMAP M2.1, DECISIONS D2/D42). One directory per
 * campaign under `<dataDir>/campaigns/<id>/`:
 *
 * - `events.jsonl`: the append-only event log, one event per line, fsynced
 *   after every write. A torn last line (power loss mid-write) is copied to
 *   `events.jsonl.torn-<stamp>` and cut off on open; damage anywhere else
 *   stops the load.
 * - `snapshot.json`: a cached fold, written atomically (temp file, fsync,
 *   rename) every `snapshotEvery` events and on close. Only a speed-up.
 * - `backups/<stamp>-<label>/`: copies made by `backup()` (session end).
 * - `LOCK`: one writer per campaign; holds the owner's pid.
 *
 * Secrets (tokens, M9.4) never live here: they belong in the app's settings,
 * outside every campaign directory, so exports cannot carry them.
 */

export const EXPORT_FORMAT = 'the-system-campaign';
/** 2 (MT.10, Q40): exports carry the portraits folder; version 1 files still import. */
export const EXPORT_VERSION = 2;

export interface CampaignExport {
  readonly format: typeof EXPORT_FORMAT;
  readonly version: number;
  readonly exportedAt: string;
  readonly campaignId: string;
  readonly events: readonly unknown[];
  /** Portrait files by name (`<sha256>.<ext>`), base64 (version 2 on). */
  readonly portraits?: Readonly<Record<string, string>>;
}

/** The campaign's stored portrait file names (MT.10), sorted. */
function portraitNames(dir: string): string[] {
  const folder = path.join(dir, 'portraits');
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => PORTRAIT_REF.test(name))
    .sort();
}

/**
 * Checks imported portraits (MT.10): each name must be a portrait name whose
 * bytes are an image of that type, at most the upload limit, hashing to it.
 */
function checkPortraits(raw: unknown): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  if (raw === undefined) return out;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new StoreError('Export portraits must be an object');
  }
  for (const [name, data] of Object.entries(raw)) {
    if (!PORTRAIT_REF.test(name) || typeof data !== 'string') {
      throw new StoreError(`Export portrait "${name.slice(0, 80)}" is not a portrait`);
    }
    const bytes = Buffer.from(data, 'base64');
    const ext = name.slice(name.lastIndexOf('.') + 1);
    if (
      bytes.length === 0 ||
      bytes.length > PORTRAIT_MAX_BYTES ||
      detectPortrait(bytes) !== ext ||
      createHash('sha256').update(bytes).digest('hex') !== name.slice(0, 64)
    ) {
      throw new StoreError(`Export portrait "${name}" does not match its file name`);
    }
    out.set(name, bytes);
  }
  return out;
}

export class StoreError extends Error {}

export interface StoreOptions {
  readonly dataDir: string;
  /** ISO-8601 UTC clock (injected for tests). */
  readonly now: () => string;
  /** Write a snapshot after this many appends since the last one. */
  readonly snapshotEvery?: number;
  /** Whether a lock holder's pid is alive (injected for tests). */
  readonly isAlive?: (pid: number) => boolean;
  /**
   * Stable id of this computer for the campaign lock (the desktop app keeps
   * one in its settings folder). Defaults to the host name, which can change
   * with the network on macOS, so a lock left by a crash could look foreign.
   */
  readonly machineId?: string;
  /**
   * The event log's write, fsync and truncate calls. Tests replace them to
   * inject disk faults; the server always uses node:fs.
   */
  readonly logIo?: Partial<LogIo>;
}

/** The file calls an append makes on the event log (see StoreOptions.logIo). */
export interface LogIo {
  write(fd: number, data: Buffer, offset: number, length: number): number;
  fsync(fd: number): void;
  ftruncate(fd: number, length: number): void;
}

const NODE_LOG_IO: LogIo = {
  write: (fd, data, offset, length) => writeSync(fd, data, offset, length),
  fsync: (fd) => fsyncSync(fd),
  ftruncate: (fd, length) => ftruncateSync(fd, length),
};

const CAMPAIGN_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Windows device names that cannot be directory names. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/** Validates a campaign directory name. */
export function checkCampaignId(id: string): string {
  if (!CAMPAIGN_ID.test(id) || RESERVED.test(id)) {
    throw new StoreError(
      `Invalid campaign id "${id}": use 1-64 lowercase letters, digits and dashes (not a reserved name)`,
    );
  }
  return id;
}

export interface TornLogResult {
  /** Parsed events, including a complete but unterminated last line. */
  readonly lines: unknown[];
  /** Byte length of the newline-terminated prefix; anything after it is the torn tail. */
  readonly goodBytes: number;
  /** True when the data does not end at a line boundary. */
  readonly torn: boolean;
  /** True when the unterminated last line is complete JSON (kept; needs its newline). */
  readonly completeTail: boolean;
}

const NEWLINE = 0x0a;
const BOM = [0xef, 0xbb, 0xbf];

/**
 * Parses a JSONL log at byte level (offsets stay exact whatever the bytes),
 * tolerating a torn final line: an unterminated last line is kept when it is
 * complete JSON and dropped otherwise. A bad line that ends in a newline is
 * real damage and throws. A leading UTF-8 BOM is skipped. Pure.
 */
export function parseLogText(data: Buffer | string): TornLogResult {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const lines: unknown[] = [];
  let offset = BOM.every((b, i) => buf[i] === b) ? BOM.length : 0;
  let lineNo = 0;
  while (offset < buf.length) {
    lineNo++;
    const end = buf.indexOf(NEWLINE, offset);
    const text = buf.toString('utf8', offset, end === -1 ? buf.length : end);
    if (end === -1) {
      try {
        lines.push(JSON.parse(text));
        return { lines, goodBytes: offset, torn: true, completeTail: true };
      } catch {
        return { lines, goodBytes: offset, torn: true, completeTail: false };
      }
    }
    if (text.trim() !== '') {
      try {
        lines.push(JSON.parse(text));
      } catch {
        throw new StoreError(`Event log line ${lineNo} is damaged (not valid JSON)`);
      }
    }
    offset = end + 1;
  }
  return { lines, goodBytes: buf.length, torn: false, completeTail: false };
}

const stamp = (iso: string) => iso.replace(/[:.]/g, '-');

/** writeSync until every byte is written (it may write fewer). */
function writeAll(fd: number, data: Buffer, write: LogIo['write'] = NODE_LOG_IO.write): void {
  let done = 0;
  while (done < data.length) {
    const n = write(fd, data, done, data.length - done);
    if (n <= 0) throw new StoreError('Write made no progress');
    done += n;
  }
}

export function writeFileDurable(file: string, data: Buffer | string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  const fd = openSync(tmp, 'w');
  try {
    writeAll(fd, typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
  fsyncDir(path.dirname(file));
}

function fsyncFile(file: string): void {
  const fd = openSync(file, 'r+');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function fsyncDir(dir: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(dir, 'r');
    fsyncSync(fd);
  } catch {
    // Directory fsync is unavailable on some platforms (Windows); best effort.
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Boot time of this machine to the nearest minute (pids restart after a reboot). */
const bootMinute = () => Math.round((Date.now() - uptime() * 1000) / 60_000);

interface LockInfo {
  pid: number;
  host: string;
  /** Absent in locks written before machine ids. */
  machine?: string;
  boot: number;
  token: string;
}

function readLock(file: string): LockInfo | null {
  try {
    const info = JSON.parse(readFileSync(file, 'utf8')) as Partial<LockInfo>;
    return typeof info.pid === 'number' && typeof info.host === 'string'
      ? (info as LockInfo)
      : null;
  } catch {
    return null; // Missing or unreadable: treated as stale (or already gone).
  }
}

/**
 * Takes the campaign's single-writer lock; returns its contents. A lock from
 * this machine is stale when its pid is gone or it predates the last boot; a
 * lock from another machine (shared drive) is never taken over automatically.
 */
function takeLock(file: string, isAlive: (pid: number) => boolean, machine: string): string {
  const contents = JSON.stringify({
    pid: process.pid,
    host: hostname(),
    machine,
    boot: bootMinute(),
    token: randomUUID(),
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(file, 'wx');
      try {
        writeAll(fd, Buffer.from(contents));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      return contents;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const raw = existsSync(file) ? readFileSync(file, 'utf8') : null;
      if (raw === null) continue; // Released between our open and read.
      const info = readLock(file);
      const foreign =
        info !== null &&
        (info.machine !== undefined ? info.machine !== machine : info.host !== hostname());
      if (info && foreign) {
        throw new StoreError(
          `The campaign is open on ${info.host}; if that computer is off, delete ${file}`,
        );
      }
      const sameBoot = info !== null && Math.abs(info.boot - bootMinute()) <= 1;
      if (info && sameBoot && isAlive(info.pid)) {
        throw new StoreError(`The campaign is already open (process ${info.pid})`);
      }
      // Stale. Remove it only if it is still the lock we judged.
      if (existsSync(file) && readFileSync(file, 'utf8') === raw) unlinkSync(file);
    }
  }
  throw new StoreError('Could not take the campaign lock');
}

/** One open campaign: its state in memory, its log on disk. */
export class CampaignStore {
  readonly id: string;
  readonly dir: string;
  /** Set when opening found a torn last line: where its bytes were saved. */
  readonly tornCopy: string | null;
  /** True when opening started from the snapshot. */
  readonly loadedFromSnapshot: boolean;
  private campaignValue: Campaign;
  private fd: number | null;
  /** Bytes of the log known to be whole lines; a failed write is cut back to it. */
  private goodBytes: number;
  /** Set when a failed write could not be undone; the store refuses further writes. */
  private broken: string | null = null;
  private sinceSnapshot = 0;
  private readonly options: StoreOptions;
  private readonly lock: string;

  private constructor(
    id: string,
    dir: string,
    campaign: Campaign,
    fd: number,
    options: StoreOptions,
    flags: { tornCopy: string | null; fromSnapshot: boolean; lock: string },
  ) {
    this.lock = flags.lock;
    this.id = id;
    this.dir = dir;
    this.campaignValue = campaign;
    this.fd = fd;
    this.goodBytes = fstatSync(fd).size;
    this.options = options;
    this.tornCopy = flags.tornCopy;
    this.loadedFromSnapshot = flags.fromSnapshot;
  }

  static campaignsDir(dataDir: string): string {
    return path.join(dataDir, 'campaigns');
  }

  /** Campaign ids with a directory in the data dir, sorted. */
  static list(dataDir: string): string[] {
    const dir = CampaignStore.campaignsDir(dataDir);
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && CAMPAIGN_ID.test(d.name) && !RESERVED.test(d.name))
      .map((d) => d.name)
      .sort();
  }

  /**
   * Opens the campaign (creating it when missing) and loads its log. The log
   * is validated before any repair touches the file.
   */
  static open(id: string, options: StoreOptions): CampaignStore {
    const dir = path.join(CampaignStore.campaignsDir(options.dataDir), checkCampaignId(id));
    mkdirSync(path.join(dir, 'backups'), { recursive: true });
    const lockFile = path.join(dir, 'LOCK');
    const lock = takeLock(
      lockFile,
      options.isAlive ?? defaultIsAlive,
      options.machineId ?? hostname(),
    );
    try {
      return CampaignStore.load(id, dir, options, lock);
    } catch (error) {
      rmSync(lockFile, { force: true });
      throw error;
    }
  }

  private static load(id: string, dir: string, options: StoreOptions, lock: string): CampaignStore {
    const logFile = path.join(dir, 'events.jsonl');
    const data = existsSync(logFile) ? readFileSync(logFile) : Buffer.alloc(0);
    const parsed = parseLogText(data);
    const snapshot = readSnapshot(path.join(dir, 'snapshot.json'));
    const lost = lostWrites(snapshot, parsed.lines);
    if (lost) {
      // The snapshot is written only after its events are fsynced, so a log
      // shorter than it means the disk lost acknowledged writes (M11.2).
      // Opening would silently drop them and the next snapshot would erase the
      // last trace: refuse and change nothing.
      throw new StoreError(
        `Campaign "${id}" cannot load: its event log holds ${lost.logEvents} events but its snapshot ` +
          `recorded ${lost.snapshotEvents}, so the disk lost writes. Nothing was changed. Restore ` +
          `the campaign from ${path.join(dir, 'backups')}, or rename snapshot.json (keep it: it shows how many events were lost) to open the ` +
          `log as it is.`,
      );
    }
    let loaded: { campaign: Campaign; usedSnapshot: boolean };
    try {
      loaded = resume(snapshot, parsed.lines);
    } catch (error) {
      if (error instanceof EventRejectedError) {
        throw new StoreError(`Campaign "${id}" cannot load: ${error.message}`);
      }
      throw error;
    }
    let tornCopy: string | null = null;
    const fd = openSync(logFile, existsSync(logFile) ? 'r+' : 'w+');
    try {
      if (parsed.torn) {
        // Never delete campaign data: keep the torn bytes beside the log first.
        tornCopy = `${logFile}.torn-${stamp(options.now())}`;
        writeFileDurable(tornCopy, data.subarray(parsed.goodBytes));
        if (parsed.completeTail) {
          // The last event is whole; it only lacks its newline.
          if (writeSync(fd, Buffer.from('\n'), 0, 1, data.length) !== 1) {
            throw new StoreError('Could not repair the last event log line');
          }
        } else {
          ftruncateSync(fd, parsed.goodBytes);
        }
        fsyncSync(fd);
      }
    } catch (error) {
      closeSync(fd);
      throw error;
    }
    closeSync(fd);
    const appendFd = openSync(logFile, 'a');
    return new CampaignStore(id, dir, loaded.campaign, appendFd, options, {
      tornCopy,
      fromSnapshot: loaded.usedSnapshot,
      lock,
    });
  }

  get campaign(): Campaign {
    return this.campaignValue;
  }

  /** Appends one event (see appendAll). */
  append(event: DomainEvent): Campaign {
    return this.appendAll([event]);
  }

  /**
   * Appends one command's events atomically: all are checked against the
   * campaign first, then written in one write and fsynced, then applied in
   * memory. Throws EventRejectedError and writes nothing when any event does
   * not apply. A failed write is cut back so the log stays whole.
   */
  appendAll(events: readonly DomainEvent[]): Campaign {
    const fd = this.requireWritable();
    let next = this.campaignValue;
    for (const event of events) next = appendEvent(next, event);
    if (events.length === 0) return next;
    const bytes = Buffer.from(events.map((e) => `${JSON.stringify(e)}\n`).join(''), 'utf8');
    const io = { ...NODE_LOG_IO, ...this.options.logIo };
    try {
      writeAll(fd, bytes, io.write);
    } catch (error) {
      try {
        io.ftruncate(fd, this.goodBytes);
        io.fsync(fd);
      } catch (undoError) {
        this.broken = `a failed write could not be undone (${String(undoError)})`;
      }
      throw error;
    }
    try {
      io.fsync(fd);
    } catch (error) {
      // After a failed fsync the file's durable contents are unknown: stop writing.
      this.broken = `the event log could not be synced to disk (${String(error)})`;
      throw error;
    }
    this.goodBytes += bytes.length;
    this.campaignValue = next;
    this.sinceSnapshot += events.length;
    if (this.sinceSnapshot >= (this.options.snapshotEvery ?? 100)) {
      try {
        this.writeSnapshot();
      } catch {
        // The events are committed; a snapshot is only a speed-up and retries next time.
      }
    }
    return next;
  }

  /** Writes the snapshot now (atomic). */
  writeSnapshot(): void {
    writeFileDurable(
      path.join(this.dir, 'snapshot.json'),
      JSON.stringify(snapshotOf(this.campaignValue)),
    );
    this.sinceSnapshot = 0;
  }

  /**
   * Copies the log and a fresh snapshot to `backups/<stamp>-<label>/` (built
   * in a temp folder, fsynced, then renamed into place); returns that folder.
   */
  backup(label = 'session-end'): string {
    if (!/^[a-z0-9-]{1,40}$/.test(label)) throw new StoreError(`Invalid backup label "${label}"`);
    if (this.fd === null) throw new StoreError(`Campaign "${this.id}" is closed`);
    // Allowed on a broken store too (that is when a copy matters most); the
    // snapshot is skipped there and the log's whole lines are what counts.
    if (this.broken === null) this.writeSnapshot();
    const backups = path.join(this.dir, 'backups');
    const name = `${stamp(this.options.now())}-${label}`;
    const target = path.join(backups, name);
    if (existsSync(target)) throw new StoreError(`Backup ${name} already exists`);
    const staging = path.join(backups, `.tmp-${name}`);
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging);
    for (const file of ['events.jsonl', 'snapshot.json']) {
      if (!existsSync(path.join(this.dir, file))) continue;
      copyFileSync(path.join(this.dir, file), path.join(staging, file));
      fsyncFile(path.join(staging, file));
    }
    // MT.10 (Q40): the portraits folder too, so a backup restores whole.
    const names = portraitNames(this.dir);
    if (names.length > 0) {
      const into = path.join(staging, 'portraits');
      mkdirSync(into);
      for (const name of names) {
        copyFileSync(path.join(this.dir, 'portraits', name), path.join(into, name));
        fsyncFile(path.join(into, name));
      }
      fsyncDir(into);
    }
    fsyncDir(staging);
    renameSync(staging, target);
    fsyncDir(backups);
    return target;
  }

  /**
   * The campaign as a portable export: the event log and the portraits folder
   * (MT.10), never settings or secrets.
   */
  exportCampaign(): CampaignExport {
    const portraits: Record<string, string> = {};
    for (const name of portraitNames(this.dir)) {
      portraits[name] = readFileSync(path.join(this.dir, 'portraits', name)).toString('base64');
    }
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: this.options.now(),
      campaignId: this.id,
      events: JSON.parse(JSON.stringify(this.campaignValue.events)) as unknown[],
      portraits,
    };
  }

  /**
   * Writes a snapshot, closes the log and releases the lock. If another
   * process took the lock over (this one was presumed dead), only closes.
   */
  close(): void {
    if (this.fd === null) return;
    const lockFile = path.join(this.dir, 'LOCK');
    const owned = existsSync(lockFile) && readFileSync(lockFile, 'utf8') === this.lock;
    try {
      if (owned && this.broken === null) this.writeSnapshot();
    } catch {
      // Only a speed-up: the next open replays the log instead.
    } finally {
      closeSync(this.fd);
      this.fd = null;
      if (owned) rmSync(lockFile, { force: true });
    }
  }

  private requireWritable(): number {
    if (this.fd === null) throw new StoreError(`Campaign "${this.id}" is closed`);
    if (this.broken !== null) throw new StoreError(`Campaign "${this.id}": ${this.broken}`);
    return this.fd;
  }
}

/**
 * A snapshot that recorded more events than the log holds, ending at an event
 * the log does not have: the log lost writes after they were acknowledged.
 * (A snapshot that merely disagrees with the log is only ignored, D42.)
 */
function lostWrites(
  snapshot: Snapshot | null,
  lines: readonly unknown[],
): { logEvents: number; snapshotEvents: number } | null {
  if (snapshot === null || typeof snapshot !== 'object') return null;
  const { eventCount, lastEventId } = snapshot as Partial<Snapshot>;
  if (typeof eventCount !== 'number' || typeof lastEventId !== 'string') return null;
  if (eventCount <= lines.length) return null;
  const inLog = lines.some(
    (line) =>
      typeof line === 'object' && line !== null && (line as { id?: unknown }).id === lastEventId,
  );
  return inLog ? null : { logEvents: lines.length, snapshotEvents: eventCount };
}

function readSnapshot(file: string): Snapshot | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Snapshot;
  } catch {
    return null; // A damaged snapshot is only a lost speed-up (resume checks its shape).
  }
}

/**
 * Imports an export as a new campaign `id`. The events are fully replayed
 * and re-checked by append before anything is written; an existing campaign
 * is never overwritten.
 */
export function importCampaign(raw: unknown, id: string, options: StoreOptions): CampaignStore {
  const data = raw as Partial<CampaignExport> | null;
  if (typeof data !== 'object' || data === null || data.format !== EXPORT_FORMAT) {
    throw new StoreError('Not a campaign export');
  }
  if (data.version !== 1 && data.version !== EXPORT_VERSION) {
    throw new StoreError(`Unsupported export version ${String(data.version)}`);
  }
  if (!Array.isArray(data.events)) throw new StoreError('Export has no event list');
  const portraits = checkPortraits(data.version === 1 ? undefined : data.portraits);
  checkCampaignId(id);
  let campaign: Campaign;
  try {
    campaign = replay(data.events);
    let check = emptyCampaign();
    for (const event of campaign.events) check = appendEvent(check, parseEvent(event));
  } catch (error) {
    if (error instanceof EventRejectedError) {
      throw new StoreError(`Export cannot load: ${error.message}`);
    }
    throw error;
  }
  const root = CampaignStore.campaignsDir(options.dataDir);
  const dir = path.join(root, id);
  if (existsSync(dir)) throw new StoreError(`Campaign "${id}" already exists`);
  const staging = path.join(root, `.import-${id}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  writeFileDurable(
    path.join(staging, 'events.jsonl'),
    campaign.events.map((e) => `${JSON.stringify(e)}\n`).join(''),
  );
  if (portraits.size > 0) {
    mkdirSync(path.join(staging, 'portraits'));
    for (const [name, bytes] of portraits) {
      writeFileDurable(path.join(staging, 'portraits', name), bytes);
    }
    fsyncDir(path.join(staging, 'portraits'));
  }
  renameSync(staging, dir);
  fsyncDir(root);
  return CampaignStore.open(id, options);
}
