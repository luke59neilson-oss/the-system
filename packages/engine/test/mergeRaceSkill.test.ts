import { describe, expect, it } from 'vitest';
import {
  characterFlags,
  execute,
  marksReview,
  mergeSkills,
  replay,
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

  // Sweep C 2026-10-31 (D283): logs written before QF.39 could hold such a
  // merge with no override; they must still replay.
  describe('merges stored before QF.39 replay unchanged', () => {
    type Raw = { type: string; schemaVersion: number; payload: Record<string, unknown> };
    const stored = (c: Campaign) => JSON.parse(JSON.stringify(c.events)) as Raw[];
    const asV1 = (events: Raw[], type: string) =>
      events.map((e) => {
        if (e.type !== type) return e;
        const payload = { ...e.payload };
        delete payload.override;
        return { ...e, schemaVersion: 1, payload };
      });
    const mergedAway = () =>
      run(
        [merge(true), { type: 'skill.answerMerge', characterId: ID, offerId: 'o1', accept: true }],
        ctx,
        fresh(start()),
      );

    it('a v1 offer and accept that merged Identify away replays', () => {
      const events = asV1(stored(mergedAway()), 'skill.mergeOffered');
      const c = replay(events);
      expect(names(c)).not.toContain('Identify');
      expect(names(c)).toContain('Seeing Eye');
    });

    it('a current (v2) offer without override still refuses Identify on replay', () => {
      const events = stored(mergedAway()).map((e) => {
        if (e.type !== 'skill.mergeOffered') return e;
        const payload = { ...e.payload };
        delete payload.override;
        return { ...e, payload };
      });
      expect(events.find((e) => e.type === 'skill.mergeOffered')?.schemaVersion).toBe(2);
      expect(() => replay(events)).toThrow('race skill and cannot be merged away');
    });

    it('a v1 skill.merged of Identify (GM-applied, before MT.2) replays', () => {
      const events = stored(fresh(start()));
      const last = events[events.length - 1]!;
      events.push({
        ...last,
        id: 'old-merge',
        type: 'skill.merged',
        schemaVersion: 1,
        payload: { characterId: ID, skills: ['Identify', 'Look'], name: 'Seeing Eye' },
      } as Raw);
      expect(names(replay(events))).toEqual(expect.arrayContaining(['Seeing Eye']));
      expect(names(replay(events))).not.toContain('Identify');
      const v2 = events.map((e) => (e.type === 'skill.merged' ? { ...e, schemaVersion: 2 } : e));
      expect(() => replay(v2)).toThrow('race skill and cannot be merged away');
    });

    it('a legacy merge skips the retired-name check; a current one keeps it', () => {
      const c = fresh(start());
      const jake = c.state!.characters[ID]!;
      const retired = new Set(['old eye']);
      const go = (legacy: boolean) =>
        mergeSkills(c.state!.rules, jake, 'Cut', 'Step', 'Old Eye', 3, false, retired, legacy);
      expect(() => go(false)).toThrow('pick a new name');
      expect(go(true).skills.map((s) => s.name)).toContain('Old Eye');
    });
  });
});
