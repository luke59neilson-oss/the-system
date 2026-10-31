import { appendFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

/** The server's error log in the data folder (QF.43): the desktop app has no console. */
export const serverLogFile = (dataDir: string) => path.join(dataDir, 'server.log');

/** Default size at which `server.log` is moved to `server.log.1` (one old copy kept). */
export const SERVER_LOG_MAX_BYTES = 1_000_000;

/**
 * A line sink for the server's logger that appends to `file` and keeps it
 * under `maxBytes` (the previous file is kept as `<file>.1`). Logging never
 * throws: a log that cannot be written is not worth stopping a session for.
 */
export function cappedLogStream(
  file: string,
  maxBytes = SERVER_LOG_MAX_BYTES,
): { write(line: string): void } {
  return {
    write(line: string) {
      try {
        if (existsSync(file) && statSync(file).size + Buffer.byteLength(line) > maxBytes) {
          rmSync(`${file}.1`, { force: true });
          renameSync(file, `${file}.1`);
        }
        appendFileSync(file, line);
      } catch {
        // Best effort.
      }
    },
  };
}
