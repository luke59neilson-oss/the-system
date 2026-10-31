import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RULES, execute, type Command } from '@the-system/engine';
import { CampaignStore, type StoreOptions } from '../src/store';
import { cappedLogStream } from '../src/serverLog';

// QF.43: backups always happen, and hold everything.

let dataDir: string;
let options: StoreOptions;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-qf43-'));
  let clock = 0;
  options = {
    dataDir,
    now: () => new Date(Date.UTC(2026, 9, 31, 18) + 1000 * clock++).toISOString(),
    snapshotEvery: 1,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dataDir, { recursive: true, force: true });
});

let n = 0;
function rename(store: CampaignStore, times: number) {
  for (let i = 0; i < times; i++) {
    const command: Command = { type: 'character.rename', characterId: 'jake', name: `Jake ${i}` };
    const result = execute(store.campaign, command, {
      actor: { role: 'gm' },
      sessionId: null,
      now: () => '2026-10-31T12:00:00.000Z',
      newId: () => `r${++n}`,
    });
    if (!result.ok) throw new Error(result.error);
    store.appendAll(result.events);
  }
}

function started(): CampaignStore {
  const store = CampaignStore.open('main', options);
  const setup: Command[] = [
    { type: 'campaign.create', name: 'Whale', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
    {
      type: 'character.create',
      id: 'jake',
      name: 'Jake',
      className: 'Archer',
      classSkills: [
        { name: 'Basic Archery', rarity: 'inferior' },
        { name: 'Basic Stealth', rarity: 'inferior' },
        { name: 'Archer’s Eye', rarity: 'common' },
      ],
    },
  ];
  for (const command of setup) {
    const result = execute(store.campaign, command, {
      actor: { role: 'gm' },
      sessionId: null,
      now: () => '2026-10-31T12:00:00.000Z',
      newId: () => `s${++n}`,
    });
    if (!result.ok) throw new Error(result.error);
    store.appendAll(result.events);
  }
  return store;
}

describe('backups (QF.43)', () => {
  it('copies the log and the previous snapshot when the snapshot cannot be written', () => {
    const store = started();
    const snapshot = path.join(store.dir, 'snapshot.json');
    const previous = readFileSync(snapshot, 'utf8');
    // The snapshot's temp file cannot be created (a folder sits where it goes).
    mkdirSync(path.join(store.dir, `snapshot.json.tmp-${process.pid}`));
    let target = '';
    expect(() => (target = store.backup('quit'))).not.toThrow();
    expect(readFileSync(path.join(target, 'events.jsonl'), 'utf8')).toBe(
      readFileSync(path.join(store.dir, 'events.jsonl'), 'utf8'),
    );
    expect(readFileSync(path.join(target, 'snapshot.json'), 'utf8')).toBe(previous);
    store.close();
  });

  it('a snapshot.json that is not a file is left out, and the log still goes', () => {
    const store = started();
    const snapshot = path.join(store.dir, 'snapshot.json');
    rmSync(snapshot);
    mkdirSync(snapshot);
    const target = store.backup('quit');
    expect(existsSync(path.join(target, 'events.jsonl'))).toBe(true);
    expect(existsSync(path.join(target, 'snapshot.json'))).toBe(false);
    store.close();
  });

  it('a failing snapshot is retried at most 3 times in 20 appends', () => {
    const store = started();
    const snapshot = path.join(store.dir, 'snapshot.json');
    rmSync(snapshot);
    mkdirSync(snapshot); // Every snapshot write now fails at the rename.
    let attempts = 0;
    const original = store.writeSnapshot.bind(store);
    vi.spyOn(store, 'writeSnapshot').mockImplementation(() => {
      attempts++;
      original();
    });
    rename(store, 20);
    expect(attempts).toBeGreaterThan(0);
    expect(attempts).toBeLessThanOrEqual(3);
    // Once it can be written again, it is (and the back-off resets).
    rmSync(snapshot, { recursive: true });
    rename(store, 64);
    expect(statSync(snapshot).isFile()).toBe(true);
    store.close();
  });

  it('holds the co-DM folder and the transcripts, never the voice prints', () => {
    const store = started();
    for (const [folder, file] of [
      ['codm', 'notes-01.json'],
      ['transcripts', 'session-01.jsonl'],
      ['speakers', 'jake.json'],
    ] as const) {
      mkdirSync(path.join(store.dir, folder, 'sub'), { recursive: true });
      writeFileSync(path.join(store.dir, folder, file), `${folder}!`);
      writeFileSync(path.join(store.dir, folder, 'sub', 'x.txt'), 'deep');
    }
    const target = store.backup('session-1-end');
    expect(readFileSync(path.join(target, 'codm', 'notes-01.json'), 'utf8')).toBe('codm!');
    expect(readFileSync(path.join(target, 'codm', 'sub', 'x.txt'), 'utf8')).toBe('deep');
    expect(readFileSync(path.join(target, 'transcripts', 'session-01.jsonl'), 'utf8')).toBe(
      'transcripts!',
    );
    expect(existsSync(path.join(target, 'speakers'))).toBe(false);
    store.close();
  });
});

describe('server.log (QF.43)', () => {
  it('appends lines and keeps one old copy under the cap', () => {
    const file = path.join(dataDir, 'server.log');
    const log = cappedLogStream(file, 100);
    for (let i = 0; i < 12; i++)
      log.write(`line ${String(i).padStart(2, '0')} ${'x'.repeat(20)}\n`);
    expect(statSync(file).size).toBeLessThanOrEqual(100);
    expect(statSync(`${file}.1`).size).toBeLessThanOrEqual(100);
    expect(readFileSync(file, 'utf8')).toContain('line 11');
    expect(existsSync(`${file}.2`)).toBe(false);
  });

  it('never throws when the log cannot be written', () => {
    mkdirSync(path.join(dataDir, 'server.log'));
    expect(() =>
      cappedLogStream(path.join(dataDir, 'server.log'), 10).write('boom\n'),
    ).not.toThrow();
  });
});
