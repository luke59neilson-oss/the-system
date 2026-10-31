// QF.54 probe: at a 40-session campaign (about 13k events) undoing the
// newest event blocks the event loop for under 300 ms, sends players a small
// frame, not a whole-history reset, and the GM's change log follows it
// without a rebuild.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { updateChangeLog } from '@the-system/engine';
import { BIG_HEROES, bigCampaignLines } from '../../../scripts/big-campaign';
import { LiveHub } from '../src/hub';
import { CampaignStore } from '../src/store';

const GM_KEY = 'k'.repeat(32);
const root = mkdtempSync(path.join(tmpdir(), 'the-system-undostall-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('QF.54 probe (13k events)', () => {
  it('undo of the newest event: < 300 ms and small player frames', { timeout: 120_000 }, () => {
    const dir = path.join(root, 'campaigns', 'long');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'events.jsonl'), `${bigCampaignLines(13_000).join('\n')}\n`);
    let ms = Date.UTC(2027, 0, 1);
    const now = () => new Date((ms += 1000)).toISOString();
    const store = CampaignStore.open('long', { dataDir: root, now });
    let n = 0;
    const hub = new LiveHub(store, { gmKey: GM_KEY, now, newId: () => `u${++n}` });
    const sizes: number[] = [];
    const gm = hub.connect(() => undefined);
    gm.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey: GM_KEY, lastSeq: 0 }));
    const phone = hub.connect((m, raw) => sizes.push(Buffer.byteLength(raw ?? JSON.stringify(m))));
    phone.receive(
      JSON.stringify({ type: 'join', role: 'player', characterId: BIG_HEROES[0], lastSeq: 0 }),
    );
    let req = 0;
    const command = (c: object) =>
      gm.receive(JSON.stringify({ type: 'command', requestId: `r${++req}`, command: c }));
    command({ type: 'system.broadcast', text: 'to undo', characterIds: null });
    const last = store.campaign.events[store.campaign.events.length - 1]!;
    const log = updateChangeLog(null, store.campaign);
    sizes.length = 0;
    const start = performance.now();
    command({ type: 'event.undo', eventId: last.id });
    const after = updateChangeLog(log, store.campaign);
    const took = performance.now() - start;
    expect(after.rows[0]).toBe(log.rows[0]);
    expect(after.rows.at(-1)?.undoneBy).not.toBeNull();
    expect(took).toBeLessThan(300);
    expect(Math.max(...sizes)).toBeLessThan(150 * 1024);
  });
});
