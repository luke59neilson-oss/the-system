import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readJsonFile, writeJsonFile } from '../src/ai/jsonFile';
import { DraftStore } from '../src/ai/practiceDrafts';

// QF.62: co-DM JSON stores write durably and name a damaged file.
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'jsonfile-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('co-DM JSON files (QF.62)', () => {
  it('writes whole files into a new folder and leaves no temp file', () => {
    const dir = path.join(tmp(), 'codm');
    const file = path.join(dir, 'x.json');
    writeJsonFile(file, { a: 1 });
    writeJsonFile(file, { a: 2 });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ a: 2 });
    expect(readdirSync(dir)).toEqual(['x.json']);
  });

  it('a short or empty file reads as damaged, naming it', () => {
    const file = path.join(tmp(), 'x.json');
    writeFileSync(file, '');
    expect(() => readJsonFile(file, 'suggestions')).toThrow(
      `The suggestions file is damaged; move it aside to start over: ${file}`,
    );
    writeFileSync(file, '{"chips": [');
    expect(() => readJsonFile(file, 'suggestions')).toThrow('is damaged');
  });

  it('a store over an empty file says which file to move aside and never overwrites it', () => {
    const dir = tmp();
    const store = new DraftStore(dir);
    store.add(1, 0, []);
    const file = readdirSync(dir).map((f) => path.join(dir, f))[0]!;
    writeFileSync(file, '');
    expect(() => store.list()).toThrow(`The practice drafts file is damaged`);
    expect(() => store.list()).toThrow(file);
    expect(() => store.add(1, 2, [])).toThrow('is damaged');
    expect(readFileSync(file, 'utf8')).toBe('');
  });
});
