import { describe, expect, it } from 'vitest';
import {
  characterFlags,
  execute,
  marksReview,
  mergeCandidates,
  type Campaign,
  type Command,
} from '../src';
import { rawRules, run, testContext } from './helpers/events';

// QF.39 (DESIGN §6, §7 Identify): a standalone merge can never consume the
// race skill Identify; it is never suggested; the GM can give it back.

const ID = 'jake';
const start = (): Command[] => [
  { type: 'campaign.create', name: 'Whale', rules: rawRules() },
  {
    type: 'character.create',
    id: ID,
    name: 'Jake',
    className: 'Archer',
    classSkills: [
      { name: 'Cut', rarity: 'uncommon' },
      { name: 'Step', rarity: 'uncommon' },
      { name: 'Look', rarity: 'uncommon' },
    ],
  },
  { type: 'skill.setRarity', characterId: ID, skill: 'Identify', rarity: 'uncommon' },
  { type: 'session.start', sessionId: 's1' },
  ...['One', 'Two', 'Three'].map((action): Command => ({
    type: 'practice.log',
    characterId: ID,
    action,
    skills: ['Identify', 'Look'],
  })),
];

let ctx = testContext();
const fresh = (commands: Command[]) => {
  ctx = testContext();
  return run(commands, ctx);
};
const attempt = (c: Campaign, command: Command) => execute(c, command, ctx);
const merge = (
  override = false,
  name = 'Seeing Eye',
  skills: readonly [string, string] = ['Identify', 'Look'],
): Command => ({
  type: 'skill.merge',
  characterId: ID,
  skills,
  name,
  offerId: 'o1',
  ...(override ? { override: true as const } : {}),
});
const names = (c: Campaign) => c.state!.characters[ID]!.skills.map((s) => s.name);

describe('Identify can never be merged away (QF.39)', () => {
  it('is not a merge candidate, a dashboard flag or a review merge pair', () => {
    const c = fresh(start());
    const state = c.state!;
    expect(mergeCandidates(state, ID)).toEqual([]);
    expect(characterFlags(state, ID).filter((f) => f.kind === 'merge')).toEqual([]);
    const review = marksReview(state, 's1').find((r) => r.characterId === ID)!;
    expect(review.pairs).toEqual([]);
  });

  it('refuses a merge offer naming Identify, either side', () => {
    const c = fresh(start());
    for (const skills of [
      ['Identify', 'Look'],
      ['Look', 'Identify'],
    ] as const) {
      const r = attempt(c, merge(false, 'Seeing Eye', skills));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('[Identify] is a race skill');
    }
  });

  it('a GM override may merge it, and skill.grant then gives Identify back', () => {
    const base = fresh(start());
    const merged = run(
      [merge(true), { type: 'skill.answerMerge', characterId: ID, offerId: 'o1', accept: true }],
      ctx,
      base,
    );
    expect(names(merged)).not.toContain('Identify');
    const back = run(
      [{ type: 'skill.grant', characterId: ID, name: 'Identify', rarity: 'common', kind: 'race' }],
      ctx,
      merged,
    );
    expect(back.state!.characters[ID]!.skills.find((s) => s.name === 'Identify')).toMatchObject({
      kind: 'race',
      rarity: 'common',
    });
    // Only the starting race skill comes back this way: a retired class name stays refused.
    const r = attempt(back, {
      type: 'skill.grant',
      characterId: ID,
      name: 'Look',
      rarity: 'common',
      kind: 'class',
    });
    expect(r.ok).toBe(false);
    // And Identify cannot be granted twice.
    const twice = attempt(back, {
      type: 'skill.grant',
      characterId: ID,
      name: 'Identify',
      rarity: 'common',
      kind: 'race',
    });
    expect(twice.ok).toBe(false);
  });

  it('a merge cannot take a retired skill name, like a grant', () => {
    // Cut + Step merge into "Edge"; practice still counts Cut and Step, so a
    // later merge named "Cut" is refused.
    const c = fresh([
      ...start(),
      ...['A', 'B', 'C'].map((action): Command => ({
        type: 'practice.log',
        characterId: ID,
        action,
        skills: ['Cut', 'Step'],
      })),
      {
        type: 'skill.merge',
        characterId: ID,
        skills: ['Cut', 'Step'],
        name: 'Edge',
        offerId: 'm1',
        override: true,
      },
      { type: 'skill.answerMerge', characterId: ID, offerId: 'm1', accept: true },
    ]);
    expect(names(c)).toContain('Edge');
    const r = attempt(c, {
      type: 'skill.merge',
      characterId: ID,
      skills: ['Edge', 'Look'],
      name: 'cut',
      offerId: 'm2',
      override: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('pick a new name');
  });
});

describe('an overridden race-skill merge (QF.39 review)', () => {
  it('passes on no race kind, so the restored Identify is the only race skill', () => {
    const base = fresh(start());
    const merged = run(
      [merge(true), { type: 'skill.answerMerge', characterId: ID, offerId: 'o1', accept: true }],
      ctx,
      base,
    );
    expect(merged.state!.characters[ID]!.skills.find((s) => s.name === 'Seeing Eye')?.kind).toBe(
      'class',
    );
    const back = run(
      [{ type: 'skill.grant', characterId: ID, name: 'Identify', rarity: 'common', kind: 'race' }],
      ctx,
      merged,
    );
    expect(
      back.state!.characters[ID]!.skills.filter((s) => s.kind === 'race').map((s) => s.name),
    ).toEqual(['Identify']);
  });
});
