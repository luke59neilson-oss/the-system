import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { CoDm } from '../src/ai/coDm';
import { FixtureAiClient } from '../src/ai/fake';
import { readFileSync } from 'node:fs';
import { createServer } from '../src/server';
import { NotesStore } from '../src/ai/sessionNotes';
import { draftsDir } from '../src/ai/practiceRoutes';
import { sessionReport } from '../src/sessionLog';
import { appendFileSync } from 'node:fs';
import { transcriptsDir } from '../src/speech/routes';
import { transcriptFile } from '../src/speech/transcript';
import { CampaignStore } from '../src/store';

// MC.9: GM-only session-notes routes; the summary reaches the session log export.
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

describe('session notes routes (MC.9)', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  let fake: FixtureAiClient;
  const exportsDir = () => path.join(root, 'exports');

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-notes-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    store = campaign(root);
    const coDm = new CoDm({
      dir: path.join(root, 'app-data'),
      cipher: null,
      makeClient: () => {
        fake = new FixtureAiClient([
          // Specific fixtures first: the first match wins.
          { role: 'fast', match: '. Brin left town.', text: '{"notes": ["Brin left town"]}' },
          { role: 'fast', match: 'Nothing worth noting', text: '{"notes": []}' },
          {
            role: 'fast',
            match: '- Brin left town',
            text: JSON.stringify({
              whatHappened: 'Brin left town\n## Not a heading',
              whoDidWhat: [],
              openThreads: [],
              npcsMet: ['Old Brin'],
            }),
          },
          { role: 'fast', match: 'Session notes.', text: '{"notes": ["The party met Old Brin"]}' },
          {
            role: 'fast',
            match: 'Session summary.',
            text: JSON.stringify({
              whatHappened: 'The party met Old Brin in the Crown.',
              whoDidWhat: [{ character: 'Jake', did: 'Haggled for herbs' }],
              openThreads: ['What Brin is hiding'],
              npcsMet: ['Old Brin'],
            }),
          },
        ]);
        return fake;
      },
    });
    app = await createServer({
      webRoot: root,
      live: { store, ...hubOpts },
      coDm,
      sessionLog: {
        exportsDir: exportsDir(),
        now: () => '2026-10-26T21:00:00.000Z',
        every: () => () => {},
      },
    });
  });
  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('is GM-only', async () => {
    for (const [method, url] of [
      ['GET', '/api/gm/ai/session-notes'],
      ['POST', '/api/gm/ai/session-notes'],
      ['POST', '/api/gm/ai/session-summary'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it("takes notes, then writes the summary into the ended session's log and export", async () => {
    const none = await app.inject({ method: 'POST', url: '/api/gm/ai/session-notes', headers: gm });
    expect(none.statusCode).toBe(409);

    let n = 0;
    const ctx = {
      actor: { role: 'gm' as const },
      now: () => '2026-10-26T20:00:00.000Z',
      newId: () => `s${++n}`,
    };
    const run = (command: unknown) => {
      const r = execute(store.campaign, command as never, {
        ...ctx,
        sessionId: store.campaign.state?.currentSession ?? null,
      });
      if (!r.ok) throw new Error(r.error);
      store.appendAll(r.events);
    };
    run({ type: 'session.start' });
    const session = store.campaign.state!.sessions.at(-1)!;
    const dir = transcriptsDir(store);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      transcriptFile(dir, session.number),
      JSON.stringify({
        at: '2026-10-26T20:01:00.000Z',
        startMs: 0,
        endMs: 900,
        text: 'You meet Old Brin.',
      }) + '\n',
    );
    const notes = await app.inject({
      method: 'POST',
      url: '/api/gm/ai/session-notes',
      headers: gm,
    });
    expect(notes.statusCode, notes.body).toBe(200);
    expect(notes.json()).toMatchObject({
      notes: ['The party met Old Brin'],
      added: 1,
      summary: null,
    });
    // Nothing new: no second call.
    const again = await app.inject({
      method: 'POST',
      url: '/api/gm/ai/session-notes',
      headers: gm,
    });
    expect(again.json()).toMatchObject({ added: 0 });
    expect(fake.requests).toHaveLength(1);

    run({ type: 'session.end' });
    const sum = await app.inject({
      method: 'POST',
      url: '/api/gm/ai/session-summary',
      headers: gm,
    });
    expect(sum.statusCode, sum.body).toBe(200);
    expect(sum.json().summary).toMatchObject({ npcsMet: ['Old Brin'] });
    // The campaign is unchanged by notes.
    expect(store.campaign.state?.practice).toEqual([]);

    const file = path.join(
      exportsDir(),
      store.id,
      `session-${String(session.number).padStart(2, '0')}`,
    );
    const md = readFileSync(`${file}.md`, 'utf8');
    expect(md).toContain('## Co-DM summary');
    expect(md).toContain('The party met Old Brin in the Crown.');
    expect(md).toContain('- Jake: Haggled for herbs');
    const json = JSON.parse(readFileSync(`${file}.json`, 'utf8'));
    expect(json.coDm.summary.openThreads).toEqual(['What Brin is hiding']);

    const got = await app.inject({ method: 'GET', url: '/api/gm/ai/session-notes', headers: gm });
    expect(got.json()).toMatchObject({
      session: session.number,
      notes: ['The party met Old Brin'],
    });
  });

  it('re-reads lines that gave no notes, and a second summary reaches the export (D250)', async () => {
    const session = store.campaign.state!.sessions.at(-1)!;
    const tf = transcriptFile(transcriptsDir(store), session.number);
    const say = (text: string) =>
      appendFileSync(
        tf,
        JSON.stringify({ at: '2026-10-26T20:30:00.000Z', startMs: 0, endMs: 900, text }) + '\n',
      );
    const stored = () => new NotesStore(draftsDir(store)).read(session.number);
    const before = stored().readUpTo;
    say('Nothing worth noting.');
    const empty = await app.inject({
      method: 'POST',
      url: '/api/gm/ai/session-notes',
      headers: gm,
    });
    expect(empty.json()).toMatchObject({ added: 0 });
    expect(stored().readUpTo).toBe(before);

    say('Brin left town.');
    const some = await app.inject({ method: 'POST', url: '/api/gm/ai/session-notes', headers: gm });
    expect(some.json()).toMatchObject({ added: 1 });
    // The quiet line was sent again with the new one.
    const prompt = fake.requests.at(-1)!.messages.at(-1)!.content;
    expect(prompt).toContain('Nothing worth noting.');
    expect(stored().readUpTo).toBe(before + 2);

    const sum = await app.inject({
      method: 'POST',
      url: '/api/gm/ai/session-summary',
      headers: gm,
    });
    expect(sum.statusCode, sum.body).toBe(200);
    // Newlines in model text collapse to one line.
    expect(sum.json().summary.whatHappened).toBe('Brin left town ## Not a heading');
    const file = path.join(
      exportsDir(),
      store.id,
      `session-${String(session.number).padStart(2, '0')}`,
    );
    const md = readFileSync(`${file}.md`, 'utf8');
    expect(md).toContain('Brin left town ## Not a heading');
    expect(md).not.toContain('The party met Old Brin in the Crown.');
  });

  it('a malformed summary never stops the session log (D250)', () => {
    const session = store.campaign.state!.sessions.at(-1)!;
    const bad = { readUpTo: 0, notes: ['a'], summary: { whatHappened: 'x' } } as never;
    const report = sessionReport(
      store.campaign,
      session,
      '2026-10-26T21:00:00.000Z',
      undefined,
      bad,
    );
    expect(report?.markdown).toBeTruthy();
  });
});
