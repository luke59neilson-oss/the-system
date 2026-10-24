// M11.2 Recovery: simulated power loss on the event log. A power cut can stop
// the log at any byte (D42 fsyncs each append, so only the end is at risk),
// can leave the snapshot ahead of or behind the log, and can leave a
// half-written snapshot temp file. Reopening must always succeed with exactly
// the complete events, keep the cut bytes beside the log, and keep working.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute, type Command, type CommandContext } from '@the-system/engine';
import { CampaignStore, type StoreOptions } from '../src/store';

export const RECOVERY_SEED = 0x5eed_1102;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const kit = [
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic Stealth', rarity: 'inferior' },
  { name: 'Archer’s Eye', rarity: 'common' },
];

function context(prefix: string): CommandContext {
  let tick = 0;
  let id = 0;
  return {
    actor: { role: 'gm' },
    sessionId: 's1',
    now: () => new Date(Date.UTC(2026, 9, 21, 12) + 1000 * tick++).toISOString(),
    newId: () => `${prefix}${++id}`,
  };
}

function play(store: CampaignStore, commands: Command[], ctx: CommandContext): void {
  for (const command of commands) {
    const result = execute(store.campaign, command, ctx);
    if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
    store.appendAll(result.events);
  }
}

/** A session's worth of events, with non-ASCII text so cuts land inside characters. */
const script: Command[] = [
  {
    type: 'campaign.create',
    name: 'Wal · Baleine',
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
  },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'zoe', name: 'Zoë', className: 'Archer', classSkills: kit },
];
for (let i = 0; i < 24; i++) {
  script.push(
    i % 3 === 0
      ? { type: 'character.rename', characterId: 'zoe', name: `Zoë ${i} — Ünïcode ✦` }
      : i % 3 === 1
        ? {
            type: 'xp.award',
            track: 'class',
            amount: 30 + i,
            participants: [{ characterId: 'jake' }, { characterId: 'zoe' }],
          }
        : { type: 'system.broadcast', text: `Notice ${i}: café, 鯨, 🐋`, characterIds: null },
  );
}

let root: string;
/** The campaign directory of the session that "lost power" (no close()). */
let source: string;
let log: Buffer;
/** Byte offset where each complete line ends (after its newline). */
let lineEnds: number[];
const prefixState = new Map<number, unknown>();

const options = (dataDir: string): StoreOptions => ({
  dataDir,
  now: () => '2026-10-24T00:00:00.000Z',
  isAlive: () => false, // The process that held the lock is gone.
  snapshotEvery: 10,
});

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'the-system-recovery-'));
  const live = path.join(root, 'live');
  const store = CampaignStore.open('main', options(live));
  play(store, script, context('ev'));
  // No close(): the power went. The snapshot was last written at event 20.
  source = store.dir;
  log = readFileSync(path.join(source, 'events.jsonl'));
  lineEnds = [];
  for (let i = 0; i < log.length; i++) if (log[i] === 0x0a) lineEnds.push(i + 1);
  expect(lineEnds).toHaveLength(script.length);
  // The state after each complete prefix, from a clean replay without snapshot.
  for (let k = 0; k <= script.length; k++) {
    const dir = path.join(root, `prefix-${k}`, 'campaigns', 'main');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'events.jsonl'), log.subarray(0, k === 0 ? 0 : lineEnds[k - 1]));
    const s = CampaignStore.open('main', options(path.join(root, `prefix-${k}`)));
    prefixState.set(k, s.campaign);
    s.close();
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Copies the dead session's campaign (log, snapshot, stale LOCK) and cuts its log at `cut`. */
function powerCut(cut: number, name: string): string {
  const dataDir = path.join(root, name);
  const dir = path.join(dataDir, 'campaigns', 'main');
  cpSync(source, dir, { recursive: true });
  truncateSync(path.join(dir, 'events.jsonl'), cut);
  return dataDir;
}

describe('M11.2 power loss on the event log', () => {
  it('the dead session left its lock and a snapshot behind', () => {
    expect(existsSync(path.join(source, 'LOCK'))).toBe(true);
    expect(existsSync(path.join(source, 'snapshot.json'))).toBe(true);
  });

  it(`recovers from a cut at any byte (every byte of the last event, 60 more from seed ${RECOVERY_SEED})`, () => {
    const random = rng(RECOVERY_SEED);
    const tailStart = lineEnds[lineEnds.length - 2] ?? 0;
    const cuts = new Set<number>();
    for (let b = tailStart; b <= log.length; b++) cuts.add(b);
    for (let i = 0; i < 60; i++) cuts.add(Math.floor(random() * (log.length + 1)));
    cuts.add(0);
    let n = 0;
    const loads = { snapshot: 0, replay: 0 };
    for (const cut of [...cuts].sort((a, b) => a - b)) {
      const label = `seed ${RECOVERY_SEED} cut at byte ${cut} of ${log.length}`;
      const dataDir = powerCut(cut, `cut-${n++}`);
      const dir = path.join(dataDir, 'campaigns', 'main');
      // A half-written snapshot temp file from the moment of the cut.
      writeFileSync(path.join(dir, 'snapshot.json.tmp-424242'), '{"format":1,"sta');
      const whole = lineEnds.filter((end) => end <= cut).length;
      const wholeEnd = whole === 0 ? 0 : (lineEnds[whole - 1] as number);
      // A cut just before an event's newline leaves that event whole; the store
      // keeps it and adds the newline (D42's complete tail).
      const onlyNewlineLost = cut === (lineEnds[whole] ?? -1) - 1;
      const complete = whole + (onlyNewlineLost ? 1 : 0);
      const repairedLength = onlyNewlineLost ? (lineEnds[whole] as number) : wholeEnd;
      const store = CampaignStore.open('main', options(dataDir));
      try {
        expect(store.campaign, label).toEqual(prefixState.get(complete));
        // A snapshot ahead of the cut log is never used (D42).
        if (store.loadedFromSnapshot) expect(complete, label).toBeGreaterThanOrEqual(20);
        loads[store.loadedFromSnapshot ? 'snapshot' : 'replay']++;
        if (cut === wholeEnd) {
          expect(store.tornCopy, label).toBeNull();
        } else {
          // The cut bytes are kept, byte for byte, never just deleted.
          expect(store.tornCopy, label).not.toBeNull();
          expect(
            readFileSync(store.tornCopy ?? '').equals(log.subarray(wholeEnd, cut)),
            label,
          ).toBe(true);
        }
        expect(readFileSync(path.join(dir, 'events.jsonl')).length, label).toBe(repairedLength);
        expect(
          readFileSync(path.join(dir, 'events.jsonl')).equals(log.subarray(0, repairedLength)),
          label,
        ).toBe(true);
      } finally {
        store.close();
      }
      rmSync(dataDir, { recursive: true, force: true });
    }
    expect(cuts.size).toBeGreaterThan(100);
    // Both paths ran: the snapshot plus the log's tail, and a full replay.
    expect(loads.snapshot).toBeGreaterThan(0);
    expect(loads.replay).toBeGreaterThan(0);
  }, 60_000);

  it('keeps working after recovery: new events append, and a clean reopen keeps them', () => {
    const cut = (lineEnds[lineEnds.length - 1] as number) - 7; // inside the last event
    const dataDir = powerCut(cut, 'resume');
    const store = CampaignStore.open('main', options(dataDir));
    expect(store.campaign.events).toHaveLength(script.length - 1);
    play(
      store,
      [{ type: 'character.rename', characterId: 'jake', name: 'Jake, après' }],
      context('after'),
    );
    const after = store.campaign;
    store.close();
    const again = CampaignStore.open('main', { ...options(dataDir), isAlive: () => true });
    expect(again.tornCopy).toBeNull();
    expect(again.campaign).toEqual(after);
    expect(again.campaign.state?.characters['jake']?.name).toBe('Jake, après');
    again.close();
    // The single torn copy from the first reopen is still beside the log.
    const dir = path.join(dataDir, 'campaigns', 'main');
    expect(readdirSync(dir).filter((f) => f.startsWith('events.jsonl.torn-'))).toHaveLength(1);
  });
});
