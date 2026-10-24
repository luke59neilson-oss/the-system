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
    // An undo while Jake's phone was offline: rejoining replaces his history.
    const awardId = store.campaign.events[2]?.id;
    conn.receive(
      JSON.stringify({
        type: 'command',
        requestId: 'u1',
        command: { type: 'event.undo', eventId: awardId },
      }),
    );
    expect(got.find((m) => m.type === 'result' && m.requestId === 'u1')).toMatchObject({
      ok: true,
    });
    const phone: ServerMessage[] = [];
    const back = hub.connect((m) => phone.push(m));
    back.receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'jake', lastSeq: 3 }));
    const replaced = phone.find((m) => m.type === 'notifications');
    expect(replaced).toMatchObject({ reset: true });
    expect(replaced?.type === 'notifications' && replaced.items).toEqual([]);
    // Up to date: no reset, nothing new.
    const fresh: ServerMessage[] = [];
    const later = hub.connect((m) => fresh.push(m));
    later.receive(
      JSON.stringify({ type: 'join', role: 'player', characterId: 'jake', lastSeq: hub.seq }),
    );
    expect(fresh.find((m) => m.type === 'notifications')).toEqual({
      type: 'notifications',
      items: [],
    });
    back.close();
    later.close();
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
    // The server picked the id (M3.10), not the player.
    const id = store.campaign.state?.noteOrder[0] ?? '';
    expect(id).not.toBe('n1');
    expect(store.campaign.state?.notes[id]?.body).toBe('SECRET-BODY');
    // The GM cannot edit it into view either.
    gmConn.receive(
      JSON.stringify({
        type: 'command',
        requestId: 'g1',
        command: { type: 'note.edit', noteId: id, characterId: null, shareable: true },
      }),
    );
    expect(toGm.some((m) => m.includes('SECRET'))).toBe(false);
    // Once the player shares it, the GM gets it.
    send('r2', { type: 'note.edit', noteId: id, characterId: 'jake', shareable: true });
    expect(toGm[toGm.length - 1]).toContain('SECRET-BODY');
    gmConn.close();
    jake.close();
    store.close();
  });

  it('generates note ids for players; View-as panes are read-only and omit unshared journals (M3.10)', () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-hub-'));
    const store = CampaignStore.open('main', { dataDir, now: () => '2026-10-21T00:00:00.000Z' });
    let n = 0;
    const ctx = {
      actor: { role: 'gm' as const },
      sessionId: null,
      now: () => '2026-10-21T00:00:00.000Z',
      newId: () => `e${++n}`,
    };
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
      { type: 'note.create', noteId: 'gm-1', characterId: null, kind: 'gm', body: 'GM-SECRET' },
    ]) {
      const r = execute(store.campaign, command as never, ctx);
      if (!r.ok) throw new Error(r.error);
      store.appendAll(r.events);
    }
    const hub = new LiveHub(store, { gmKey: 'k'.repeat(32), now: ctx.now, newId: ctx.newId });
    const phone: ServerMessage[] = [];
    const jake = hub.connect((m) => phone.push(m));
    jake.receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'jake' }));
    const create = (requestId: string, noteId: string, shareable: boolean) =>
      jake.receive(
        JSON.stringify({
          type: 'command',
          requestId,
          command: {
            type: 'note.create',
            noteId,
            characterId: 'jake',
            kind: 'journal',
            body: `PRIVATE-${requestId}`,
            shareable,
          },
        }),
      );
    // A chosen id that collides with a GM note is ignored, not an existence probe.
    create('c1', 'gm-1', false);
    create('c2', 'mine', true);
    const results = phone.filter((m) => m.type === 'result');
    expect(results).toEqual([
      { type: 'result', requestId: 'c1', ok: true },
      { type: 'result', requestId: 'c2', ok: true },
    ]);
    const notes = store.campaign.state?.notes ?? {};
    expect(Object.keys(notes).sort()).not.toContain('mine');
    expect(notes['gm-1']?.body).toBe('GM-SECRET');
    // The GM's View-as pane: the shared entry only, and no commands.
    const pane: ServerMessage[] = [];
    const frame = hub.connect((m) => pane.push(m));
    frame.receive(
      JSON.stringify({ type: 'join', role: 'player', characterId: 'jake', viewAs: true }),
    );
    const view = pane.filter((m) => m.type === 'view').at(-1);
    const json = JSON.stringify(view);
    expect(json).toContain('PRIVATE-c2');
    expect(json).not.toContain('PRIVATE-c1');
    expect(json).not.toContain('GM-SECRET');
    frame.receive(
      JSON.stringify({
        type: 'command',
        requestId: 'p1',
        command: { type: 'note.create', characterId: 'jake', kind: 'journal', body: 'x' },
      }),
    );
    expect(pane.find((m) => m.type === 'result')).toMatchObject({ ok: false, requestId: 'p1' });
    // Jake's own phone still gets both entries.
    expect(JSON.stringify(phone.filter((m) => m.type === 'view').at(-1))).toContain('PRIVATE-c1');
  });
});

describe('LiveHub scheduled broadcasts (M4.7)', () => {
  it('sends nothing of a schedule to players, delivers it live on its day, and takes it back on undo', () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-hub-'));
    const now = () => '2026-10-21T00:00:00.000Z';
    const store = CampaignStore.open('main', { dataDir, now });
    let n = 0;
    const gm = { actor: { role: 'gm' as const }, sessionId: null, now, newId: () => `e${++n}` };
    const kit = [
      { name: 'Basic Archery', rarity: 'inferior' },
      { name: 'Basic Stealth', rarity: 'inferior' },
      { name: 'Archer’s Eye', rarity: 'common' },
    ];
    for (const command of [
      { type: 'campaign.create', name: 'W', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
      { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
    ]) {
      const r = execute(store.campaign, command as never, gm);
      if (!r.ok) throw new Error(r.error);
      store.appendAll(r.events);
    }
    const SECRET = 'Ambush at dawn';
    const hub = new LiveHub(store, { gmKey: 'k'.repeat(32), now, newId: gm.newId });
    const gmOut: ServerMessage[] = [];
    const gmConn = hub.connect((m) => gmOut.push(m));
    gmConn.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey: 'k'.repeat(32), lastSeq: 0 }));
    const kimOut: string[] = [];
    const kim = hub.connect((m) => kimOut.push(JSON.stringify(m)));
    kim.receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'kim', lastSeq: 0 }));
    const jakeOut: string[] = [];
    const jake = hub.connect((m) => jakeOut.push(JSON.stringify(m)));
    jake.receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'jake', lastSeq: 0 }));
    const command = (requestId: string, c: Record<string, unknown>) => {
      gmConn.receive(JSON.stringify({ type: 'command', requestId, command: c }));
      expect(gmOut.find((m) => m.type === 'result' && m.requestId === requestId)).toMatchObject({
        ok: true,
      });
    };
    command('s1', {
      type: 'broadcast.schedule',
      id: 'amb',
      text: SECRET,
      characterIds: ['kim'],
      day: 2,
    });
    expect(kimOut.join('\n')).not.toContain(SECRET);
    expect(jakeOut.join('\n')).not.toContain(SECRET);
    const seqBefore = hub.seq;
    command('d1', { type: 'campaign.advanceDay' });
    const live = kimOut.map((m) => JSON.parse(m) as ServerMessage);
    expect(
      live.some(
        (m) =>
          m.type === 'notifications' &&
          m.items.some(
            (i) => i.notification.kind === 'broadcast' && i.notification.text === SECRET,
          ),
      ),
    ).toBe(true);
    expect(jakeOut.join('\n')).not.toContain(SECRET);
    // Kim's phone reconnects from before the day: the message is in the catch-up.
    const phone: ServerMessage[] = [];
    const back = hub.connect((m) => phone.push(m));
    back.receive(
      JSON.stringify({ type: 'join', role: 'player', characterId: 'kim', lastSeq: seqBefore }),
    );
    expect(JSON.stringify(phone.find((m) => m.type === 'notifications'))).toContain(SECRET);
    back.close();
    // Undoing the day takes the message back: a rejoin gets a history without it.
    const dayId = store.campaign.events.at(-1)?.id;
    command('u1', { type: 'event.undo', eventId: dayId });
    expect(store.campaign.state?.scheduledBroadcasts.map((b) => b.id)).toEqual(['amb']);
    const again: ServerMessage[] = [];
    const rejoin = hub.connect((m) => again.push(m));
    rejoin.receive(
      JSON.stringify({ type: 'join', role: 'player', characterId: 'kim', lastSeq: hub.seq }),
    );
    const view = again.find((m) => m.type === 'view');
    expect(JSON.stringify(view)).not.toContain(SECRET);
    const reset: ServerMessage[] = [];
    const fromStart = hub.connect((m) => reset.push(m));
    fromStart.receive(
      JSON.stringify({ type: 'join', role: 'player', characterId: 'kim', lastSeq: 0 }),
    );
    expect(JSON.stringify(reset)).not.toContain(SECRET);
    for (const c of [rejoin, fromStart, kim, jake, gmConn]) c.close();
    store.close();
  });
});

describe('LiveHub loot randomness (QF.21)', () => {
  it('rolls loot from a real random source when none is injected', () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-hub-'));
    const store = CampaignStore.open('main', { dataDir, now: () => '2026-10-24T00:00:00.000Z' });
    let n = 0;
    const now = () => '2026-10-24T00:00:00.000Z';
    const gm = { actor: { role: 'gm' as const }, sessionId: null, now, newId: () => `e${++n}` };
    for (const command of [
      { type: 'campaign.create', name: 'W', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
      {
        type: 'lootTable.define',
        id: 'purse',
        name: 'Purse',
        rolls: 1,
        entries: [
          { kind: 'currency', weight: 1, min: 1, max: 1_000_000 },
          { kind: 'nothing', weight: 1 },
        ],
      },
    ]) {
      const result = execute(store.campaign, command as never, gm);
      if (!result.ok) throw new Error(result.error);
      store.appendAll(result.events);
    }
    // No `random` option: the hub's own (OS) source picks.
    const hub = new LiveHub(store, { gmKey: 'k'.repeat(32), now, newId: () => `h${++n}` });
    const got: ServerMessage[] = [];
    const conn = hub.connect((m) => got.push(m));
    conn.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey: 'k'.repeat(32), lastSeq: 0 }));
    for (let i = 0; i < 40; i++) {
      conn.receive(
        JSON.stringify({
          type: 'command',
          requestId: `r${i}`,
          command: { type: 'loot.roll', tableId: 'purse' },
        }),
      );
    }
    expect(got.filter((m) => m.type === 'result' && m.ok).length).toBe(40);
    const picks = store.campaign.events
      .filter((e) => e.type === 'loot.rolled')
      .map((e) => (e.payload as { picks: { entry: number; count: number }[] }).picks[0]);
    expect(picks).toHaveLength(40);
    const entries = new Set(picks.map((p) => p?.entry));
    // Both entries come up (each misses all 40 with odds 2^-40).
    expect(entries).toEqual(new Set([0, 1]));
    const counts = picks.filter((p) => p?.entry === 0).map((p) => p?.count ?? 0);
    for (const c of counts) expect(c >= 1 && c <= 1_000_000).toBe(true);
    // A fixed source would repeat one count across a million-wide range.
    expect(new Set(counts).size).toBeGreaterThan(1);
    conn.close();
    store.close();
  });
});
