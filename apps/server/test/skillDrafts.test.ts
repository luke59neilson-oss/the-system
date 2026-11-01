// MW.2: the co-DM's skill-offer drafts: each source mode, the prompt's contents
// and bound, and the reply's parsing. Recorded replies only; no network.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
  type CampaignState,
  type Command,
  type CommandContext,
} from '@the-system/engine';
import { AiError } from '../src/ai/client';
import {
  SKILL_DRAFT_PROMPT_MAX,
  buildSkillDraftRequest,
  parseSkillDrafts,
  skillDraftSource,
} from '../src/ai/skillDrafts';

function campaign(extra: Command[] = []): CampaignState {
  const rules = JSON.parse(JSON.stringify(DEFAULT_RULES)) as {
    grades: { selectionInterval: number | null }[];
  };
  rules.grades[0]!.selectionInterval = 2; // G selections at 2 and 4 (capstone)
  let n = 0;
  const ctx: CommandContext = {
    actor: { role: 'gm' },
    sessionId: null,
    now: () => '2026-10-23T12:00:00.000Z',
    newId: () => `e${++n}`,
  };
  const commands: Command[] = [
    { type: 'campaign.create', name: 'Offers', rules },
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
    { type: 'xp.award', track: 'class', amount: 400, participants: [{ characterId: 'jake' }] },
    ...extra,
  ];
  let c = emptyCampaign();
  for (const command of commands) {
    const r = execute(c, command, ctx);
    if (!r.ok) throw new Error(r.error);
    c = r.campaign;
  }
  return c.state!;
}

const text = (
  s: CampaignState,
  level: number,
  source: Parameters<typeof buildSkillDraftRequest>[3],
) => buildSkillDraftRequest(s, 'jake', level, source).messages[0]!.content;

describe('skill-offer draft prompts (MW.2)', () => {
  it('each mode says what to draft from', () => {
    const s = campaign();
    expect(text(s, 2, { mode: 'stat', stat: 'perception' })).toContain('built around Perception');
    expect(text(s, 2, { mode: 'skill', skill: 'Basic Archery' })).toContain(
      'improve or add to [Basic Archery]',
    );
    expect(text(s, 2, { mode: 'direction', direction: 'a poison trick' })).toContain(
      'a poison trick',
    );
  });

  it('carries the standing, practice summary, ceiling and capstone rule', () => {
    const s = campaign([
      {
        type: 'practice.log',
        characterId: 'jake',
        action: 'Shot from the treeline',
        skills: ['Basic Archery', 'Basic Stealth'],
        stat: 'perception',
      },
    ]);
    const plain = text(s, 2, { mode: 'stat', stat: 'perception' });
    expect(plain.startsWith('Skill-offer drafts.')).toBe(true);
    expect(plain).toContain('Rarity ceiling: rare.');
    expect(plain).toContain('Not a capstone.');
    expect(plain).not.toContain('Capstone:');
    expect(plain).toContain('[Basic Archery] Inferior');
    expect(plain).toContain('Perception ×1');
    expect(plain).toContain('[Basic Archery] + [Basic Stealth] ×1');
    expect(plain).toContain('Shot from the treeline');
    const allowed = /Use only these rarity ids: (.*)\./.exec(plain)![1]!.split(', ');
    expect(allowed).toContain('rare');
    expect(allowed).not.toContain('epic');
    expect(text(s, 4, { mode: 'stat', stat: 'perception' })).toContain(
      'Capstone: this is the grade',
    );
  });

  it('stays within the fixed size for a long character', () => {
    const long: Command[] = Array.from({ length: 200 }, (_, i) => ({
      type: 'practice.log',
      characterId: 'jake',
      action: `A very long practice entry number ${i} `.repeat(20).slice(0, 200),
      stat: 'perception',
    }));
    const prompt = text(campaign(long), 2, { mode: 'direction', direction: 'x'.repeat(500) });
    expect(prompt.length).toBeLessThanOrEqual(SKILL_DRAFT_PROMPT_MAX);
  });

  it('refuses what cannot be drafted', () => {
    const s = campaign();
    expect(() => text(s, 3, { mode: 'stat', stat: 'perception' })).toThrow(/due/);
    expect(() => text(s, 2, { mode: 'stat', stat: 'charm' })).toThrow(/Unknown stat/);
    expect(() => text(s, 2, { mode: 'skill', skill: 'Nope' })).toThrow(/no skill/);
    expect(() => buildSkillDraftRequest(s, 'ghost', 2, { mode: 'stat', stat: 'luck' })).toThrow(
      /No such character/,
    );
    expect(skillDraftSource.safeParse({ mode: 'direction', direction: '   ' }).success).toBe(false);
  });
});

describe('skill-offer draft replies (MW.2)', () => {
  const s = campaign();
  it('parses drafts with defaults, inside a sentence', () => {
    const drafts = parseSkillDrafts(
      `Here: {"drafts":[{"name":"Keen Sight","rarity":"Common"},{"name":"Bolt","rarity":"rare","spell":false,"cost":{"pool":"${s.rules.pools[0]!.id}","amount":5}}]}`,
      s,
    );
    expect(drafts[0]).toEqual({
      name: 'Keen Sight',
      rarity: 'common',
      kind: 'class',
      description: '',
      spell: false,
      cost: null,
    });
    expect(drafts[1]).toMatchObject({ spell: true, cost: { amount: 5 } });
  });
  it('a cost in an unknown pool is no cost; the spell stays', () => {
    const [d] = parseSkillDrafts(
      '{"drafts":[{"name":"Bolt","rarity":"rare","spell":true,"cost":{"pool":"ki","amount":5}}]}',
      s,
    );
    expect(d).toMatchObject({ spell: true, cost: null });
  });
  it('keeps at most a menu', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `S${i}`, rarity: 'common' }));
    expect(parseSkillDrafts(JSON.stringify({ drafts: many }), s)).toHaveLength(
      s.rules.skills.menuSize.max,
    );
  });
  it('refuses a broken reply or a rarity the rules do not have', () => {
    expect(() => parseSkillDrafts('no json', s)).toThrow(AiError);
    expect(() => parseSkillDrafts('{"drafts":[]}', s)).toThrow(/usable/);
    expect(() => parseSkillDrafts('{"drafts":[{"name":"X","rarity":"mega"}]}', s)).toThrow(
      /rarity/,
    );
  });
});
