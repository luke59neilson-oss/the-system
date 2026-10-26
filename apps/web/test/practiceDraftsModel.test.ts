import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
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
};

describe('practice drafts (MC.7)', () => {
  it('confirming a draft logs a reviewed GM entry for that skill, tagged co-dm', () => {
    const c = apply(base, [draftCommand(draft)]);
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
        action: 'Contest roll against Pale stalker (Agility)',
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
});
