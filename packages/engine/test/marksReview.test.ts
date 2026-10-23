import { describe, expect, it } from 'vitest';
import {
  marksReview,
  notificationsBetween,
  reviewSessionId,
  type Campaign,
  type Command,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// M5.3: the end-of-session marks review (DESIGN §6–7) on default rules.

const ID = 'jake';
const start: Command[] = [
  { type: 'campaign.create', name: 'Whale', rules: rawRules() },
  { type: 'character.create', id: ID, name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'lee', name: 'Lee', className: 'Archer', classSkills: kit },
];
const log = (action: string, skills: string[], characterId = ID): Command => ({
  type: 'practice.log',
  characterId,
  action,
  skills,
});
const mark = (skill: string, session?: string): Command => ({
  type: 'skill.awardMark',
  characterId: ID,
  skill,
  ...(session ? { session } : {}),
});
const jakeOf = (c: Campaign, session: string) =>
  marksReview(c.state!, session).find((r) => r.characterId === ID)!;

describe('marksReview (M5.3)', () => {
  it('lists the skills used this session, most used first, with repeats flagged', () => {
    const c = run([
      ...start,
      { type: 'session.start', sessionId: 'p1' },
      log('Shot the gate guard', ['Basic Archery']),
      log('Spotted the trap', ['Archer’s Eye', 'Basic Archery']),
      log('shot the gate guard.', ['Basic Archery']),
      log('Lee hid', ['Basic Stealth'], 'lee'),
    ]);
    const jake = jakeOf(c, 'p1');
    expect(jake.used.map((u) => [u.skill, u.uses])).toEqual([
      ['Basic Archery', 3],
      ['Archer’s Eye', 1],
    ]);
    expect(jake.used[0]!.entries.map((e) => e.repeated)).toEqual([false, false, true]);
    expect(jake.unused.map((u) => u.skill)).toContain('Basic Stealth');
    expect(jake.unused.map((u) => u.skill)).not.toContain('Basic Archery');
    expect(jake.used[0]).toMatchObject({ status: 'eligible', marks: 0, needed: 3, banks: false });
    const lee = marksReview(c.state!, 'p1').find((r) => r.characterId === 'lee')!;
    expect(lee.used.map((u) => u.skill)).toEqual(['Basic Stealth']);
  });

  it('only counts entries logged in the reviewed session', () => {
    const c = run([
      ...start,
      { type: 'session.start', sessionId: 'p1' },
      log('Shot', ['Basic Archery']),
      { type: 'session.end' },
      { type: 'session.start', sessionId: 'p2' },
      log('Looked', ['Archer’s Eye']),
    ]);
    expect(jakeOf(c, 'p1').used.map((u) => u.skill)).toEqual(['Basic Archery']);
    expect(jakeOf(c, 'p2').used.map((u) => u.skill)).toEqual(['Archer’s Eye']);
    expect(reviewSessionId(c.state!)).toBe('p2');
  });

  it('a confirmed mark shows as marked for that session only', () => {
    const c = run([
      ...start,
      { type: 'session.start', sessionId: 'p1' },
      log('Shot', ['Basic Archery']),
      mark('Basic Archery'),
      { type: 'session.end' },
    ]);
    expect(jakeOf(c, 'p1').used[0]).toMatchObject({ status: 'marked', marks: 1 });
    // A later session (and the review opening on the latest ended one).
    expect(reviewSessionId(c.state!)).toBe('p1');
    const later = run([{ type: 'session.start', sessionId: 'p2' }], testContext('b'), c);
    const p2 = jakeOf(later, 'p2').unused.find((u) => u.skill === 'Basic Archery')!;
    expect(p2.status).toBe('eligible');
  });

  it('marks for an ended session go through the public command with that session', () => {
    const c = run([
      ...start,
      { type: 'session.start', sessionId: 'p1' },
      log('Shot', ['Basic Archery']),
      { type: 'session.end' },
      mark('Basic Archery', 'p1'),
    ]);
    expect(jakeOf(c, 'p1').used[0]!.status).toBe('marked');
  });

  it('prompts an upgrade once the marks are there, and the upgrade tells only its owner', () => {
    const c = run([
      ...start,
      mark('Basic Archery', 'a'),
      mark('Basic Archery', 'b'),
      { type: 'session.start', sessionId: 'p1' },
      mark('Basic Archery'),
    ]);
    const jake = jakeOf(c, 'p1');
    expect(jake.upgrades).toEqual([
      { skill: 'Basic Archery', rarity: 'inferior', next: 'common', marks: 3, needed: 3 },
    ]);
    const up = run(
      [{ type: 'skill.upgrade', characterId: ID, skill: 'Basic Archery' }],
      testContext('u'),
      c,
    );
    expect(jakeOf(up, 'p1').upgrades).toEqual([]);
    const event = up.events.at(-1)!;
    expect(notificationsBetween(c.state, up.state, event)).toEqual([
      {
        kind: 'skillUpgrade',
        characterId: ID,
        skill: 'Basic Archery',
        from: 'Inferior',
        to: 'Common',
      },
    ]);
  });

  it('a skill at the grade ceiling banks: no upgrade prompt, listed as banked', () => {
    // G-grade ceiling is Rare (DESIGN §3); a Rare skill banks its marks.
    const c = run([
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      {
        type: 'character.create',
        id: ID,
        name: 'Jake',
        className: 'Archer',
        classSkills: [...kit.slice(0, 2), { name: 'Archer’s Eye', rarity: 'rare' }],
      },
      ...Array.from({ length: 8 }, (_, i) => mark('Archer’s Eye', `s${i}`)),
      { type: 'session.start', sessionId: 'p1' },
    ]);
    const jake = jakeOf(c, 'p1');
    expect(jake.upgrades).toEqual([]);
    expect(jake.banked.map((b) => [b.skill, b.marks, b.needed, b.banks])).toEqual([
      ['Archer’s Eye', 8, 8, true],
    ]);
  });

  it('no session played means no session to review', () => {
    expect(reviewSessionId(run(start).state!)).toBeNull();
  });
  it('counts skill pairs this session and in the whole log, and flags a montage focus', () => {
    const c = run([
      ...start,
      { type: 'session.start', sessionId: 'p0' },
      log('Aimed and shot', ['Archer’s Eye', 'Basic Archery']),
      { type: 'session.end' },
      { type: 'session.start', sessionId: 'p1' },
      log('Aimed and shot again', ['Basic Archery', 'Archer’s Eye']),
      { type: 'clock.create', clockId: 'k', name: 'Climb', segments: 2 },
      { type: 'clock.tick', clockId: 'k', result: 'success' },
      { type: 'montage.offer', montageId: 'm', clockId: 'k', characterIds: [ID] },
      {
        type: 'montage.focus',
        montageId: 'm',
        characterId: ID,
        action: 'Hid',
        skills: ['Basic Stealth'],
      },
    ]);
    const jake = jakeOf(c, 'p1');
    expect(jake.pairs).toEqual([
      { skills: ['Archer’s Eye', 'Basic Archery'], session: 1, total: 2, needed: 3 },
    ]);
    expect(jake.used.find((u) => u.skill === 'Basic Stealth')).toMatchObject({
      montage: true,
      status: 'eligible',
    });
    expect(jake.used.find((u) => u.skill === 'Basic Archery')!.montage).toBe(false);
    expect(jake.lost).toEqual([]);
  });

  it('lists logged skills merged away this session as lost', () => {
    const pair = ['Cut', 'Step'];
    const c = run([
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      {
        type: 'character.create',
        id: ID,
        name: 'Jake',
        className: 'Archer',
        classSkills: [
          { name: 'Cut', rarity: 'uncommon' },
          { name: 'Step', rarity: 'uncommon' },
          { name: 'Look', rarity: 'common' },
        ],
      },
      { type: 'session.start', sessionId: 'p1' },
      log('One', pair),
      log('Two', pair),
      log('Three', pair),
      { type: 'skill.merge', characterId: ID, skills: ['Cut', 'Step'], name: 'Cutstep' },
    ]);
    const jake = jakeOf(c, 'p1');
    expect(jake.lost).toEqual(['Cut', 'Step']);
    expect(jake.used).toEqual([]);
    expect(jake.pairs).toEqual([]);
  });
});
