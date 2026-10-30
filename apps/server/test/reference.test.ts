import { readFileSync } from 'node:fs';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, emptyCampaign, execute } from '@the-system/engine';
import { csvRecords, parseCsv } from '../src/reference/csv';
import { REFERENCE_CSV } from '../src/reference/lists.generated';
import {
  GOD_WORDS,
  REFERENCE_LISTS,
  REFERENCE_SAMPLE_CHARS,
  REFERENCE_SAMPLE_MAX,
  REFERENCE_SEARCH_MAX,
  parseReferenceList,
  referenceEntries,
  referencePromptBlock,
  referenceSample,
  sampleLine,
  searchReference,
  type ReferenceEntry,
} from '../src/reference/reference';
import { buildGenerateRequest, GENERATE_KINDS } from '../src/ai/generate';
import { quickPrompt, DEFAULT_QUICK_SLOTS } from '../src/ai/quickResponses';
import { createServer } from '../src/server';
import { CampaignStore } from '../src/store';
import { newGmKey } from '../src/security';
import { LiveHub } from '../src/hub';
import type { ServerMessage } from '../src/protocol';

// MU.6 (DESIGN §9a, §11; L23): the Primal Hunter reference lists are GM-only
// reference and a small, never god-tied sample of naming and tone examples
// in co-DM prompts.
const dir = path.resolve(import.meta.dirname, '../../../docs/reference/primal-hunter');
const FILES = {
  skills: 'skills.csv',
  items: 'items.csv',
  creatures: 'creatures.csv',
  classes: 'professions-classes.csv',
} as const;
const all = referenceEntries();

describe('CSV reader', () => {
  it('reads quotes, doubled quotes, commas and newlines in quotes, and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\r\n,\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere'],
      ['', ''],
    ]);
    expect(csvRecords('name,kind\nA\n')).toEqual([{ name: 'A', kind: '' }]);
    expect(csvRecords('')).toEqual([]);
  });
});

describe('reference lists (MU.6)', () => {
  it('the embedded lists match docs/reference (run `npm run reference` after editing)', () => {
    for (const list of REFERENCE_LISTS) {
      expect(REFERENCE_CSV[list], list).toBe(readFileSync(path.join(dir, FILES[list]), 'utf8'));
    }
  });

  it('parses every named row of every list, with god-tied rows flagged', () => {
    for (const list of REFERENCE_LISTS) {
      const raw = readFileSync(path.join(dir, FILES[list]), 'utf8');
      const rows = csvRecords(raw).filter((r) => r['name']);
      const parsed = all.filter((e) => e.list === list);
      expect(parsed.length, list).toBe(rows.length);
      expect(parsed.length, list).toBeGreaterThan(20);
      const tied = rows.filter((r) => /(^|;)\s*god-tied\s*(;|$)/.test(r['theme_tags'] ?? ''));
      expect(parsed.filter((e) => e.godTied).length, list).toBe(tied.length);
    }
    expect(all.filter((e) => e.godTied).length).toBeGreaterThan(10);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
  });

  it('keeps the list-specific columns as details', () => {
    const [bracers] = parseReferenceList(
      'items',
      'name,kind,slot,rarity,stat_effects,summary,theme_tags,confidence,source_url\n' +
        'Bracers,armor,bracers,Uncommon,+3 Str,"Fine, light.",stealth; Shadow,verified,https://x\n',
    );
    expect(bracers).toMatchObject({
      name: 'Bracers',
      kind: 'armor',
      rarity: 'Uncommon',
      summary: 'Fine, light.',
      tags: ['stealth', 'shadow'],
      godTied: false,
      details: ['slot: bracers', 'stat effects: +3 Str'],
      confidence: 'verified',
      source: 'https://x',
    });
  });
});

describe('search', () => {
  it('matches every word anywhere, name matches first, filtered by list', () => {
    const r = searchReference(all, { q: 'boar' });
    expect(r.total).toBeGreaterThan(1);
    expect(r.entries[0]?.name.toLowerCase()).toContain('boar');
    for (const e of r.entries) expect(JSON.stringify(e).toLowerCase()).toContain('boar');
    const items = searchReference(all, { q: 'bow', list: 'items' });
    expect(items.total).toBeGreaterThan(0);
    expect(items.entries.every((e) => e.list === 'items')).toBe(true);
    expect(searchReference(all, { q: 'boar zzzzqqq' }).total).toBe(0);
  });

  it('shows god-tied rows to the GM unless hidden, and is bounded', () => {
    const viper = searchReference(all, { q: 'viper' });
    expect(viper.entries.some((e) => e.godTied)).toBe(true);
    expect(
      searchReference(all, { q: 'viper', godTied: false }).entries.some((e) => e.godTied),
    ).toBe(false);
    const everything = searchReference(all, {});
    expect(everything.total).toBe(all.length);
    expect(everything.entries.length).toBe(REFERENCE_SEARCH_MAX);
  });
});

describe('co-DM sample', () => {
  const requests = [
    '',
    'a herbalist shop',
    'poison',
    'the party fights a boar',
    'Old Tam the ferryman',
    'viper god temple blessing',
    'stealth shadow cloak',
    'x'.repeat(500),
  ];
  const kinds = [...GENERATE_KINDS, 'quick', 'unknown'];

  it('never includes a god-tied row, and stays small, for every kind and request', () => {
    for (const kind of kinds) {
      for (const request of requests) {
        const sample = referenceSample(all, kind, request);
        const where = `${kind} / ${request.slice(0, 20)}`;
        expect(sample.length, where).toBeGreaterThan(0);
        expect(sample.length, where).toBeLessThanOrEqual(REFERENCE_SAMPLE_MAX);
        expect(
          sample.some((e) => e.godTied),
          where,
        ).toBe(false);
        const chars = sample.map(sampleLine).join('').length;
        expect(chars, where).toBeLessThanOrEqual(REFERENCE_SAMPLE_CHARS);
        const block = referencePromptBlock(kind, request);
        expect(block).not.toMatch(/god-tied|Malefic Viper/i);
        for (const line of block.split('\n').slice(1)) expect(line).not.toMatch(GOD_WORDS);
      }
    }
  });

  it('picks the lists that suit the kind and rows that match the request', () => {
    expect(referenceSample(all, 'shop', 'a weapons shop').every((e) => e.list === 'items')).toBe(
      true,
    );
    expect(referenceSample(all, 'encounter', 'beasts').some((e) => e.list === 'creatures')).toBe(
      true,
    );
    const poison = referenceSample(all, 'item', 'poison');
    expect(poison[0]?.tags).toContain('poison');
    // Deterministic: the same request gives the same sample.
    expect(referenceSample(all, 'npc', 'Old Tam')).toEqual(referenceSample(all, 'npc', 'Old Tam'));
  });

  it('god-tied rows, or rows naming a god, never enter a sample', () => {
    const tied: ReferenceEntry[] = all.filter((e) => e.godTied);
    expect(referenceSample(tied, 'quick', 'viper')).toEqual([]);
    // An untagged row whose summary names a god stays out too.
    const [untagged] = parseReferenceList(
      'creatures',
      'name,kind,summary,theme_tags\nDemon,race,"One becomes a goddess\'s disciple.",sentient\n',
    );
    if (!untagged) throw new Error('no row');
    expect(untagged.godTied).toBe(false);
    expect(referenceSample([untagged], 'quick', 'demon')).toEqual([]);
  });

  it('goes into the generation and quick-response prompts', () => {
    const state = (() => {
      const r = execute(
        emptyCampaign(),
        { type: 'campaign.create', name: 'W', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
        {
          actor: { role: 'gm' },
          sessionId: null,
          now: () => '2026-10-30T23:00:00.000Z',
          newId: () => 'e1',
        },
      );
      if (!r.ok || !r.campaign.state) throw new Error('no state');
      return r.campaign.state;
    })();
    const gen = JSON.stringify(buildGenerateRequest('shop', 'an herbalist', state));
    expect(gen).toContain('Naming and tone examples from The Primal Hunter');
    const slot = DEFAULT_QUICK_SLOTS[0];
    if (!slot) throw new Error('no slot');
    const quick = quickPrompt({
      slot,
      target: 'Can I sneak past the boar?',
      recent: [],
      context: { party: ['Jake'], region: 'The Crown', npc: null, lore: [] },
    });
    expect(quick).toContain('Naming and tone examples from The Primal Hunter');
    expect(quick.split('\n').filter((l) => l.startsWith('- ')).length).toBeLessThanOrEqual(
      REFERENCE_SAMPLE_MAX,
    );
  });
});

describe('canary: the reference lists never reach a player (MU.6)', () => {
  it('the route needs the GM key; player frames carry no reference row', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'the-system-ref-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    const now = () => '2026-10-30T23:00:00.000Z';
    const store = CampaignStore.open('main', { dataDir: path.join(root, 'data'), now });
    const gmKey = newGmKey();
    let n = 0;
    const app = await createServer({
      webRoot: root,
      live: { store, gmKey, now, newId: () => `e${++n}` },
    });
    try {
      const anon = await app.inject({ method: 'GET', url: '/api/gm/reference?q=boar' });
      expect(anon.statusCode).toBe(403);
      expect(anon.body).not.toContain('Irontusk');
      const wrong = await app.inject({
        method: 'GET',
        url: '/api/gm/reference?q=boar',
        headers: { 'x-gm-key': 'x'.repeat(32) },
      });
      expect(wrong.statusCode).toBe(403);
      const ok = await app.inject({
        method: 'GET',
        url: '/api/gm/reference?q=boar&list=creatures',
        headers: { 'x-gm-key': gmKey },
      });
      expect(ok.statusCode).toBe(200);
      const body = ok.json<{ total: number; entries: ReferenceEntry[] }>();
      expect(body.entries.some((e) => e.name === 'Irontusk Boar')).toBe(true);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/gm/reference?list=nope',
            headers: { 'x-gm-key': gmKey },
          })
        ).statusCode,
      ).toBe(400);

      // A player and a View-as pane over a campaign whose GM just searched.
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
      send('c2', {
        type: 'character.create',
        id: 'jake',
        name: 'Jake',
        className: 'Archer',
        classSkills: [
          { name: 'Basic Archery', rarity: 'inferior' },
          { name: 'Basic Stealth', rarity: 'inferior' },
          { name: 'Archer’s Eye', rarity: 'common' },
        ],
      });
      const frames: ServerMessage[] = [];
      const player = hub.connect((m) => frames.push(m));
      player.receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'jake' }));
      expect(frames.some((m) => m.type === 'view')).toBe(true);
      const json = JSON.stringify(frames);
      for (const e of all.filter((x) => x.name.length > 8 && !/archer|stealth/i.test(x.name)))
        expect(json, e.name).not.toContain(e.name);
    } finally {
      await app.close();
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
