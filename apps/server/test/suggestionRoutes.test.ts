import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { CoDm } from '../src/ai/coDm';
import { FixtureAiClient } from '../src/ai/fake';
import { createServer } from '../src/server';
import { transcriptsDir } from '../src/speech/routes';
import { transcriptFile } from '../src/speech/transcript';
import { CampaignStore } from '../src/store';

// MC.8: GM-only suggestion routes, backed by the fixture fast model.
const GM = 's'.repeat(32);
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

const CHIPS = JSON.stringify({
  chips: [
    {
      line: 1,
      type: 'generate',
      kind: 'shop',
      title: 'Herbalist shop',
      request: 'An herbalist near the canyon',
    },
    { line: 1, type: 'complication', kind: 'encounter', title: 'Pale hunters', request: 'Ambush' },
  ],
});

describe('suggestion routes (MC.8)', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  let fake: FixtureAiClient;
  let coDm: CoDm;
  let clock = Date.parse('2026-10-26T19:00:00.000Z');

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-chips-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    store = campaign(root);
    coDm = new CoDm({
      dir: path.join(root, 'app-data'),
      cipher: null,
      makeClient: () => {
        fake = new FixtureAiClient([
          {
            role: 'fast',
            match: 'Suggestions.',
            usage: { inputTokens: 1000, outputTokens: 200 },
            text: CHIPS,
          },
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
    app.inject({ method: 'POST', url: '/api/gm/ai/suggestions', headers: gm, payload });
  const say = (texts: string[]) => {
    const dir = transcriptsDir(store);
    mkdirSync(dir, { recursive: true });
    const body = texts.map((text, i) =>
      JSON.stringify({ at: '2026-10-26T19:00:00.000Z', startMs: i, endMs: i, text }),
    );
    writeFileSync(transcriptFile(dir, 0), body.join('\n') + '\n');
  };
  const titles = (chips: { title: string }[]) => chips.map((c) => c.title);

  it('is GM-only', async () => {
    for (const [method, url] of [
      ['GET', '/api/gm/ai/suggestions'],
      ['POST', '/api/gm/ai/suggestions'],
      ['DELETE', '/api/gm/ai/suggestions/x'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('suggests from new talk, paces calls, counts spend, and keeps dismissed chips away', async () => {
    expect((await post()).json()).toMatchObject({ chips: [], called: false });
    expect(fake.requests).toHaveLength(0);

    say(['We should find an herbalist before the canyon.', 'Jake nocks an arrow and waits.']);
    const r = await post();
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().called).toBe(true);
    const chips = r.json().chips as { id: string; title: string; quote: string }[];
    expect(chips.map((c) => [c.title, c.quote])).toEqual([
      ['Herbalist shop', 'We should find an herbalist before the canyon.'],
      ['Pale hunters', 'We should find an herbalist before the canyon.'],
    ]);
    expect(fake.requests[0]!.role).toBe('fast');
    expect(coDm.spend.snapshot().calls).toBe(1);
    // Nothing changed in the campaign.
    expect(store.campaign.state?.practice).toEqual([]);

    // New talk 30 s later: not due yet, even when asked by hand.
    say(['a', 'b', 'Someone mentions an old friend.']);
    clock += 30_000;
    expect((await post({ manual: true })).json().called).toBe(false);
    expect(fake.requests).toHaveLength(1);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/gm/ai/suggestions/${chips[0]!.id}`,
      headers: gm,
    });
    expect(del.statusCode).toBe(200);
    expect(titles(del.json().chips)).toEqual(['Pale hunters']);

    clock += 90_000;
    const again = await post();
    expect(again.json().called).toBe(true);
    expect(fake.requests).toHaveLength(2);
    // Only the line heard since the last call was read.
    const prompt = fake.requests[1]!.messages[0]!.content;
    expect(prompt).toContain('1. Someone mentions an old friend.');
    expect(prompt).not.toContain('herbalist');
    // The model offered the herbalist again; it stays dismissed.
    expect(titles(again.json().chips)).toEqual(['Pale hunters']);
  });

  it('refuses a bad interval', async () => {
    expect((await post({ intervalS: 5 })).statusCode).toBe(400);
  });
});
