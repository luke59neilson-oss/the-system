import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import {
  buildSessionLog,
  renderSessionLog,
  sessionEventRange,
  sessionLogBase,
  sessionLogBaseIsCurrent,
  type CampaignState,
  type SessionLogBase,
  type SessionRecord,
} from '@the-system/engine';
import type { CampaignStore } from './store';

/**
 * Session log autosave and session report (ROADMAP M2.4, M4.3; DESIGN §7
 * "Logging for Claude"). One writer per open campaign. It follows the play
 * session the GM started: while one runs, it rewrites
 * `<exportsDir>/<campaignId>/session-<NN>.md` (that session's events so far)
 * every `intervalMs` (default 5 minutes) when something changed, and once
 * more on close. When the session ends, the same file is rewritten one last
 * time as the session report (its events up to the end). Between sessions
 * nothing is written. Each write is atomic (temp file, fsync, rename), so a
 * reader never sees half a log.
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

/** `session-01.md`, `session-12.md`, `session-140.md`. */
export const sessionFileName = (n: number) => `session-${String(n).padStart(2, '0')}.md`;

/** The running session, else the last one (its report); null before the first. */
function targetSession(state: CampaignState | null): SessionRecord | null {
  if (!state) return null;
  const id = state.currentSession;
  return (id === null ? state.sessions.at(-1) : state.sessions.find((x) => x.id === id)) ?? null;
}

export class SessionLogWriter {
  private readonly store: CampaignStore;
  private readonly options: SessionLogOptions;
  /** What the file of the target session last held (session, range, log length/undos). */
  private writtenKey: string | null = null;
  /** The session this writer last wrote, to mark its file when its start is undone. */
  private lastWritten: { id: string; number: number; file: string } | null = null;
  /** Fold of the events before the session, reused while still valid. */
  private base: SessionLogBase | null = null;
  private cancel: (() => void) | null;

  constructor(store: CampaignStore, options: SessionLogOptions) {
    this.store = store;
    this.options = options;
    // A report already on disk for a session that ended before this opening is
    // not rewritten just because the campaign was opened again.
    const target = targetSession(store.campaign.state);
    if (target && target.endedAt !== null) {
      const plan = this.plan();
      if (plan && existsSync(plan.file)) this.writtenKey = plan.key;
    }
    this.cancel = (options.every ?? defaultEvery)(
      () => this.flushQuietly(),
      options.intervalMs ?? SESSION_LOG_INTERVAL_MS,
    );
  }

  /** The file of the running (or last) session; null before the first session. */
  get file(): string | null {
    const target = targetSession(this.store.campaign.state);
    return target ? this.fileFor(target.number) : null;
  }

  fileFor(sessionNumber: number): string {
    return path.join(this.options.exportsDir, this.store.id, sessionFileName(sessionNumber));
  }

  private plan() {
    const campaign = this.store.campaign;
    const session = targetSession(campaign.state);
    if (!session) return null;
    const range = sessionEventRange(campaign, session.id);
    if (!range) return null;
    const toSeq = range.toSeq ?? campaign.events.length;
    // A running log changes with every event; an ended session's report only
    // when an undo changes which of its events count.
    const version =
      range.toSeq === null
        ? `open:${campaign.events.length}`
        : `ended:${Object.keys(campaign.undone).length}`;
    return {
      session,
      fromSeq: range.fromSeq,
      toSeq,
      file: this.fileFor(session.number),
      key: `${session.id}|${range.fromSeq}|${toSeq}|${version}`,
    };
  }

  /**
   * Writes the running session's log, or the last session's report, when it
   * changed since the last write. Returns true when it wrote. Throws on a
   * failed write.
   */
  flush(): boolean {
    const plan = this.plan();
    const gone = this.lastWritten;
    if (gone && !this.store.campaign.state?.sessions.some((x) => x.id === gone.id)) {
      // Its start was undone: the file would otherwise still claim a running session.
      this.lastWritten = null;
      if (plan?.file !== gone.file) {
        mkdirSync(path.dirname(gone.file), { recursive: true });
        writeAtomic(
          gone.file,
          `# Session ${gone.number}: undone\n\nThe GM undid the start of this session (${this.options.now()}); its events now belong to no session.\n`,
        );
        writeAtomic(
          gone.file.replace(/\.md$/, '.json'),
          `${JSON.stringify({ format: 'the-system/session-report', version: 1, writtenAt: this.options.now(), undone: true, number: gone.number }, null, 2)}\n`,
        );
        if (!plan || plan.key === this.writtenKey) return true;
      }
    }
    if (!plan || plan.key === this.writtenKey) return false;
    const campaign = this.store.campaign;
    // Fold the pre-session events once (and again only after an undo reaches
    // back into them), so a write costs the session's events, not the campaign's.
    if (
      this.base === null ||
      this.base.fromSeq !== plan.fromSeq ||
      !sessionLogBaseIsCurrent(campaign, this.base)
    ) {
      this.base = sessionLogBase(campaign, plan.fromSeq);
    }
    const log = buildSessionLog(campaign, plan.fromSeq, this.base, plan.toSeq);
    const text = renderSessionLog(log, {
      startedAt: plan.session.startedAt,
      writtenAt: this.options.now(),
      session: plan.session,
    });
    mkdirSync(path.dirname(plan.file), { recursive: true });
    writeAtomic(plan.file, text);
    // M9.1: the same log as JSON beside it, for Claude or other tools.
    writeAtomic(
      plan.file.replace(/\.md$/, '.json'),
      `${JSON.stringify(
        {
          format: 'the-system/session-report',
          version: 1,
          writtenAt: this.options.now(),
          session: plan.session,
          report: plan.session.endedAt !== null,
          ...log,
        },
        null,
        2,
      )}\n`,
    );
    this.writtenKey = plan.key;
    this.lastWritten = { id: plan.session.id, number: plan.session.number, file: plan.file };
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
