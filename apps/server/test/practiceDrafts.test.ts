import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FixtureAiClient } from '../src/ai/fake';
import {
  DraftStore,
  attribute,
  draftPractice,
  draftPrompt,
  parseDrafts,
  type DraftCharacter,
  type PracticeDraft,
} from '../src/ai/practiceDrafts';
import type { TranscriptLine } from '../src/speech/transcript';

// MC.7 (DESIGN §11 "Practice drafts"): fake-backed; no paid API.
const party: DraftCharacter[] = [
  { id: 'jake', name: 'Jake', skills: ["Archer's Eye", 'Basic Archery'] },
  { id: 'miranda', name: 'Miranda', skills: ['Heal', 'Regenerate'] },
];
const line = (text: string, speakerId?: string, speaker?: string): TranscriptLine => ({
  at: '2026-10-26T19:00:00.000Z',
  startMs: 0,
  endMs: 1000,
  text,
  ...(speakerId ? { speakerId, speaker: speaker ?? speakerId } : {}),
});
const ids = () => {
  let n = 0;
  return () => `d${++n}`;
};

describe('attribution order (app action > GM naming > voice)', () => {
  it('the GM naming a character beats the voice label', () => {
    expect(attribute(line('Jake nocks an arrow.', 'miranda'), party, 'miranda')).toEqual({
      characterId: 'jake',
      by: 'gm-named',
    });
  });
  it('the voice label is used when no one is named', () => {
    expect(attribute(line('I loose the arrow.', 'jake'), party, 'miranda')).toEqual({
      characterId: 'jake',
      by: 'voice',
    });
  });
  it("the model's pick is the last resort, and only among the names said", () => {
    expect(attribute(line('I loose the arrow.'), party, 'Jake')).toEqual({
      characterId: 'jake',
      by: 'model',
    });
    expect(attribute(line('Jake and Miranda run.'), party, 'Miranda')).toEqual({
      characterId: 'miranda',
      by: 'gm-named',
    });
    expect(attribute(line('Jake and Miranda run.'), party, 'Nobody')).toBeNull();
    expect(attribute(line('Someone runs.'), party, null)).toBeNull();
  });
  it('matches whole names only', () => {
    expect(attribute(line('Jakeson waves.', 'miranda'), party, null)?.characterId).toBe('miranda');
  });
});

describe('parsing the fast model reply', () => {
  const lines = [
    line('Jake draws and uses Archer’s Eye to spot the weak scale.'),
    line('Should I use Heal later? What does it do?', 'miranda', 'Miranda'),
    line('Miranda lays a hand on him and the wound closes.'),
  ];
  const reply = JSON.stringify({
    drafts: [
      {
        line: 1,
        character: 'Jake',
        skill: "archer's eye",
        action: 'Spots the weak scale',
        confidence: 'high',
      },
      {
        line: 3,
        character: 'Miranda',
        skill: 'Heal',
        action: 'Closes the wound',
        confidence: 'high',
      },
      { line: 9, character: 'Jake', skill: 'Basic Archery', action: 'x', confidence: 'high' },
      { line: 1, character: 'Jake', skill: 'Fireball', action: 'x', confidence: 'high' },
    ],
  });

  it('keeps real uses with the official skill name and drops unknown lines and skills', () => {
    const drafts = parseDrafts('```json\n' + reply + '\n```', lines, party, [], ids());
    expect(drafts.map((d) => [d.characterId, d.skill, d.attributedBy, d.confidence])).toEqual([
      ['jake', "Archer's Eye", 'gm-named', 'high'],
      ['miranda', 'Heal', 'gm-named', 'high'],
    ]);
    expect(drafts[1]).toMatchObject({
      quote: lines[2]!.text,
      at: lines[2]!.at,
      action: 'Closes the wound',
    });
  });

  it('a use the app already logged (a contest roll) is not drafted again', () => {
    const drafts = parseDrafts(
      reply,
      lines,
      party,
      [{ characterId: 'jake', skills: ["Archer's Eye"], at: lines[0]!.at }],
      ids(),
    );
    expect(drafts.map((d) => d.skill)).toEqual(['Heal']);
  });

  it('one draft per character and skill; a voice-only draft is at most medium', () => {
    const r = JSON.stringify({
      drafts: [
        { line: 1, character: 'Jake', skill: "Archer's Eye", action: 'a', confidence: 'high' },
        { line: 1, character: 'Jake', skill: "Archer's Eye", action: 'b', confidence: 'high' },
        { line: 2, character: 'Miranda', skill: 'Regenerate', action: 'c', confidence: 'high' },
      ],
    });
    const drafts = parseDrafts(r, lines, party, [], ids());
    expect(drafts.map((d) => [d.skill, d.attributedBy, d.confidence])).toEqual([
      ["Archer's Eye", 'gm-named', 'high'],
      ['Regenerate', 'voice', 'medium'],
    ]);
  });

  it('a malformed item is dropped and the rest kept (MC.7 review M6)', () => {
    const r = JSON.stringify({
      drafts: [
        { line: '1', character: null, skill: "Archer's Eye" },
        { line: 3, character: 'Miranda', skill: 'Heal', action: 'Closes', confidence: 'high' },
      ],
    });
    expect(parseDrafts(r, lines, party, [], ids()).map((d) => d.skill)).toEqual(['Heal']);
  });

  it('refuses a reply that is not the drafts JSON', () => {
    expect(() => parseDrafts('Sure! Here you go.', lines, party, [], ids())).toThrow();
    expect(() => parseDrafts('{"nope":1}', lines, party, [], ids())).toThrow();
  });
});

describe('drafting with the fake fast model', () => {
  const lines = [
    // A use.
    line('Jake uses Archer’s Eye and finds the gap in its armour.'),
    // Talk about a skill that is not a use.
    line('Does Heal work on poison?', 'miranda', 'Miranda'),
    // GM narration of a use.
    line('Miranda presses her palm to the cut and Heal knits it shut.'),
  ];
  const client = new FixtureAiClient([
    {
      role: 'fast',
      match: 'Practice drafts.',
      text: JSON.stringify({
        drafts: [
          {
            line: 1,
            character: 'Jake',
            skill: "Archer's Eye",
            action: 'Finds the gap',
            confidence: 'high',
          },
          {
            line: 3,
            character: 'Miranda',
            skill: 'Heal',
            action: 'Knits the cut',
            confidence: 'medium',
          },
        ],
      }),
    },
  ]);

  it('asks the fast model with the party and numbered lines and returns the drafts', async () => {
    const drafts = await draftPractice(client, lines, party, [], ids());
    expect(client.requests[0]?.role).toBe('fast');
    const prompt = client.requests[0]!.messages[0]!.content;
    expect(prompt).toContain("- Jake: Archer's Eye, Basic Archery");
    expect(prompt).toContain('2. [Miranda] Does Heal work on poison?');
    expect(drafts.map((d) => [d.characterId, d.skill, d.confidence])).toEqual([
      ['jake', "Archer's Eye", 'high'],
      ['miranda', 'Heal', 'medium'],
    ]);
  });

  it('makes no call with no lines', async () => {
    const c = new FixtureAiClient([]);
    expect(await draftPractice(c, [], party, [], ids())).toEqual([]);
    expect(c.requests).toHaveLength(0);
  });

  it('the prompt carries the text only', () => {
    expect(draftPrompt([line('a\nb')], party)).toContain('1. a b');
  });
});

describe('draft store (GM-only, per campaign)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = mkdtempSync(path.join(os.tmpdir(), 'drafts-'));
    dirs.push(d);
    return d;
  };
  const draft = (id: string): PracticeDraft => ({
    id,
    characterId: 'jake',
    skill: 'Basic Archery',
    action: 'Shoots',
    quote: 'Jake shoots.',
    at: '2026-10-26T19:00:00.000Z',
    confidence: 'high',
    attributedBy: 'gm-named',
  });

  it('adds, lists, remembers how far it read, and removes', () => {
    const store = new DraftStore(tmp());
    expect(store.list()).toEqual([]);
    expect(store.readUpTo(1)).toBe(0);
    store.add(1, 4, [draft('a'), draft('b')]);
    expect(store.readUpTo(1)).toBe(4);
    expect(store.remove('a')).toBe(true);
    expect(store.remove('a')).toBe(false);
    expect(store.list().map((d) => d.id)).toEqual(['b']);
  });

  it('never overwrites a damaged file', () => {
    const dir = tmp();
    const file = path.join(dir, 'practice-drafts.json');
    writeFileSync(file, '{ bad');
    const store = new DraftStore(dir);
    expect(() => store.add(1, 1, [draft('a')])).toThrow();
    expect(readFileSync(file, 'utf8')).toBe('{ bad');
  });
});
