import { describe, expect, it } from 'vitest';
import { defaultRules, projectRules, type OwnSheet } from '@the-system/engine';
import { kindLabel, markProgress } from '../src/player/skillDetailModel';

const rules = projectRules(defaultRules());
const skill = (over: Partial<OwnSheet['skills'][number]>): OwnSheet['skills'][number] => ({
  name: 'Basic Archery',
  rarity: 'inferior',
  kind: 'class',
  nickname: null,
  unique: false,
  marks: 0,
  markSessions: [],
  description: null,
  flavor: null,
  marksNeeded: 3,
  nextRarity: 'common',
  atCeiling: false,
  ...over,
});

describe('markProgress (M3.5)', () => {
  it('counts toward the next rarity', () => {
    expect(markProgress(rules, 'G', skill({ marks: 1 }))).toEqual({
      text: '1 / 3 marks toward Common.',
      percent: 33,
      banked: false,
    });
  });

  it('says when an upgrade is ready', () => {
    expect(markProgress(rules, 'G', skill({ marks: 3 })).text).toBe(
      '3 / 3 marks toward Common. Ready: the GM can upgrade it.',
    );
  });

  it('explains banking at the grade ceiling and caps the bar', () => {
    const p = markProgress(
      rules,
      'F',
      skill({ rarity: 'rare', marks: 10, marksNeeded: 8, nextRarity: 'epic', atCeiling: true }),
    );
    expect(p.text).toBe(
      '10 / 8 marks toward Epic. Rare is the F-grade ceiling: marks bank until your next evolution.',
    );
    expect(p.percent).toBe(100);
    expect(p.banked).toBe(true);
  });

  it('has no bar at the top of the ladder', () => {
    expect(
      markProgress(
        rules,
        'S',
        skill({
          rarity: 'mythical',
          marks: 1,
          marksNeeded: null,
          nextRarity: null,
          atCeiling: true,
        }),
      ),
    ).toEqual({
      text: '1 mark. Mythical is the top of the mark ladder.',
      percent: null,
      banked: false,
    });
  });

  it('labels the kind', () => {
    expect(kindLabel('class')).toBe('Class skill');
    expect(kindLabel('profession')).toBe('Profession skill');
    expect(kindLabel('race')).toBe('Race skill');
  });
});
