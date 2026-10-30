import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { LiveHub } from '../src/hub';
import type { ServerMessage } from '../src/protocol';
import { CampaignStore } from '../src/store';
import { loreTags } from '../src/ai/quickResponses';

// MD.3 canary (DESIGN §11 "Lore stays GM-only"): a kept lore note, made and
// edited live by the GM, never reaches a player's phone or View-as pane.
let dataDir = '';
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

describe('kept lore is GM-only (MD.3)', () => {
  it('a lore note kept and edited live never reaches a player', () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-lore-'));
    const now = () => '2026-10-30T15:00:00.000Z';
    const store = CampaignStore.open('main', { dataDir, now });
    let n = 0;
    const ctx = { actor: { role: 'gm' as const }, sessionId: null, now, newId: () => `e${++n}` };
    for (const command of [
      { type: 'campaign.create', name: 'W', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
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
    ]) {
      const r = execute(store.campaign, command as never, ctx);
      if (!r.ok) throw new Error(r.error);
      store.appendAll(r.events);
    }
    const gmKey = 'k'.repeat(32);
    const hub = new LiveHub(store, { gmKey, now, newId: ctx.newId });
    const phone: ServerMessage[] = [];
    const jake = hub.connect((m) => phone.push(m));
    jake.receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'jake' }));
    const pane: ServerMessage[] = [];
    const viewAs = hub.connect((m) => pane.push(m));
    viewAs.receive(
      JSON.stringify({ type: 'join', role: 'player', characterId: 'jake', viewAs: true }),
    );
    const gm: ServerMessage[] = [];
    const gmConn = hub.connect((m) => gm.push(m));
    gmConn.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey }));

    const send = (requestId: string, command: Record<string, unknown>) =>
      gmConn.receive(JSON.stringify({ type: 'command', requestId, command }));
    send('k1', {
      type: 'note.create',
      noteId: 'lore-1',
      characterId: null,
      kind: 'gm',
      title: 'Old Tam',
      body: 'LORE-CANARY Tam owes the ferryman.',
      tags: loreTags({ npc: 'Old Tam', place: 'The Crown', session: 1 }),
    });
    send('k2', {
      type: 'note.edit',
      noteId: 'lore-1',
      characterId: null,
      body: 'LORE-CANARY-EDITED Tam owes the ferryman twice.',
    });
    expect(gm.filter((m) => m.type === 'result')).toEqual([
      { type: 'result', requestId: 'k1', ok: true },
      { type: 'result', requestId: 'k2', ok: true },
    ]);
    expect(JSON.stringify(gm)).toContain('LORE-CANARY-EDITED');
    expect(phone.some((m) => m.type === 'view')).toBe(true);
    for (const m of [...phone, ...pane]) {
      const json = JSON.stringify(m);
      expect(json).not.toContain('LORE-CANARY');
      expect(json).not.toContain('npc:Old Tam');
    }
    gmConn.close();
    jake.close();
    viewAs.close();
    store.close();
  });
});
