import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileDurable } from '../store';

// QF.62 (deep review persistence-8): the co-DM's JSON stores write through the
// durable helper (temp file, fsync, rename, fsync the folder), so a power cut
// cannot leave a renamed file empty; and a damaged file reads as one plain
// error that names it, instead of a bare JSON syntax error on every route.

/** Writes `value` as pretty JSON, durably, creating the folder. */
export function writeJsonFile(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileDurable(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** The message for a co-DM store that cannot be read; it is never overwritten (D241). */
export const damagedFile = (what: string, file: string): string =>
  `The ${what} file is damaged; move it aside to start over: ${file}`;

/** Parses a JSON file, or throws `damagedFile(what, file)` when it is not JSON. */
export function readJsonFile(file: string, what: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch {
    throw new Error(damagedFile(what, file));
  }
}
