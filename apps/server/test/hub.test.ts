import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { LiveHub } from '../src/hub';
import type { ServerMessage } from '../src/protocol';
import { CampaignStore } from '../src/store';

let dataDir = '';
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

describe('LiveHub', () => {
  it('flags a gap when lastSeq predates this hub, and resets the role on a failed join', () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-hub-'));
    const store = CampaignStore.open('main', { dataDir, now: () => '2026-10-21T00:00:00.000Z' });
    let n = 0;
    const ctx = {
      actor: { role: 'gm' as const },
      sessionId: null,
      now: () => '2026-10-21T00:00:00.000Z',
      newId: () => `e${++n}`,
    };
    const created = execute(
      store.campaign,
      { type: 'campaign.create', name: 'W', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
      ctx,
    );
    if (!created.ok) throw new Error(created.error);
    store.appendAll(created.events);
    const hub = new LiveHub(store, { gmKey: 'k'.repeat(32), now: ctx.now, newId: ctx.newId });
    const got: ServerMessage[] = [];
    const conn = hub.connect((m) => got.push(m));
    conn.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey: 'k'.repeat(32), lastSeq: 0 }));
    expect(got.find((m) => m.type === 'notifications')).toMatchObject({ items: [], gap: true });
    // A failed re-join drops the GM role.
    conn.receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'ghost' }));
    conn.receive(
      JSON.stringify({
        type: 'command',
        requestId: 'r1',
        command: { type: 'character.rename', characterId: 'x', name: 'y' },
      }),
    );
    expect(got[got.length - 1]).toMatchObject({ type: 'result', ok: false, error: 'Join first' });
    conn.close();
    store.close();
  });
});
