import { describe, expect, it } from 'vitest';
import {
  buildDemoEvents,
  replay,
  type CampaignState,
  type CharacterFlag,
} from '@the-system/engine';
import { needsYou } from '../src/gm/needsYouModel';
import { WINDOWS } from '../src/gm/tabsModel';

const demo = (): CampaignState => {
  let n = 0;
  const state = replay(
    buildDemoEvents({ now: () => '2026-10-21T00:00:00.000Z', newId: () => `id-${++n}` }),
  ).state;
  if (!state) throw new Error('no state');
  return state;
};

// MU.1 (DESIGN §9a): what waits on the GM, each linked to its window.
describe('needsYou (MU.1)', () => {
  it('lists the GM-side work from the party flags, each linked to a real window', () => {
    const flags = (_s: CampaignState, id: string): CharacterFlag[] =>
      id === 'demo-casper'
        ? [
            { kind: 'selection', level: 10, capstone: true, offered: false },
            { kind: 'selection', level: 5, capstone: false, offered: true },
            { kind: 'evolution', toGrade: 'E', status: 'ready' },
            { kind: 'upgrade', skill: 'Heal', marks: 4 },
            { kind: 'merge', skills: ['Heal', 'Regenerate'], count: 3 },
            { kind: 'freePoints', points: 3 },
          ]
        : [{ kind: 'evolution', toGrade: 'D', status: 'released' }];
    const s = demo();
    const items = needsYou({ ...s, practice: [], tradeOrder: [] }, flags);
    for (const i of items) expect(WINDOWS[i.window], i.window).toBeDefined();
    // Waiting on a player (a menu out, a released evolution, free points) is not the GM's.
    expect(items).toEqual([
      {
        key: 'demo-casper:selection-10',
        text: 'Casper: capstone selection (lvl 10) to build',
        window: 'offer-builder',
        selection: { characterId: 'demo-casper', level: 10 },
      },
      {
        key: 'demo-casper:evolution',
        text: 'Casper: evolution to E-grade to build and release',
        window: 'evolution-builder',
      },
      {
        key: 'demo-casper:upgrade-Heal',
        text: 'Casper: [Heal] can upgrade',
        window: 'marks-review',
      },
      {
        key: 'demo-casper:merge-Heal+Regenerate',
        text: 'Casper: merge ready, [Heal] + [Regenerate]',
        window: 'merge-builder',
      },
    ]);
  });

  it('counts unreviewed practice and open player requests to the GM', () => {
    const base = demo();
    const entry = base.practice[0];
    if (!entry) throw new Error('demo has practice');
    const state: CampaignState = {
      ...base,
      practice: [
        { ...entry, reviewed: false },
        { ...entry, reviewed: false },
      ],
      trades: {
        t1: {
          id: 't1',
          from: 'demo-jake',
          to: null,
          give: { currency: 0, items: [] },
          get: { currency: 0, items: [] },
          status: 'open',
          proposedAt: '2026-10-21T00:00:00.000Z',
          closedAt: null,
        },
      } as unknown as CampaignState['trades'],
      tradeOrder: ['t1'],
    };
    const items = needsYou(state);
    expect(items.find((i) => i.key === 'practice')).toEqual({
      key: 'practice',
      text: '2 practice entries to review',
      window: 'practice-capture',
    });
    expect(items.find((i) => i.key === 'requests')?.text).toBe('1 player request to answer');
  });

  it('says nothing for an empty campaign', () => {
    const s = demo();
    expect(
      needsYou({ ...s, characterOrder: [], practice: [], tradeOrder: [], trades: {} }),
    ).toEqual([]);
  });
});
