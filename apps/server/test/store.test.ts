import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
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
  type StoreOptions,
} from '../src/store';

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
    const reopened = CampaignStore.open('main', options);
    expect(reopened.loadedFromSnapshot).toBe(true);
    expect(reopened.campaign).toEqual(before);
    rmSync(path.join(dataDir, 'campaigns', 'main', 'snapshot.json'));
    const replayed = CampaignStore.open('main', options);
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
    appendFileSync(logFile(), '{"id":"ev99","type":"character.ren');
    const reopened = CampaignStore.open('main', options);
    expect(reopened.repairedTornLine).toBe(true);
    expect(reopened.campaign).toEqual(before);
    expect(readFileSync(logFile(), 'utf8').endsWith('}\n')).toBe(true);
    play(
      reopened,
      [{ type: 'character.rename', characterId: 'jake', name: 'Jake T.' }],
      context('r'),
    );
    const again = CampaignStore.open('main', options);
    expect(again.repairedTornLine).toBe(false);
    expect(again.campaign.state?.characters.jake?.name).toBe('Jake T.');
    for (const s of [store, reopened, again]) s.close();
  });

  it('keeps a complete last event whose newline was lost', () => {
    const store = CampaignStore.open('main', options);
    const before = play(store, script);
    const text = readFileSync(logFile(), 'utf8');
    writeFileSync(logFile(), text.slice(0, -1));
    const reopened = CampaignStore.open('main', options);
    expect(reopened.repairedTornLine).toBe(true);
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
    for (const bad of ['', '../x', 'A', 'a/b', '.hidden', 'x'.repeat(65)]) {
      expect(() => checkCampaignId(bad)).toThrow(StoreError);
    }
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
    expect(json).not.toMatch(/token|secret|password|gmKey/i);
    expect(Object.keys(exported).sort()).toEqual([
      'campaignId',
      'events',
      'exportedAt',
      'format',
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
      completeTail: null,
    });
    expect(parseLogText('')).toEqual({ lines: [], goodBytes: 0, torn: false, completeTail: null });
  });

  it('reports a torn tail and its byte offset (multi-byte safe)', () => {
    expect(parseLogText('{"a":"é"}\n{"b":')).toEqual({
      lines: [{ a: 'é' }],
      goodBytes: 11,
      torn: true,
      completeTail: null,
    });
    expect(parseLogText('{"a":1}\n{"b":2}')).toEqual({
      lines: [{ a: 1 }, { b: 2 }],
      goodBytes: 8,
      torn: true,
      completeTail: '{"b":2}',
    });
  });

  it('throws on damage before the last line', () => {
    expect(() => parseLogText('{"a":1}\nnope\n{"b":2}\n')).toThrow(/line 2/);
  });
});
