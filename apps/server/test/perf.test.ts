// M11.3 Performance: a 50,000-event log loads in under 3 s (full replay, no
// snapshot to help: the worst case after a lost or stale snapshot).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { bigCampaignLines } from '../../../scripts/big-campaign';
import { CampaignStore } from '../src/store';

export const PERF_EVENTS = 50_000;

const root = mkdtempSync(path.join(tmpdir(), 'the-system-perf-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('M11.3 performance', () => {
  it(`loads a ${PERF_EVENTS}-event log in under 3 s`, () => {
    const lines = bigCampaignLines(PERF_EVENTS);
    const dir = path.join(root, 'campaigns', 'long');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'events.jsonl'), `${lines.join('\n')}\n`);
    const started = performance.now();
    const store = CampaignStore.open('long', {
      dataDir: root,
      now: () => new Date().toISOString(),
    });
    const ms = performance.now() - started;
    console.log(`M11.3: ${lines.length} events loaded in ${ms.toFixed(0)} ms`);
    expect(store.campaign.events).toHaveLength(lines.length);
    expect(store.loadedFromSnapshot).toBe(false);
    store.close();
    expect(ms).toBeLessThan(3000);
  }, 120_000);
});
