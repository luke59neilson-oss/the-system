import { describe, expect, it } from 'vitest';
import { newIdeas, parseIdeas } from '../src/ideas/import';

const file = (over: object = {}) =>
  JSON.stringify({
    format: 'the-system-ideas',
    version: 1,
    exported: '2026-11-01T00:00:00Z',
    ideas: [
      {
        id: 'a',
        text: ' A bridge that eats names ',
        kind: 'place',
        tags: ['river'],
        source: 'a walk',
        created: '2026-10-01T00:00:00Z',
        used: false,
      },
      { id: 'b', text: 'Twin smiths', kind: 'strange', tags: 'no', used: true },
    ],
    ...over,
  });

describe('reading story ideas (MW.3)', () => {
  it('parses version 1, with safe defaults', () => {
    const r = parseIdeas(file());
    if (!r.ok) throw new Error(r.error);
    expect(r.ideas[0]).toEqual({
      id: 'a',
      text: 'A bridge that eats names',
      kind: 'place',
      tags: ['river'],
      source: 'a walk',
      created: '2026-10-01T00:00:00Z',
      used: false,
    });
    expect(r.ideas[1]).toMatchObject({ kind: 'other', tags: [], source: '', used: true });
  });
  it('refuses another format, a newer version and broken entries, with a message', () => {
    expect(parseIdeas('{"format":"campaign","version":1}')).toEqual({
      ok: false,
      error: 'This is not an ideas export file',
    });
    expect(parseIdeas(file({ version: 2 }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('version 2') as string,
    });
    expect(parseIdeas(file({ ideas: [{ id: 'x' }] }))).toMatchObject({ ok: false });
    expect(parseIdeas('{not json')).toMatchObject({ ok: false });
  });
  it('splits pasted text on blank lines; the same paragraph keeps its id', () => {
    const r = parseIdeas('First idea\nsecond line\n\n  \nAnother\r\n\r\nFirst idea\nsecond line');
    if (!r.ok) throw new Error(r.error);
    expect(r.ideas.map((i) => i.text)).toEqual(['First idea\nsecond line', 'Another']);
    const again = parseIdeas('Another');
    if (!again.ok) throw new Error(again.error);
    expect(again.ideas[0]?.id).toBe(r.ideas[1]?.id);
    expect(parseIdeas('   \n ')).toMatchObject({ ok: false });
  });
  it('a repeat import adds nothing', () => {
    const r = parseIdeas(file());
    if (!r.ok) throw new Error(r.error);
    expect(newIdeas(r.ideas, new Set(['a', 'b']))).toEqual([]);
    expect(newIdeas(r.ideas, new Set(['a'])).map((i) => i.id)).toEqual(['b']);
  });
});
