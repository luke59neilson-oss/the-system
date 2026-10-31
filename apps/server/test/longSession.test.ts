import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { CoDm } from '../src/ai/coDm';
import { FixtureAiClient } from '../src/ai/fake';
import { DraftStore } from '../src/ai/practiceDrafts';
import { draftsDir } from '../src/ai/practiceRoutes';
import { NotesStore } from '../src/ai/sessionNotes';
import { CHUNK_CHARS, CHUNK_LINES, transcriptChunks } from '../src/ai/transcriptChunks';
import { createServer } from '../src/server';
import { transcriptsDir } from '../src/speech/routes';
import { transcriptFile, type TranscriptLine } from '../src/speech/transcript';
import { CampaignStore } from '../src/store';

// QF.49: the co-DM reads a long session in bounded pieces, moves its read
// position after each, and says so when a reply is cut at its output cap.
const GM = 'q'.repeat(32);
let ids = 0;
const hubOpts = { gmKey: GM, now: () => '2026-10-31T07:00:00.000Z', newId: () => `h${++ids}` };
const gm = { 'x-gm-key': GM };
const LINES = 3000;

const line = (i: number): TranscriptLine => ({
  at: new Date(Date.UTC(2026, 9, 31, 19, 0, 0) + i * 1000).toISOString(),
  startMs: i * 1000,
  endMs: i * 1000 + 900,
  text: `Talk number ${i} at the table, Jake looks around the market.`,
});

describe('transcriptChunks', () => {
  it('bounds every chunk by lines and characters and covers the rest exactly once', () => {
    const lines = Array.from({ length: LINES }, (_, i) => line(i));
    const chunks = transcriptChunks(lines, 7);
    expect(chunks[0]!.start).toBe(7);
    expect(chunks.at(-1)!.end).toBe(LINES);
    for (const [i, c] of chunks.entries()) {
      if (i > 0) expect(c.start).toBe(chunks[i - 1]!.end);
      expect(c.end - c.start).toBeGreaterThan(0);
      expect(c.end - c.start).toBeLessThanOrEqual(CHUNK_LINES);
      const chars = lines.slice(c.start, c.end).reduce((n, l) => n + l.text.length, 0);
      expect(chars).toBeLessThanOrEqual(CHUNK_CHARS);
    }
  });

  it('splits by characters when lines are long, and a single huge line stands alone', () => {
    const long = (n: number): TranscriptLine => ({ ...line(0), text: 'x'.repeat(n) });
    expect(transcriptChunks([long(60), long(60), long(60)], 0, 100, 150)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ]);
    expect(transcriptChunks([long(500), long(10)], 0, 100, 150)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
    ]);
    expect(transcriptChunks([long(10)], 1)).toEqual([]);
  });
});

describe('a long session (QF.49)', () => {
  let root: string;
  let store: CampaignStore;
  let app: FastifyInstance;
  // Each test swaps in its own fake, so its request list is its own.
  let fake = new FixtureAiClient([]);

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'the-system-long-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    const now = () => '2026-10-31T07:00:00.000Z';
    store = CampaignStore.open('main', { dataDir: path.join(root, 'data'), now });
    let n = 0;
    const ctx = { actor: { role: 'gm' as const }, now, newId: () => `e${++n}` };
    for (const command of [
      { type: 'campaign.create', name: 'Long', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
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
      { type: 'session.start' },
    ]) {
      const r = execute(store.campaign, command as never, {
        ...ctx,
        sessionId: store.campaign.state?.currentSession ?? null,
      });
      if (!r.ok) throw new Error(r.error);
      store.appendAll(r.events);
    }
    const dir = transcriptsDir(store);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      transcriptFile(dir, sessionNumber()),
      Array.from({ length: LINES }, (_, i) => JSON.stringify(line(i))).join('\n') + '\n',
    );
    const coDm = new CoDm({
      dir: path.join(root, 'app-data'),
      cipher: null,
      makeClient: () => ({ complete: (request) => fake.complete(request) }),
    });
    app = await createServer({ webRoot: root, live: { store, ...hubOpts }, coDm });
  });
  beforeEach(() => {
    rmSync(draftsDir(store), { recursive: true, force: true });
  });
  afterAll(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  function sessionNumber(): number {
    return store.campaign.state!.sessions.at(-1)!.number;
  }
  const heardIn = (prompt: string) => prompt.split('\n').filter((l) => l.includes('Talk number'));
  /** Every request carried one bounded chunk; together they read each line once. */
  const expectBounded = () => {
    const prompts = fake.requests.map((r) => r.messages.at(-1)!.content);
    expect(prompts.length).toBeGreaterThanOrEqual(Math.ceil(LINES / CHUNK_LINES));
    for (const p of prompts) {
      expect(heardIn(p).length).toBeLessThanOrEqual(CHUNK_LINES);
      expect(heardIn(p).join('').length).toBeLessThanOrEqual(CHUNK_CHARS + CHUNK_LINES * 8);
    }
    expect(prompts.reduce((n, p) => n + heardIn(p).length, 0)).toBe(LINES);
  };
  const post = (url: string) => app.inject({ method: 'POST', url, headers: gm });

  it('drafts practice from 3,000 unread lines in bounded pieces, one draft per skill', async () => {
    fake = new FixtureAiClient([
      {
        role: 'fast',
        match: 'Practice drafts.',
        text: JSON.stringify({
          drafts: [{ line: 1, character: 'Jake', skill: "Archer's Eye", action: 'Looks' }],
        }),
      },
    ]);
    const r = await post('/api/gm/ai/practice-drafts');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ added: 1, read: LINES });
    expectBounded();
    expect(new DraftStore(draftsDir(store)).readUpTo(sessionNumber())).toBe(LINES);
  });

  it('a failed piece keeps the pieces before it; the retry sends only the rest', async () => {
    const failing = line(400).text;
    fake = new FixtureAiClient([
      {
        role: 'fast',
        match: failing,
        text: '',
        error: { message: 'The API is busy', kind: 'rate-limit' },
      },
      { role: 'fast', match: 'Practice drafts.', text: '{"drafts":[]}' },
    ]);
    const r = await post('/api/gm/ai/practice-drafts');
    expect(r.statusCode).toBe(502);
    const done = new DraftStore(draftsDir(store)).readUpTo(sessionNumber());
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThanOrEqual(400);
    const chunk = transcriptChunks(
      Array.from({ length: LINES }, (_, i) => line(i)),
      0,
    ).find((c) => c.start <= 400 && 400 < c.end)!;
    expect(done).toBe(chunk.start);

    fake = new FixtureAiClient([
      { role: 'fast', match: 'Practice drafts.', text: '{"drafts":[]}' },
    ]);
    const again = await post('/api/gm/ai/practice-drafts');
    expect(again.json()).toMatchObject({ read: LINES - done });
    expect(fake.requests.reduce((n, q) => n + heardIn(q.messages.at(-1)!.content).length, 0)).toBe(
      LINES - done,
    );
    expect(new DraftStore(draftsDir(store)).readUpTo(sessionNumber())).toBe(LINES);
  });

  it('a reply cut at its output cap says the stretch was too long, and moves nothing', async () => {
    fake = new FixtureAiClient([
      {
        role: 'fast',
        match: 'Practice drafts.',
        text: '{"drafts":[{"line":1,',
        stopReason: 'max_tokens',
      },
    ]);
    const r = await post('/api/gm/ai/practice-drafts');
    expect(r.statusCode).toBe(502);
    expect(r.json().error).toMatch(/too long/);
    expect(new DraftStore(draftsDir(store)).readUpTo(sessionNumber())).toBe(0);
  });

  it('a reply with no drafts list is a co-DM error, not a disk error', async () => {
    fake = new FixtureAiClient([{ role: 'fast', match: 'Practice drafts.', text: 'Sorry, no.' }]);
    const r = await post('/api/gm/ai/practice-drafts');
    expect(r.statusCode).toBe(502);
    expect(r.json().error).toMatch(/co-DM reply had no drafts list/);
  });

  it('takes notes and summarises 3,000 lines in bounded pieces, saving after each', async () => {
    fake = new FixtureAiClient([
      { role: 'fast', match: 'Session notes.', text: '{"notes":["Jake looked around"]}' },
      {
        role: 'fast',
        match: 'Session summary.',
        text: JSON.stringify({
          whatHappened: 'A long market day.',
          whoDidWhat: [],
          openThreads: [],
          npcsMet: [],
        }),
      },
    ]);
    const r = await post('/api/gm/ai/session-summary');
    expect(r.statusCode, r.body).toBe(200);
    const pieces = transcriptChunks(
      Array.from({ length: LINES }, (_, i) => line(i)),
      0,
    ).length;
    expect(r.json().notes).toHaveLength(pieces);
    expect(r.json().summary.whatHappened).toBe('A long market day.');
    fake.requests.pop(); // the summary call carries notes, not transcript lines
    expectBounded();
    expect(new NotesStore(draftsDir(store)).read(sessionNumber()).readUpTo).toBe(LINES);
  });

  it('notes cut at their cap say so and keep the pieces before', async () => {
    const cut = line(1000).text;
    fake = new FixtureAiClient([
      { role: 'fast', match: cut, text: '{"notes":["half', stopReason: 'max_tokens' },
      { role: 'fast', match: 'Session notes.', text: '{"notes":["Jake looked around"]}' },
    ]);
    const r = await post('/api/gm/ai/session-notes');
    expect(r.statusCode).toBe(502);
    expect(r.json().error).toMatch(/too long/);
    const file = new NotesStore(draftsDir(store)).read(sessionNumber());
    expect(file.readUpTo).toBeGreaterThan(0);
    expect(file.readUpTo).toBeLessThanOrEqual(1000);
    expect(file.notes.length).toBeGreaterThan(0);
  });
});
