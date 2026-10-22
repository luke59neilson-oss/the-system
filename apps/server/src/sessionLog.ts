import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from 'node:fs';
import path from 'node:path';
import {
  buildSessionLog,
  renderSessionLog,
  sessionLogBase,
  sessionLogBaseIsCurrent,
  type SessionLogBase,
} from '@the-system/engine';
import type { CampaignStore } from './store';

/**
 * Running session log autosave (ROADMAP M2.4, DESIGN §7 "Logging for
 * Claude"). One writer per open campaign: it covers the events appended
 * since the campaign was opened (this sitting; M4.3 sessions will narrow it)
 * and rewrites `<exportsDir>/<campaignId>/session-log-<opened stamp>.md`
 * every `intervalMs` (default 5 minutes) when something changed, and once
 * more on close. Nothing is written for a sitting with no events. Each write
 * is atomic (temp file, fsync, rename), so a reader never sees half a log.
 */

export const SESSION_LOG_INTERVAL_MS = 5 * 60_000;

/** `<dataDir>/exports`: where session logs (and later reports, M9.1) go. */
export const exportsDirFor = (dataDir: string) => path.join(dataDir, 'exports');

export interface SessionLogOptions {
  readonly exportsDir: string;
  /** ISO-8601 UTC clock. */
  readonly now: () => string;
  readonly intervalMs?: number;
  /** Timer (injected for tests); returns a cancel function. */
  readonly every?: (fn: () => void, ms: number) => () => void;
  /** Called when a write fails (the log is only a copy; play goes on). */
  readonly onError?: (error: unknown) => void;
}

const defaultEvery = (fn: () => void, ms: number) => {
  const timer = setInterval(fn, ms);
  timer.unref();
  return () => clearInterval(timer);
};

const stamp = (iso: string) => iso.replace(/[:.]/g, '-');

function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  const fd = openSync(tmp, 'w');
  let written = false;
  try {
    const data = Buffer.from(text, 'utf8');
    let done = 0;
    while (done < data.length) {
      const n = writeSync(fd, data, done, data.length - done);
      if (n <= 0) throw new Error('Write made no progress');
      done += n;
    }
    fsyncSync(fd);
    written = true;
  } finally {
    closeSync(fd);
    // Never leave a half-written temp file in the exports folder.
    if (!written) rmSync(tmp, { force: true });
  }
  try {
    renameSync(tmp, file);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}

export class SessionLogWriter {
  /** Where the log is (or will be) written. */
  readonly file: string;
  private readonly store: CampaignStore;
  private readonly options: SessionLogOptions;
  private readonly fromSeq: number;
  private readonly startedAt: string;
  /** Event count at the last write; -1 = never written. */
  private writtenSeq = -1;
  /** Fold of the events before the sitting, reused while still valid. */
  private base: SessionLogBase | null = null;
  private cancel: (() => void) | null;

  constructor(store: CampaignStore, options: SessionLogOptions) {
    this.store = store;
    this.options = options;
    this.fromSeq = store.campaign.events.length;
    this.startedAt = options.now();
    this.file = path.join(options.exportsDir, store.id, `session-log-${stamp(this.startedAt)}.md`);
    this.cancel = (options.every ?? defaultEvery)(
      () => this.flushQuietly(),
      options.intervalMs ?? SESSION_LOG_INTERVAL_MS,
    );
  }

  /**
   * Writes the log when the campaign changed since the last write. Returns
   * true when it wrote. Throws on a failed write.
   */
  flush(): boolean {
    const seq = this.store.campaign.events.length;
    if (seq <= this.fromSeq || seq === this.writtenSeq) return false;
    const campaign = this.store.campaign;
    // Fold the pre-sitting events once (and again only after an undo reaches
    // back into them), so a write costs the sitting's events, not the campaign's.
    if (this.base === null || !sessionLogBaseIsCurrent(campaign, this.base)) {
      this.base = sessionLogBase(campaign, this.fromSeq);
    }
    const log = buildSessionLog(campaign, this.fromSeq, this.base);
    const text = renderSessionLog(log, {
      startedAt: this.startedAt,
      writtenAt: this.options.now(),
    });
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeAtomic(this.file, text);
    this.writtenSeq = seq;
    return true;
  }

  /** Stops the timer and writes one last time (shutdown). Never throws. */
  close(): void {
    this.cancel?.();
    this.cancel = null;
    this.flushQuietly();
  }

  private flushQuietly(): void {
    try {
      this.flush();
    } catch (error) {
      this.options.onError?.(error);
    }
  }
}
