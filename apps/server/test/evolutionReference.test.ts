import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  defaultRules,
  scaleShape,
  type ShapeReferenceRow,
} from '@the-system/engine';
import { LiveHub } from '../src/hub';
import type { ServerMessage } from '../src/protocol';
import { newGmKey } from '../src/security';
import { createServer } from '../src/server';
import { CampaignStore } from '../src/store';
import { csvRecords } from '../src/reference/csv';
import { REFERENCE_CSV } from '../src/reference/lists.generated';
import { evolutionReference, parseEvolutionReference } from '../src/reference/evolutions';

// ME.4 (DESIGN §4 "Reference while building"): the books' evolution options,
// embedded by `npm run reference`, and Use this shape on every one of them.
const file = path.resolve(
  import.meta.dirname,
  '../../../docs/reference/primal-hunter/evolutions.csv',
);

describe("the books' evolution options (ME.4)", () => {
  it('the embedded list matches docs/reference (run `npm run reference` after editing)', () => {
    expect(REFERENCE_CSV.evolutions).toBe(readFileSync(file, 'utf8'));
  });

  it('parses every row with its stats, free points and total', () => {
    const rows = evolutionReference();
    expect(rows.length).toBe(csvRecords(REFERENCE_CSV.evolutions).length);
    for (const r of rows) {
      expect(Object.values(r.stats).reduce((a, b) => a + b, 0) + r.free, r.name).toBe(r.total);
    }
    expect(rows[0]).toMatchObject({
      source: 'books',
      track: 'class',
      name: 'Archer',
      stats: { strength: 1, agility: 1, endurance: 1, perception: 2 },
      free: 1,
      total: 6,
    });
    expect(rows[0]!.note).toBe('G · start · Jake Thayne');
  });

  it('skips rows with no name, an unknown track or no points', () => {
    const csv = 'name,track,str,free\n,class,1,1\nX,weapon,1,1\nY,race,0,0\nZ,race,2,1\n';
    expect(parseEvolutionReference(csv).map((r) => r.name)).toEqual(['Z']);
  });

  it('Use this shape keeps the exact total for every row at every budget', () => {
    const rules = defaultRules();
    const order = rules.stats.list.map((s) => s.id);
    const budgets = new Set<number>();
    for (let b = 0; b <= 200; b++) budgets.add(b);
    for (const g of rules.grades) {
      for (const v of Object.values(g.trackBudget ?? {})) budgets.add(v as number);
    }
    for (const row of evolutionReference()) {
      for (const budget of budgets) {
        const s = scaleShape(row, budget, order);
        expect(s, `${row.name} at ${budget}`).not.toBeNull();
        const total = Object.values(s!.stats).reduce((a, b) => a + b, 0) + s!.free;
        expect(total, `${row.name} at ${budget}`).toBe(budget);
        // Free points stay free: none appear from a row without them, and a
        // row with them keeps some once the budget is at least its own total.
        if (row.free === 0) expect(s!.free, row.name).toBe(0);
        else {
          // Largest remainder: never below the exact share rounded down, never above it rounded up.
          const exact = (row.free * budget) / row.total;
          expect(s!.free, `${row.name} at ${budget}`).toBeGreaterThanOrEqual(Math.floor(exact));
          expect(s!.free, `${row.name} at ${budget}`).toBeLessThanOrEqual(Math.ceil(exact));
        }
      }
    }
  });
});

describe('canary: the evolution reference stays GM-only (ME.4)', () => {
  it("needs the GM key, lists the campaign's options, and reaches no player frame", async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'the-system-evoref-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    const now = () => '2026-11-01T02:00:00.000Z';
    const store = CampaignStore.open('main', { dataDir: path.join(root, 'data'), now });
    const gmKey = newGmKey();
    let n = 0;
    const app = await createServer({
      webRoot: root,
      live: { store, gmKey, now, newId: () => `e${++n}` },
    });
    try {
      const url = '/api/gm/evolution-reference';
      const anon = await app.inject({ method: 'GET', url });
      expect(anon.statusCode).toBe(403);
      expect(anon.body).not.toContain('Ambitious Hunter');

      const hub = new LiveHub(store, { gmKey, now, newId: () => `h${++n}` });
      const gm = hub.connect(() => undefined);
      gm.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey }));
      const send = (requestId: string, command: Record<string, unknown>) =>
        gm.receive(JSON.stringify({ type: 'command', requestId, command }));
      send('c1', {
        type: 'campaign.create',
        name: 'W',
        rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
      });
      const kit = [
        { name: 'Basic Archery', rarity: 'inferior' },
        { name: 'Basic Stealth', rarity: 'inferior' },
        { name: 'Archer’s Eye', rarity: 'common' },
      ];
      send('c2', {
        type: 'character.create',
        id: 'jake',
        name: 'Jake',
        className: 'Archer',
        classSkills: kit,
      });
      send('c3', {
        type: 'character.create',
        id: 'kim',
        name: 'Kim',
        className: 'Archer',
        classSkills: kit,
      });
      send('c4', {
        type: 'xp.award',
        track: 'class',
        amount: 400,
        participants: [{ characterId: 'jake' }],
      });
      const opt = (id: string, name: string, stats: Record<string, number>, free: number) => ({
        id,
        name,
        rarity: 'common',
        description: 'x',
        distribution: { stats, free },
        statBonus: {},
      });
      send('c5', {
        type: 'evolution.release',
        characterId: 'jake',
        rerateApproved: true,
        steps: {
          class: [opt('c1', 'Wyrmsight Stalker', { perception: 9 }, 2)],
          profession: [opt('p1', 'Marrowbrew Tracker', { wisdom: 5 }, 2)],
          race: [opt('r1', 'Human (F)', {}, 6)],
        },
      });
      expect(store.campaign.state?.characters['jake']?.evolution).not.toBeNull();

      const ok = await app.inject({ method: 'GET', url, headers: { 'x-gm-key': gmKey } });
      expect(ok.statusCode).toBe(200);
      const body = ok.json<{ books: ShapeReferenceRow[]; campaign: ShapeReferenceRow[] }>();
      expect(body.books.some((r) => r.name === 'Ambitious Hunter')).toBe(true);
      expect(body.campaign.map((r) => [r.track, r.name, r.total])).toEqual([
        ['class', 'Wyrmsight Stalker', 11],
        ['profession', 'Marrowbrew Tracker', 7],
        ['race', 'Human (F)', 6],
      ]);

      // Kim (not the one evolving) sees neither the books' rows nor Jake's options.
      const frames: ServerMessage[] = [];
      const kim = hub.connect((m) => frames.push(m));
      kim.receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'kim' }));
      expect(frames.some((m) => m.type === 'view')).toBe(true);
      const json = JSON.stringify(frames);
      // (Archer is Kim's own class, so it is the one name allowed.)
      for (const r of body.books.filter((b) => b.name !== 'Archer')) {
        expect(json, r.name).not.toContain(r.name);
      }
      expect(json).not.toContain('Wyrmsight');
      expect(json).not.toContain('Marrowbrew');
    } finally {
      await app.close();
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
