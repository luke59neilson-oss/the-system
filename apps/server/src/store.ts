import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  truncateSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import {
  EventRejectedError,
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

/**
 * Campaign persistence (ROADMAP M2.1, DECISIONS D2/D42). One directory per
 * campaign under `<dataDir>/campaigns/<id>/`:
 *
 * - `events.jsonl`: the append-only event log, one event per line, fsynced
 *   after every append. A torn last line (power loss mid-write) is cut off on
 *   open; damage anywhere else stops the load.
 * - `snapshot.json`: a cached fold, written atomically (temp file, fsync,
 *   rename) every `snapshotEvery` events and on close. Only a speed-up.
 * - `backups/<stamp>-<label>/`: copies made by `backup()` (session end).
 *
 * Secrets (tokens, M9.4) never live here: they belong in the app's settings,
 * outside every campaign directory, so exports cannot carry them.
 */

export const EXPORT_FORMAT = 'the-system-campaign';
export const EXPORT_VERSION = 1;

export interface CampaignExport {
  readonly format: typeof EXPORT_FORMAT;
  readonly version: number;
  readonly exportedAt: string;
  readonly campaignId: string;
  readonly events: readonly unknown[];
}

export class StoreError extends Error {}

export interface StoreOptions {
  readonly dataDir: string;
  /** ISO-8601 UTC clock (injected for tests). */
  readonly now: () => string;
  /** Write a snapshot after this many appends since the last one. */
  readonly snapshotEvery?: number;
}

const CAMPAIGN_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Validates a campaign directory name. */
export function checkCampaignId(id: string): string {
  if (!CAMPAIGN_ID.test(id)) {
    throw new StoreError(
      `Invalid campaign id "${id}": use 1-64 lowercase letters, digits and dashes`,
    );
  }
  return id;
}

export interface TornLogResult {
  /** Parsed events, including a complete but unterminated last line. */
  readonly lines: unknown[];
  /** Byte length of the newline-terminated prefix; anything after it is the torn tail. */
  readonly goodBytes: number;
  /** True when the text does not end at a line boundary. */
  readonly torn: boolean;
  /** The unterminated last line when it is complete JSON (to re-write with its newline). */
  readonly completeTail: string | null;
}

/**
 * Parses a JSONL log, tolerating a torn final line: an unterminated last line
 * is never trusted as written; if it is complete JSON it is kept (and repaired
 * with a newline), otherwise dropped. A bad line that ends in a newline is
 * real damage and throws. Pure (for unit tests).
 */
export function parseLogText(text: string): TornLogResult {
  const lines: unknown[] = [];
  let offset = 0;
  let lineNo = 0;
  while (offset < text.length) {
    lineNo++;
    const end = text.indexOf('\n', offset);
    if (end === -1) {
      const tail = text.slice(offset);
      const goodBytes = Buffer.byteLength(text.slice(0, offset), 'utf8');
      try {
        lines.push(JSON.parse(tail));
        return { lines, goodBytes, torn: true, completeTail: tail };
      } catch {
        return { lines, goodBytes, torn: true, completeTail: null };
      }
    }
    const line = text.slice(offset, end);
    if (line.trim() !== '') {
      try {
        lines.push(JSON.parse(line));
      } catch {
        throw new StoreError(`Event log line ${lineNo} is damaged (not valid JSON)`);
      }
    }
    offset = end + 1;
  }
  return { lines, goodBytes: Buffer.byteLength(text, 'utf8'), torn: false, completeTail: null };
}

const stamp = (iso: string) => iso.replace(/[:.]/g, '-');

function writeFileDurable(file: string, text: string): void {
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, 'w');
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
  fsyncDir(path.dirname(file));
}

function fsyncDir(dir: string): void {
  // Makes a rename or new file durable. Not supported on Windows; best effort there.
  let fd: number | undefined;
  try {
    fd = openSync(dir, 'r');
    fsyncSync(fd);
  } catch {
    // Directory fsync is unavailable on some platforms (Windows).
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** One open campaign: its state in memory, its log on disk. */
export class CampaignStore {
  readonly id: string;
  readonly dir: string;
  /** True when opening found and cut off a torn last line. */
  readonly repairedTornLine: boolean;
  /** True when opening started from the snapshot. */
  readonly loadedFromSnapshot: boolean;
  private campaignValue: Campaign;
  private fd: number | null;
  private sinceSnapshot = 0;
  private readonly options: StoreOptions;

  private constructor(
    id: string,
    dir: string,
    campaign: Campaign,
    fd: number,
    options: StoreOptions,
    flags: { repaired: boolean; fromSnapshot: boolean },
  ) {
    this.id = id;
    this.dir = dir;
    this.campaignValue = campaign;
    this.fd = fd;
    this.options = options;
    this.repairedTornLine = flags.repaired;
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
      .filter((d) => d.isDirectory() && CAMPAIGN_ID.test(d.name))
      .map((d) => d.name)
      .sort();
  }

  /** Opens (creating when missing) the campaign directory and loads its log. */
  static open(id: string, options: StoreOptions): CampaignStore {
    const dir = path.join(CampaignStore.campaignsDir(options.dataDir), checkCampaignId(id));
    mkdirSync(path.join(dir, 'backups'), { recursive: true });
    const logFile = path.join(dir, 'events.jsonl');
    const text = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '';
    const parsed = parseLogText(text);
    if (parsed.torn) {
      // Cut the torn bytes; a complete last event gets its missing newline back.
      truncateSync(logFile, parsed.goodBytes);
      if (parsed.completeTail !== null) {
        const repair = openSync(logFile, 'a');
        try {
          writeSync(repair, `${parsed.completeTail}\n`);
          fsyncSync(repair);
        } finally {
          closeSync(repair);
        }
      }
    }
    const snapshot = readSnapshot(path.join(dir, 'snapshot.json'));
    let loaded: { campaign: Campaign; usedSnapshot: boolean };
    try {
      loaded = resume(snapshot, parsed.lines);
    } catch (error) {
      if (error instanceof EventRejectedError) {
        throw new StoreError(`Campaign "${id}" cannot load: ${error.message}`);
      }
      throw error;
    }
    const fd = openSync(logFile, 'a');
    const store = new CampaignStore(id, dir, loaded.campaign, fd, options, {
      repaired: parsed.torn,
      fromSnapshot: loaded.usedSnapshot,
    });
    return store;
  }

  get campaign(): Campaign {
    return this.campaignValue;
  }

  /**
   * Appends one event: checked against the campaign, written and fsynced,
   * then applied in memory. Throws EventRejectedError and writes nothing when
   * the event does not apply.
   */
  append(event: DomainEvent): Campaign {
    const next = appendEvent(this.campaignValue, event);
    this.writeLine(event);
    this.campaignValue = next;
    this.sinceSnapshot++;
    if (this.sinceSnapshot >= (this.options.snapshotEvery ?? 100)) this.writeSnapshot();
    return next;
  }

  /** Appends several events (e.g. one command's result) in order. */
  appendAll(events: readonly DomainEvent[]): Campaign {
    for (const event of events) this.append(event);
    return this.campaignValue;
  }

  /** Writes the snapshot now (atomic). */
  writeSnapshot(): void {
    writeFileDurable(
      path.join(this.dir, 'snapshot.json'),
      JSON.stringify(snapshotOf(this.campaignValue)),
    );
    this.sinceSnapshot = 0;
  }

  /** Copies the log and a fresh snapshot to `backups/<stamp>-<label>/`; returns that folder. */
  backup(label = 'session-end'): string {
    if (!/^[a-z0-9-]{1,40}$/.test(label)) throw new StoreError(`Invalid backup label "${label}"`);
    this.requireOpen();
    this.writeSnapshot();
    const target = path.join(this.dir, 'backups', `${stamp(this.options.now())}-${label}`);
    if (existsSync(target)) throw new StoreError(`Backup ${path.basename(target)} already exists`);
    mkdirSync(target, { recursive: true });
    for (const file of ['events.jsonl', 'snapshot.json']) {
      copyFileSync(path.join(this.dir, file), path.join(target, file));
    }
    fsyncDir(target);
    return target;
  }

  /** The campaign as a portable export: the event log only, never settings or secrets. */
  exportCampaign(): CampaignExport {
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: this.options.now(),
      campaignId: this.id,
      events: JSON.parse(JSON.stringify(this.campaignValue.events)) as unknown[],
    };
  }

  /** Writes a snapshot and closes the log file. */
  close(): void {
    if (this.fd === null) return;
    this.writeSnapshot();
    closeSync(this.fd);
    this.fd = null;
  }

  private requireOpen(): number {
    if (this.fd === null) throw new StoreError(`Campaign "${this.id}" is closed`);
    return this.fd;
  }

  private writeLine(event: DomainEvent): void {
    const fd = this.requireOpen();
    writeSync(fd, `${JSON.stringify(event)}\n`);
    fsyncSync(fd);
  }
}

function readSnapshot(file: string): Snapshot | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Snapshot;
  } catch {
    return null; // A damaged snapshot is only a lost speed-up.
  }
}

/**
 * Imports an export as a new campaign `id`. The events are fully replayed
 * before anything is written; an existing campaign is never overwritten.
 */
export function importCampaign(raw: unknown, id: string, options: StoreOptions): CampaignStore {
  const data = raw as Partial<CampaignExport> | null;
  if (typeof data !== 'object' || data === null || data.format !== EXPORT_FORMAT) {
    throw new StoreError('Not a campaign export');
  }
  if (data.version !== EXPORT_VERSION) {
    throw new StoreError(`Unsupported export version ${String(data.version)}`);
  }
  if (!Array.isArray(data.events)) throw new StoreError('Export has no event list');
  checkCampaignId(id);
  let campaign: Campaign;
  try {
    campaign = replay(data.events);
    // Re-check by append so the imported log is exactly what appends would accept.
    let check = emptyCampaign();
    for (const event of campaign.events) check = appendEvent(check, parseEvent(event));
  } catch (error) {
    if (error instanceof EventRejectedError) {
      throw new StoreError(`Export cannot load: ${error.message}`);
    }
    throw error;
  }
  const dir = path.join(CampaignStore.campaignsDir(options.dataDir), id);
  if (existsSync(dir)) throw new StoreError(`Campaign "${id}" already exists`);
  const staging = path.join(CampaignStore.campaignsDir(options.dataDir), `.import-${id}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  writeFileDurable(
    path.join(staging, 'events.jsonl'),
    campaign.events.map((e) => `${JSON.stringify(e)}\n`).join(''),
  );
  renameSync(staging, dir);
  fsyncDir(CampaignStore.campaignsDir(options.dataDir));
  return CampaignStore.open(id, options);
}
