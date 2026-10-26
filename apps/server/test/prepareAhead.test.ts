import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { CoDm } from '../src/ai/coDm';
import { FixtureAiClient } from '../src/ai/fake';
import { GENERATE_FIXTURES } from '../src/ai/fixtures/generate';
import { draftsDir } from '../src/ai/practiceRoutes';
import { MAX_PREPARED, headingId, parseHeading, prepareDue } from '../src/ai/prepareAhead';
import { createServer } from '../src/server';
import { transcriptsDir } from '../src/speech/routes';
import { transcriptFile, type TranscriptLine } from '../src/speech/transcript';
import { CampaignStore } from '../src/store';

// MC.10: prepare ahead, backed by the fixture fast and strong models.
const line = (text: string): TranscriptLine =>
  ({ at: '2026-10-26T19:00:00.000Z', startMs: 0, endMs: 0, text }) as TranscriptLine;

describe('parseHeading (MC.10)', () => {
  const lines = [line('Nice weather.'), line("Let's go find that herbalist.")];
  const reply = (heading: unknown) => JSON.stringify({ heading });
  it('quotes the real line, never the model wording', () => {
    const h = parseHeading(
      reply({ line: 2, kind: 'shop', place: 'Herbalist', request: 'A herbalist' }),
      lines,
      new Set(),
    );
    expect(h).toMatchObject({
      kind: 'shop',
      place: 'Herbalist',
      quote: "Let's go find that herbalist.",
    });
    expect(h?.id).toBe(headingId('shop', '  herbalist '));
  });
  it('is null for no heading, a made-up line, or a destination already seen', () => {
    expect(parseHeading(reply(null), lines, new Set())).toBeNull();
    expect(
      parseHeading(reply({ line: 9, kind: 'shop', place: 'X', request: 'y' }), lines, new Set()),
    ).toBeNull();
    expect(
      parseHeading(
        reply({ line: 2, kind: 'shop', place: 'HERBALIST', request: 'y' }),
        lines,
        new Set([headingId('shop', 'Herbalist')]),
      ),
    ).toBeNull();
  });
  it('throws on a reply that is not JSON or breaks the shape', () => {
    expect(() => parseHeading('no', lines, new Set())).toThrow();
    expect(() => parseHeading(reply({ line: 1, kind: 'castle' }), lines, new Set())).toThrow();
  });
});

describe('prepareDue (MC.10)', () => {
  const base = {
    enabled: true,
    waiting: 0,
    now: 1_000_000,
    lastCallAt: null,
    intervalS: 300,
    newLines: 2,
    manual: false,
  };
  it('is off by default, needs new talk, and caps waiting drafts', () => {
    expect(prepareDue(base)).toBe(true);
    expect(prepareDue({ ...base, enabled: false })).toBe(false);
    expect(prepareDue({ ...base, newLines: 0 })).toBe(false);
    expect(prepareDue({ ...base, waiting: MAX_PREPARED })).toBe(false);
  });
  it('paces looks; a manual look still waits two minutes; a tiny interval is clamped', () => {
    const last = { ...base, lastCallAt: 1_000_000 - 200_000 };
    expect(prepareDue(last)).toBe(false);
    expect(prepareDue({ ...last, manual: true })).toBe(true);
    expect(prepareDue({ ...base, lastCallAt: 1_000_000 - 60_000, manual: true })).toBe(false);
    expect(prepareDue({ ...base, lastCallAt: 1_000_000 - 60_000, intervalS: 1 })).toBe(false);
  });
});

const GM = 'p'.repeat(32);
let ids = 0;
const hubOpts = { gmKey: GM, now: () => '2026-10-26T07:00:00.000Z', newId: () => `h${++ids}` };
const gm = { 'x-gm-key': GM };

function campaign(root: string): CampaignStore {
  const now = () => '2026-10-26T07:00:00.000Z';
  const store = CampaignStore.open('main', { dataDir: path.join(root, 'data'), now });
  let n = 0;
  const ctx = { actor: { role: 'gm' as const }, sessionId: null, now, newId: () => `e${++n}` };
  for (const command of [
    { type: 'campaign.create', name: 'Whale', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
    {
      type: 'character.create',
      id: 'jake',
      name: 'Jake',
      className: 'Archer',
      classSkills: [
        { name: 'Basic Archery', rarity: 'inferior' },
        { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
        { name: "Archer's Eye", rarity: 'common' },
      ],
    },
  ]) {
    const r = execute(store.campaign, command as never, ctx);
    if (!r.ok) throw new Error(r.error);
    store.appendAll(r.events);
  }
  return store;
}

describe('prepare-ahead routes (MC.10)', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  let fake: FixtureAiClient;
  let coDm: CoDm;
  let clock = Date.parse('2026-10-26T19:00:00.000Z');

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-prepare-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    store = campaign(root);
    coDm = new CoDm({
      dir: path.join(root, 'app-data'),
      cipher: null,
      makeClient: () => {
        fake = new FixtureAiClient([
          { role: 'fast', match: 'slowpoke', delayMs: 100, text: '{"heading": null}' },
          { role: 'fast', match: 'garbled', text: 'not json at all' },
          {
            role: 'fast',
            match: 'herbalist',
            usage: { inputTokens: 300, outputTokens: 40 },
            text: JSON.stringify({
              heading: { line: 2, kind: 'shop', place: 'Herbalist', request: 'The herbalist' },
            }),
          },
          { role: 'fast', match: 'Prepare ahead.', text: '{"heading": null}' },
          ...GENERATE_FIXTURES,
        ]);
        return fake;
      },
    });
    app = await createServer({
      webRoot: root,
      live: { store, ...hubOpts },
      coDm,
      now: () => clock,
    });
  });
  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  const post = (payload: object = {}) =>
    app.inject({ method: 'POST', url: '/api/gm/ai/prepared', headers: gm, payload });
  const say = (texts: string[]) => {
    const dir = transcriptsDir(store);
    mkdirSync(dir, { recursive: true });
    const body = texts.map((text, i) =>
      JSON.stringify({ at: '2026-10-26T19:00:00.000Z', startMs: i, endMs: i, text }),
    );
    writeFileSync(transcriptFile(dir, 0), body.join('\n') + '\n');
  };

  it('is GM-only', async () => {
    for (const [method, url] of [
      ['GET', '/api/gm/ai/prepared'],
      ['POST', '/api/gm/ai/prepared'],
      ['PUT', '/api/gm/ai/prepared/settings'],
      ['POST', '/api/gm/ai/prepared/x/take'],
      ['DELETE', '/api/gm/ai/prepared/x'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('is off by default: talk alone calls nothing', async () => {
    say(['Nice weather.', "Let's go find that herbalist."]);
    const r = await post();
    expect(r.json()).toMatchObject({ enabled: false, called: false, drafts: [] });
    expect(fake.requests).toHaveLength(0);
  });

  it('when on, drafts content for where the table heads, counts spend, changes nothing', async () => {
    const events = store.campaign.events.length;
    const on = await app.inject({
      method: 'PUT',
      url: '/api/gm/ai/prepared/settings',
      headers: gm,
      payload: { enabled: true },
    });
    expect(on.json()).toMatchObject({ enabled: true, intervalS: 300 });
    const r = await post();
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().called).toBe(true);
    expect(fake.requests.map((q) => q.role)).toEqual(['fast', 'strong']);
    expect(fake.requests[1]!.messages[0]!.content).toContain('Kind: Shop.');
    expect(coDm.spend.snapshot().calls).toBe(2);
    const drafts = r.json().drafts as { id: string; place: string; quote: string }[];
    expect(drafts.map((d) => [d.place, d.quote])).toEqual([
      ['Herbalist', "Let's go find that herbalist."],
    ]);
    // The list carries no file; taking it does.
    expect(JSON.stringify(drafts)).not.toContain('Sap & Sinew');
    expect(store.campaign.events.length).toBe(events);

    // Paced: new talk a minute later is not looked at yet, even by hand.
    say(['Nice weather.', "Let's go find that herbalist.", 'On we go.']);
    clock += 60_000;
    expect((await post({ manual: true })).json().called).toBe(false);
    expect(fake.requests).toHaveLength(2);

    const take = await app.inject({
      method: 'POST',
      url: `/api/gm/ai/prepared/${drafts[0]!.id}/take`,
      headers: gm,
    });
    expect(take.statusCode).toBe(200);
    expect(JSON.stringify(take.json().file)).toContain('Sap & Sinew');
    // Taking keeps the draft listed until the GM dismisses it (review M1):
    // a refresh or a closed console before approval loses nothing.
    expect(take.json().drafts).toHaveLength(1);
    const listed = await app.inject({ method: 'GET', url: '/api/gm/ai/prepared', headers: gm });
    expect(listed.json().drafts).toHaveLength(1);
    const done = await app.inject({
      method: 'DELETE',
      url: `/api/gm/ai/prepared/${drafts[0]!.id}`,
      headers: gm,
    });
    expect(done.json().drafts).toEqual([]);
    expect(store.campaign.events.length).toBe(events);

    // The same destination is not drafted twice, even when the model names it again.
    say(['Nice weather.', "Let's go find that herbalist.", 'On we go.', 'That herbalist, yes.']);
    clock += 300_000;
    const again = await post();
    expect(again.json()).toMatchObject({ called: true, prepared: null, drafts: [] });
    expect(fake.requests.map((q) => q.role)).toEqual(['fast', 'strong', 'fast']);
  });

  it('dismiss of a missing draft is 404; a damaged file is never overwritten', async () => {
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/gm/ai/prepared/nope',
      headers: gm,
    });
    expect(del.statusCode).toBe(404);
    const file = path.join(draftsDir(store), 'prepared.json');
    const before = readFileSync(file, 'utf8');
    writeFileSync(file, 'null');
    const get = await app.inject({ method: 'GET', url: '/api/gm/ai/prepared', headers: gm });
    expect(get.statusCode).toBe(500);
    expect((await post({ manual: true })).statusCode).toBe(500);
    expect(readFileSync(file, 'utf8')).toBe('null');
    writeFileSync(file, before);
  });

  it('a look whose reply cannot be read leaves its lines for the next look (review M3)', async () => {
    const base = [
      'Nice weather.',
      "Let's go find that herbalist.",
      'On we go.',
      'That herbalist, yes.',
    ];
    say([...base, 'Something garbled.']);
    clock += 600_000;
    const n = fake.requests.length;
    const bad = await post();
    expect(bad.statusCode).toBe(502);
    expect(fake.requests).toHaveLength(n + 1);
    // Paced from the failed look, then the same line is read again.
    clock += 600_000;
    await post();
    expect(fake.requests).toHaveLength(n + 2);
    expect(fake.requests.at(-1)!.messages[0]!.content).toContain('Something garbled.');
  });

  it('refuses a second look while one runs (409)', async () => {
    const base = [
      'Nice weather.',
      "Let's go find that herbalist.",
      'On we go.',
      'That herbalist, yes.',
    ];
    say([...base, 'Something garbled.', 'A slowpoke line.']);
    clock += 600_000;
    // inject starts on then(); give the first look time to start its slow call.
    const first = post().then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const second = await post({ manual: true });
    expect(second.statusCode).toBe(409);
    expect((await first).json()).toMatchObject({ called: true, prepared: null });
  });

  it('refuses a bad interval', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/gm/ai/prepared/settings',
      headers: gm,
      payload: { enabled: true, intervalS: 5 },
    });
    expect(r.statusCode).toBe(400);
  });
});
