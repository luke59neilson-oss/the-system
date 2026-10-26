import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FixtureAiClient } from '../src/ai/fake';
import {
  NotesStore,
  parseNotes,
  parseSummary,
  renderNotes,
  summarise,
  takeNotes,
} from '../src/ai/sessionNotes';

// MC.9: running notes and the end-of-session summary, fixture-backed.
const lines = [
  {
    at: '2026-10-26T19:00:00.000Z',
    startMs: 0,
    endMs: 900,
    text: 'You meet Old Brin, the herbalist.',
  },
  {
    at: '2026-10-26T19:00:05.000Z',
    startMs: 5000,
    endMs: 6000,
    text: 'Jake shoots the pale hunter.',
  },
];

describe('session notes (MC.9)', () => {
  it('takes notes from new transcript lines and skips a call when there are none', async () => {
    const fake = new FixtureAiClient([
      {
        role: 'fast',
        match: 'Session notes.',
        text: '```json\n{"notes": ["Met Old Brin", 3, "", "Jake shot a pale hunter"]}\n```',
      },
    ]);
    expect(await takeNotes(fake, [])).toEqual([]);
    expect(fake.requests).toHaveLength(0);
    expect(await takeNotes(fake, lines)).toEqual(['Met Old Brin', 'Jake shot a pale hunter']);
    expect(fake.requests).toHaveLength(1);
  });

  it('summarises the notes and drops malformed parts', async () => {
    const fake = new FixtureAiClient([
      {
        role: 'fast',
        match: 'Session summary.',
        text: JSON.stringify({
          whatHappened: 'The party reached the Rake Canyons.',
          whoDidWhat: [{ character: 'Jake', did: 'Shot a pale hunter' }, { character: 'x' }],
          openThreads: ['Who is Old Brin hiding?'],
          npcsMet: 'not a list',
        }),
      },
    ]);
    const s = await summarise(fake, ['Met Old Brin'], ['Jake']);
    expect(s).toEqual({
      whatHappened: 'The party reached the Rake Canyons.',
      whoDidWhat: [{ character: 'Jake', did: 'Shot a pale hunter' }],
      openThreads: ['Who is Old Brin hiding?'],
      npcsMet: [],
    });
  });

  it('rejects a reply with no JSON or no summary text', () => {
    expect(() => parseNotes('sorry, no')).toThrow(/no JSON/);
    expect(() => parseNotes('{"notes": "x"}')).toThrow(/no notes list/);
    expect(() => parseSummary('{"openThreads": []}')).toThrow(/whatHappened/);
  });

  it('renders the summary and notes for the session log', () => {
    expect(renderNotes({ readUpTo: 0, notes: [], summary: null })).toBe('');
    const md = renderNotes({
      readUpTo: 2,
      notes: ['Met Old Brin'],
      summary: {
        whatHappened: 'They reached the canyons.',
        whoDidWhat: [{ character: 'Jake', did: 'Shot a pale hunter' }],
        openThreads: ['Old Brin'],
        npcsMet: ['Old Brin'],
      },
    });
    expect(md).toContain('## Co-DM summary');
    expect(md).toContain('- Jake: Shot a pale hunter');
    expect(md).toContain('### NPCs met');
    expect(md).toContain('## Co-DM notes\n\n- Met Old Brin');
  });

  it('stores notes per session and refuses a damaged file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'the-system-notes-'));
    try {
      const store = new NotesStore(dir);
      expect(store.read(1)).toEqual({ readUpTo: 0, notes: [], summary: null });
      store.write(1, { readUpTo: 2, notes: ['a'], summary: null });
      expect(store.read(1).notes).toEqual(['a']);
      expect(store.read(2).notes).toEqual([]);
      writeFileSync(store.file(3), '{"notes": 1}');
      expect(() => store.read(3)).toThrow(/Damaged/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
