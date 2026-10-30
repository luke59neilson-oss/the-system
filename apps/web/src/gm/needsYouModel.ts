import { characterFlags, type CampaignState, type CharacterFlag } from '@the-system/engine';

// MU.1 (DESIGN §9a): the home dashboard's "what needs you" list. Everything
// that waits on the GM, across the party, each with the window that handles
// it (its tab comes from tabsModel.ts). Things waiting on a player are left
// to the party cards.

export interface NeedsYouItem {
  readonly key: string;
  readonly text: string;
  /** The GM window that handles it (an id in tabsModel's WINDOWS). */
  readonly window: string;
  /** For a selection: opens the offer builder on that character and level. */
  readonly selection?: { readonly characterId: string; readonly level: number };
}

export function needsYou(
  state: CampaignState,
  flagsOf: (state: CampaignState, id: string) => CharacterFlag[] = characterFlags,
): NeedsYouItem[] {
  const out: NeedsYouItem[] = [];
  for (const id of state.characterOrder) {
    const c = state.characters[id];
    if (!c) continue;
    for (const f of flagsOf(state, id)) {
      switch (f.kind) {
        case 'selection':
          if (!f.offered)
            out.push({
              key: `${id}:selection-${f.level}`,
              text: `${c.name}: ${f.capstone ? 'capstone selection' : 'selection'} (lvl ${f.level}) to build`,
              window: 'offer-builder',
              selection: { characterId: id, level: f.level },
            });
          break;
        case 'evolution':
          if (f.status === 'ready')
            out.push({
              key: `${id}:evolution`,
              text: `${c.name}: evolution to ${f.toGrade}-grade to build and release`,
              window: 'evolution-builder',
            });
          break;
        case 'upgrade':
          out.push({
            key: `${id}:upgrade-${f.skill}`,
            text: `${c.name}: [${f.skill}] can upgrade`,
            window: 'marks-review',
          });
          break;
        case 'merge':
          out.push({
            key: `${id}:merge-${f.skills.join('+')}`,
            text: `${c.name}: merge ready, [${f.skills[0]}] + [${f.skills[1]}]`,
            window: 'merge-builder',
          });
          break;
        case 'freePoints':
          break;
      }
    }
  }
  const unreviewed = state.practice.filter((e) => !e.reviewed).length;
  if (unreviewed > 0)
    out.push({
      key: 'practice',
      text: `${unreviewed} practice ${unreviewed === 1 ? 'entry' : 'entries'} to review`,
      window: 'practice-capture',
    });
  const requests = state.tradeOrder.filter((t) => {
    const trade = state.trades[t];
    return trade !== undefined && trade.status === 'open' && trade.to === null;
  }).length;
  if (requests > 0)
    out.push({
      key: 'requests',
      text: `${requests} player ${requests === 1 ? 'request' : 'requests'} to answer`,
      window: 'shops',
    });
  return out;
}
