import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
  projectForPlayer,
  type Campaign,
  type CampaignState,
  type Command,
  type CommandContext,
} from '@the-system/engine';
import {
  CONTEST_TAG,
  CO_DM_TAG,
  contestPracticeCommands,
  draftCommand,
  draftSession,
  draftWho,
  type PracticeDraft,
} from '../src/gm/practiceDraftsModel';

// MC.7: confirming a draft and a contest roll both log ordinary GM practice.
let n = 0;
const ctx: CommandContext = {
  actor: { role: 'gm' },
  sessionId: null,
  now: () => '2026-10-26T12:00:00.000Z',
  newId: () => `x${++n}`,
};
const kit = [
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic One-Handed Weapon', rarity: 'inferior' },
  { name: "Archer's Eye", rarity: 'common' },
];
function apply(c: Campaign, commands: Command[]): Campaign {
  for (const command of commands) {
    const r = execute(c, command, ctx);
    if (!r.ok) throw new Error(r.error);
    c = r.campaign;
  }
  return c;
}
const base = apply(emptyCampaign(), [
  { type: 'campaign.create', name: 'Fight', rules: DEFAULT_RULES },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
]);
const state = base.state as CampaignState;

const draft: PracticeDraft = {
  id: 'd1',
  characterId: 'jake',
  skill: "Archer's Eye",
  action: 'Spots the weak scale',
  quote: 'Jake uses Archer’s Eye.',
  at: '2026-10-26T19:00:00.000Z',
  confidence: 'high',
  attributedBy: 'gm-named',
  sessionId: null,
};

describe('practice drafts (MC.7)', () => {
  it('confirming a draft logs a reviewed GM entry for that skill, tagged co-dm', () => {
    const c = apply(base, [draftCommand(state, draft)]);
    const [entry] = (c.state as CampaignState).practice;
    expect(entry).toMatchObject({
      characterId: 'jake',
      action: 'Spots the weak scale',
      skills: ["Archer's Eye"],
      tags: [CO_DM_TAG],
      source: 'gm',
      reviewed: true,
    });
  });

  it('a draft confirmed in a later session credits the session it was heard in (MC.7 review M4)', () => {
    let c = apply(base, [{ type: 'session.start', sessionId: 'one' }, { type: 'session.end' }]);
    c = apply(c, [{ type: 'session.start', sessionId: 'two' }]);
    const s = c.state as CampaignState;
    const heard = { ...draft, sessionId: 'one' };
    expect(draftSession(s, heard)).toBe('session 1');
    expect(draftSession(s, draft)).toBeNull();
    const r = execute(c, draftCommand(s, heard), { ...ctx, sessionId: 'two' });
    if (!r.ok) throw new Error(r.error);
    expect((r.campaign.state as CampaignState).practice[0]?.sessionId).toBe('one');
    // A session the campaign does not know is not invented: none.
    expect(draftCommand(s, { ...draft, sessionId: 'gone' })).toMatchObject({ session: null });
  });

  it('names the character, or the id when they are gone', () => {
    expect(draftWho(state, draft)).toBe('Jake');
    expect(draftWho(state, { ...draft, characterId: 'gone' })).toBe('gone');
  });

  it('a contest roll logs practice for each character side with the stat rolled', () => {
    const cmds = contestPracticeCommands(
      state,
      { source: 'c:jake', stat: 'agility', label: 'Jake' },
      { source: 'e:hunter', stat: 'strength', label: 'Pale stalker' },
    );
    expect(cmds).toEqual([
      {
        type: 'practice.log',
        characterId: 'jake',
        action: 'Contest roll',
        stat: 'agility',
        tags: [CONTEST_TAG],
        source: 'gm',
      },
    ]);
    const both = contestPracticeCommands(
      state,
      { source: 'c:jake', stat: 'agility', label: 'Jake' },
      { source: 'c:kim', stat: 'perception', label: 'Kim' },
    );
    expect(both.map((c) => (c as { characterId: string }).characterId)).toEqual(['jake', 'kim']);
    // A side with no stat logs nothing (an entry needs a skill or a stat).
    expect(
      contestPracticeCommands(
        state,
        { source: 'c:jake', stat: '', label: 'Jake' },
        { source: 'custom', stat: '', label: 'Wall' },
      ),
    ).toEqual([]);
    expect(() => apply(base, both)).not.toThrow();
    expect(
      contestPracticeCommands(
        state,
        { source: 'c:gone', stat: 'agility', label: 'X' },
        { source: 'custom', stat: '', label: 'Y' },
      ),
    ).toEqual([]);
  });

  it('an unshared contest names neither the other side nor its stat to any player (QF.47)', () => {
    const vsNpc = contestPracticeCommands(
      state,
      { source: 'c:jake', stat: 'perception', label: 'Jake' },
      { source: 'custom', stat: 'strength', label: 'Hooded Ambusher' },
    );
    const vsPc = contestPracticeCommands(
      state,
      { source: 'c:jake', stat: 'strength', label: 'Jake · Strength' },
      { source: 'c:kim', stat: 'agility', label: 'Kim · Agility' },
    );
    const after = apply(base, [...vsNpc, ...vsPc]).state as CampaignState;
    const jake = JSON.stringify(projectForPlayer(after, 'jake'));
    const kim = JSON.stringify(projectForPlayer(after, 'kim'));
    expect(jake).not.toContain('Hooded Ambusher');
    expect(jake).not.toContain('Kim · Agility');
    expect(jake).not.toMatch(/Contest roll[^"]*Agility/);
    expect(kim).not.toContain('Jake · Strength');
    expect(kim).not.toMatch(/Contest roll[^"]*Strength/);
    // Each still sees their own practice, with their own stat.
    const contests = (v: ReturnType<typeof projectForPlayer>) =>
      JSON.stringify(v)
        .match(/"action":"Contest roll"[^}]*"stat":"\w+"/g)
        ?.map((m) => m.replace(/.*"stat":"(\w+)"/, '$1'))
        .sort();
    expect(contests(projectForPlayer(after, 'jake'))).toEqual(['perception', 'strength']);
    expect(contests(projectForPlayer(after, 'kim'))).toEqual(['agility']);
  });
});
