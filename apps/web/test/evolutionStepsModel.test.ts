import { describe, expect, it } from 'vitest';
import { releaseBlockers, stepMeters, type DraftOption } from '../src/gm/evolutionStepsModel';

const o = (
  id: string,
  stats: Record<string, number>,
  free: number,
  bonus: Record<string, number>,
): DraftOption => ({
  id,
  name: id,
  rarity: 'common',
  description: '',
  stats,
  free,
  bonus,
});

describe('Evolutions tab model (ME.3)', () => {
  it('meters each option against the step budget and the first option’s bonus', () => {
    expect(
      stepMeters(
        [
          o('Hunter', { agility: 9 }, 2, { agility: 2 }),
          o('Ranger', { agility: 8 }, 2, { agility: 3 }),
        ],
        11,
      ),
    ).toEqual([
      { perLevel: 11, budget: 11, perLevelDiff: 0, bonus: 2, bonusDiff: 0 },
      { perLevel: 10, budget: 11, perLevelDiff: -1, bonus: 3, bonusDiff: 1 },
    ]);
  });

  it('blocks release for missing steps and budget problems, Override only past the latter', () => {
    const budgets = { class: 11, profession: 7, race: 6 };
    const draft = {
      class: [
        o('Hunter', { agility: 9 }, 2, { agility: 2 }),
        o('Ranger', { agility: 9 }, 2, { agility: 3 }),
      ],
      profession: [],
      race: [],
    };
    const blocked = releaseBlockers(draft, budgets, true);
    expect(blocked.hard).toEqual([
      'Add at least one race option',
      'Add at least one profession option: this character evolves their profession',
    ]);
    expect(blocked.overridable).toEqual([
      'Class options have unequal one-time bonuses (2, 3); make them equal or tick Override',
    ]);
    expect(
      releaseBlockers({ ...draft, race: [o('Human', {}, 6, {})] }, budgets, false).hard,
    ).toEqual([]);
  });
});
