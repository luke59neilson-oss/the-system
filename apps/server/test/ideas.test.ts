import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute, IDEAS_IN_PROMPT, IDEA_PROMPT_CHARS } from '@the-system/engine';
import type { Campaign, CampaignState, Command } from '@the-system/engine';
import { LiveHub } from '../src/hub';
import type { ServerMessage } from '../src/protocol';
import { CampaignStore } from '../src/store';
import { buildGenerateRequest, generateIdeas } from '../src/ai/generate';
import { ideasInPlay } from '../src/ai/ideas';
import { DEFAULT_QUICK_SLOTS, quickPrompt } from '../src/ai/quickResponses';
import { parseChips, suggestPrompt } from '../src/ai/suggestions';

// MW.3 (DESIGN §11 "Story ideas"): what the co-DM is offered, and the canary.
const now = () => '2026-11-02T00:00:00.000Z';
let n = 0;
const ctx = { actor: { role: 'gm' as const }, sessionId: null, now, newId: () => `e${++n}` };
const SECRET = 'SECRET-IDEA-CANARY';
const CREATE = [
  {
    type: 'campaign.create',
    name: 'I',
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) as unknown,
  },
  {
    type: 'character.create',
    id: 'jake',
    name: 'Jake',
    className: 'Archer',
    classSkills: [
      { name: 'Basic Archery', rarity: 'inferior' },
      { name: 'Basic Stealth', rarity: 'inferior' },
      { name: 'Archer’s Eye', rarity: 'common' },
    ],
  },
];
const build = (ideas: readonly object[]): CampaignState => {
  let c: Campaign = { events: [], state: null, undone: {} } as unknown as Campaign;
  for (const command of [...CREATE, ...ideas.map((i) => ({ type: 'idea.add', ...i }))]) {
    const r = execute(c, command as unknown as Command, ctx);
    if (!r.ok) throw new Error(r.error);
    c = r.campaign;
  }
  return c.state as CampaignState;
};

describe('ideas in co-DM prompts (MW.3)', () => {
  it('generation carries a fitting unused idea, bounded and cut', () => {
    const state = build([
      { id: 'a', text: 'A drowned bell in the marsh', kind: 'place', tags: ['marsh'] },
      { id: 'b', text: 'Used already', kind: 'place' },
      { id: 'c', text: 'z'.repeat(900), kind: 'place' },
      { id: 'd', text: 'Another place', kind: 'place' },
      { id: 'e', text: 'Yet another place', kind: 'place' },
      { id: 'f', text: 'An item nobody needs', kind: 'item' },
    ]);
    const used = {
      ...state,
      ideas: { ...state.ideas, b: { ...state.ideas['b']!, used: true } },
    } as CampaignState;
    const offered = generateIdeas('place', 'somewhere in the marsh', used);
    expect(offered.map((i) => i.id)[0]).toBe('a');
    expect(offered).toHaveLength(IDEAS_IN_PROMPT);
    expect(offered.map((i) => i.id)).not.toContain('b');
    expect(offered.map((i) => i.id)).not.toContain('f');
    const content = buildGenerateRequest('place', 'somewhere in the marsh', used).messages[0]!
      .content;
    expect(content).toContain("The GM's story ideas");
    expect(content).toContain('1. (place) A drowned bell');
    expect(content).not.toContain('z'.repeat(IDEA_PROMPT_CHARS + 1));
  });

  it('a campaign with no ideas gets the prompt it always had', () => {
    const state = build([]);
    expect(buildGenerateRequest('npc', 'a smith', state).messages[0]!.content).not.toContain(
      'story ideas',
    );
    expect(ideasInPlay(state, { words: 'anything at all' })).toEqual([]);
  });

  it('a pinned idea comes along with no connection; a stray one does not', () => {
    const state = build([
      { id: 'p', text: 'Pinned thought', kind: 'twist' },
      { id: 'q', text: 'Stray thought', kind: 'twist' },
    ]);
    const pinned = {
      ...state,
      ideas: { ...state.ideas, p: { ...state.ideas['p']!, pinned: true } },
    } as CampaignState;
    expect(ideasInPlay(pinned, { words: 'nothing related' }).map((i) => i.id)).toEqual(['p']);
  });

  it('quick responses and suggestions carry them and read the idea back', () => {
    const state = build([{ id: 'a', text: 'The ferryman lies', kind: 'npc', tags: ['ferry'] }]);
    const ideas = ideasInPlay(state, { words: 'we ask at the ferry' });
    const quick = quickPrompt({
      slot: DEFAULT_QUICK_SLOTS[0]!,
      target: 'we ask at the ferry',
      recent: [],
      context: { party: [], region: null, npc: null, lore: [], ideas },
    });
    expect(quick).toContain('1. (npc) The ferryman lies');
    expect(quick).toContain('IDEA:');
    const line = { text: 'we ask at the ferry' } as Parameters<typeof parseChips>[1][number];
    expect(suggestPrompt([line], { party: [], known: [], ideas })).toContain('"idea":');
    const chip = (idea?: number) =>
      JSON.stringify({
        chips: [{ line: 1, type: 'generate', kind: 'npc', title: 'T', request: 'R', idea }],
      });
    expect(parseChips(chip(1), [line], new Set(), ideas)[0]?.idea).toEqual({
      id: 'a',
      text: 'The ferryman lies',
    });
    expect(parseChips(chip(7), [line], new Set(), ideas)[0]?.idea).toBeUndefined();
    expect(parseChips(chip(), [line], new Set(), ideas)[0]?.idea).toBeUndefined();
  });
});

describe('ideas are GM-only (MW.3 canary)', () => {
  let dataDir = '';
  afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

  it('ideas added, edited and imported live never reach a player or View-as frame', () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-ideas-'));
    const store = CampaignStore.open('main', { dataDir, now });
    for (const command of CREATE) {
      const r = execute(store.campaign, command as unknown as Command, ctx);
      if (!r.ok) throw new Error(r.error);
      store.appendAll(r.events);
    }
    const gmKey = 'k'.repeat(32);
    const hub = new LiveHub(store, { gmKey, now, newId: ctx.newId });
    const phone: ServerMessage[] = [];
    hub
      .connect((m) => phone.push(m))
      .receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'jake' }));
    const pane: ServerMessage[] = [];
    hub
      .connect((m) => pane.push(m))
      .receive(JSON.stringify({ type: 'join', role: 'player', characterId: 'jake', viewAs: true }));
    const gm: ServerMessage[] = [];
    const gmConn = hub.connect((m) => gm.push(m));
    gmConn.receive(JSON.stringify({ type: 'join', role: 'gm', gmKey }));
    const before = phone.length;
    const commands = [
      { type: 'idea.add', id: 'x', text: `${SECRET} one`, tags: [SECRET], source: SECRET },
      { type: 'idea.edit', ideaId: 'x', text: `${SECRET} two`, used: true },
      {
        type: 'idea.import',
        ideas: [
          {
            id: `${SECRET}-id`,
            text: `${SECRET} three`,
            kind: 'hook',
            tags: [],
            source: '',
            created: null,
            used: false,
          },
        ],
      },
    ];
    commands.forEach((command, i) =>
      gmConn.receive(JSON.stringify({ type: 'command', requestId: `r${i}`, command })),
    );
    expect(store.campaign.state?.ideaOrder).toHaveLength(2);
    expect(JSON.stringify(gm)).toContain(SECRET);
    expect(phone.length).toBeGreaterThanOrEqual(before);
    expect(JSON.stringify(phone)).not.toContain(SECRET);
    expect(JSON.stringify(pane)).not.toContain(SECRET);
  });
});
