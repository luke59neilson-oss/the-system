import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  execute,
  emptyCampaign,
  ideaPromptLines,
  IDEA_LINE_INSTRUCTION,
  IDEA_PROMPT_CHARS,
  parseIdeas,
  projectForPlayer,
  readUsedIdea,
  replay,
  type Campaign,
  type Command,
} from '../src';

// MW.3 (DESIGN §11 "Story ideas"): the GM's board as events; GM-only.
const ctx = (role: 'gm' | 'player' = 'gm', characterId?: string) => {
  let n = 0;
  return {
    actor: role === 'gm' ? { role } : { role, characterId: characterId as string },
    sessionId: null,
    now: () => '2026-11-02T00:00:00.000Z',
    newId: () => `id-${++n}-${Math.random().toString(36).slice(2)}`,
  } as Parameters<typeof execute>[2];
};
const run = (c: Campaign, command: unknown): Campaign => {
  const r = execute(c, command as Command, ctx());
  if (!r.ok) throw new Error(r.error);
  return r.campaign;
};
const base = (): Campaign =>
  run(emptyCampaign(), {
    type: 'campaign.create',
    name: 'I',
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) as unknown,
  });
const FILE = JSON.stringify({
  format: 'the-system-ideas',
  version: 1,
  exported: '2026-11-01T00:00:00Z',
  ideas: [
    { id: 'a', text: 'A drowned bell', kind: 'hook', tags: ['marsh'], source: '', created: null },
    { id: 'b', text: 'The ferryman lies', kind: 'npc', tags: [], source: 'dream', used: true },
  ],
});
const parsed = () => {
  const p = parseIdeas(FILE);
  if (!p.ok) throw new Error(p.error);
  return p.ideas;
};

describe('the Ideas board (MW.3)', () => {
  it('adds, edits, pins and marks used, and replays to the same state', () => {
    let c = run(base(), { type: 'idea.add', id: 'x', text: 'Hook', tags: ['t'] });
    c = run(c, { type: 'idea.edit', ideaId: 'x', text: 'Better', pinned: true, used: true });
    const idea = c.state?.ideas['x'];
    expect(idea).toMatchObject({ text: 'Better', pinned: true, used: true, kind: 'other' });
    expect(idea?.tags).toEqual(['t']);
    c = run(c, { type: 'idea.edit', ideaId: 'x', used: false });
    expect(c.state?.ideas['x']?.used).toBe(false);
    expect(c.state?.ideas['x']?.text).toBe('Better');
    expect(replay(JSON.parse(JSON.stringify(c.events)) as unknown[]).state).toEqual(c.state);
  });

  it('imports, keeps the used flag, and skips what it already holds', () => {
    const c = run(base(), { type: 'idea.import', ideas: parsed() });
    expect(c.state?.ideaOrder).toEqual(['a', 'b']);
    expect(c.state?.ideas['b']?.used).toBe(true);
    expect(c.state?.ideas['a']?.created).toBe('2026-11-02T00:00:00.000Z');
    const repeat = execute(c, { type: 'idea.import', ideas: parsed() }, ctx());
    expect(repeat.ok).toBe(false);
    expect(!repeat.ok && repeat.error).toContain('already on the board');
    const edited = run(c, { type: 'idea.edit', ideaId: 'a', text: 'Mine now' });
    const more = run(edited, {
      type: 'idea.import',
      ideas: [...parsed(), { ...parsed()[0], id: 'c' }],
    });
    expect(more.state?.ideaOrder).toEqual(['a', 'b', 'c']);
    expect(more.state?.ideas['a']?.text).toBe('Mine now');
  });

  it('refuses bad input without a crash', () => {
    for (const command of [
      { type: 'idea.import', ideas: [null] },
      { type: 'idea.import', ideas: [{ id: 'z' }] },
      { type: 'idea.add', text: '   ' },
      { type: 'idea.edit', ideaId: 'nope', text: 'x' },
    ]) {
      expect(execute(base(), command as Command, ctx()).ok, JSON.stringify(command)).toBe(false);
    }
    const c = run(base(), { type: 'idea.add', id: 'x', text: 'Hook' });
    expect(execute(c, { type: 'idea.edit', ideaId: 'x' } as Command, ctx()).ok).toBe(false);
    expect(execute(c, { type: 'idea.add', id: 'x', text: 'Again' } as Command, ctx()).ok).toBe(
      false,
    );
  });

  it('a file with an over-long idea is refused with a message; bad tags are dropped', () => {
    const file = (idea: object) =>
      JSON.stringify({ format: 'the-system-ideas', version: 1, ideas: [idea] });
    const long = parseIdeas(file({ id: 'l', text: 'x'.repeat(5_001) }));
    expect(!long.ok && long.error).toContain('too long');
    const tags = parseIdeas(file({ id: 't', text: 'x', tags: [' a ', '', 'a', 3, 'b'] }));
    expect(tags.ok && tags.ideas[0]?.tags).toEqual(['a', 'b']);
    // Whatever the parser passes, the event accepts.
    const huge = parseIdeas(
      file({
        id: 'h',
        text: 'y',
        source: 's'.repeat(900),
        created: 'c'.repeat(90),
        tags: Array.from({ length: 40 }, (_, i) => `t${i}`),
      }),
    );
    if (!huge.ok) throw new Error(huge.error);
    expect(run(base(), { type: 'idea.import', ideas: huge.ideas }).state?.ideaOrder).toEqual(['h']);
  });

  it('only the GM may touch the board, and no player view holds an idea', () => {
    let c = run(base(), {
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
    c = run(c, { type: 'idea.add', id: 'x', text: 'SECRET-IDEA-CANARY' });
    const asPlayer = execute(
      c,
      { type: 'idea.add', text: 'From a phone' } as Command,
      ctx('player', 'jake'),
    );
    expect(asPlayer.ok).toBe(false);
    const view = projectForPlayer(c.state as NonNullable<Campaign['state']>, 'jake');
    expect(JSON.stringify(view)).not.toContain('SECRET-IDEA-CANARY');
    expect(JSON.stringify(view)).not.toContain('ideaOrder');
  });
});

describe('ideas in a prompt (MW.3)', () => {
  const idea = (id: string, text: string) => ({
    id,
    text,
    kind: 'hook',
    tags: [],
    used: false,
    pinned: false,
  });

  it('offers nothing when there is nothing, and cuts long ideas', () => {
    expect(ideaPromptLines([], IDEA_LINE_INSTRUCTION)).toEqual([]);
    const lines = ideaPromptLines([idea('a', 'z'.repeat(900))], IDEA_LINE_INSTRUCTION);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.length).toBeLessThan(IDEA_PROMPT_CHARS + 20);
  });

  it('reads the idea a reply names, takes the line out, and ignores a made-up number', () => {
    const offered = [idea('a', 'One'), idea('b', 'Two')];
    const hit = readUsedIdea('SAY: hello\n- beat\nIDEA: 2\n', offered);
    expect(hit.idea?.id).toBe('b');
    expect(hit.text).toBe('SAY: hello\n- beat');
    expect(readUsedIdea('{"a":1}\nidea: #1', offered).idea?.id).toBe('a');
    expect(readUsedIdea('text\nIDEA: 9', offered)).toEqual({ text: 'text', idea: null });
    expect(readUsedIdea('An IDEA: 1 in a sentence', offered).idea).toBeNull();
  });
});
