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
  it('sends the history from before this hub started, and resets the role on a failed join', () => {
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
    for (const command of [
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
      { type: 'xp.award', track: 'class', amount: 1000, participants: [{ characterId: 'jake' }] },
    ]) {
      const r = execute(store.campaign, command as never, ctx);
      if (!r.ok) throw new Error(r.error);
      store.appendAll(r.events);
    }
    const hub = new LiveHub(store, { gmKey: 'k'.repeat(32), now: ctx.now, newId: ctx.newId });
    const got: ServerMessage[] = [];
    const conn = hub.connect((m) => got.push(m));
    conn.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey: 'k'.repeat(32), lastSeq: 0 }));
    // The hub started after the level-up; the history still has it (no gaps, M3.3).
    const first = got.find((m) => m.type === 'notifications');
    expect(first?.type === 'notifications' && first.items.length).toBeGreaterThan(0);
    expect(first).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          seq: 3,
          day: 1,
          at: '2026-10-21T00:00:00.000Z',
          notification: expect.objectContaining({ kind: 'level', characterId: 'jake' }),
        }),
      ]),
    });
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

describe('LiveHub notes privacy (M1.8)', () => {
  it("never sends the GM a player's unshared journal entry, live or after sharing", () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-hub-'));
    const store = CampaignStore.open('main', { dataDir, now: () => '2026-10-21T00:00:00.000Z' });
    let n = 0;
    const now = () => '2026-10-21T00:00:00.000Z';
    const gm = { actor: { role: 'gm' as const }, sessionId: null, now, newId: () => `e${++n}` };
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
    ] as const) {
      const result = execute(store.campaign, command, gm);
      if (!result.ok) throw new Error(result.error);
      store.appendAll(result.events);
    }
    const hub = new LiveHub(store, { gmKey: 'k'.repeat(32), now, newId: () => `h${++n}` });
    const toGm: string[] = [];
    const gmConn = hub.connect((m) => toGm.push(JSON.stringify(m)));
    gmConn.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey: 'k'.repeat(32), lastSeq: 0 }));
    const toJake: ServerMessage[] = [];
    const jake = hub.connect((m) => toJake.push(m));
    jake.receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'jake' }));
    const send = (requestId: string, command: unknown) =>
      jake.receive(JSON.stringify({ type: 'command', requestId, command }));
    send('r1', {
      type: 'note.create',
      noteId: 'n1',
      characterId: 'jake',
      kind: 'journal',
      title: 'SECRET-TITLE',
      body: 'SECRET-BODY',
    });
    expect(toJake.find((m) => m.type === 'result')).toMatchObject({ ok: true });
    expect(toGm.some((m) => m.includes('SECRET'))).toBe(false);
    expect(store.campaign.state?.notes['n1']?.body).toBe('SECRET-BODY');
    // The GM cannot edit it into view either.
    gmConn.receive(
      JSON.stringify({
        type: 'command',
        requestId: 'g1',
        command: { type: 'note.edit', noteId: 'n1', characterId: null, shareable: true },
      }),
    );
    expect(toGm.some((m) => m.includes('SECRET'))).toBe(false);
    // Once the player shares it, the GM gets it.
    send('r2', { type: 'note.edit', noteId: 'n1', characterId: 'jake', shareable: true });
    expect(toGm[toGm.length - 1]).toContain('SECRET-BODY');
    gmConn.close();
    jake.close();
    store.close();
  });
});
