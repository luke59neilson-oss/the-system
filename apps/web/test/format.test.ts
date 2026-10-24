import { describe, expect, it } from 'vitest';
import type { CampaignState } from '@the-system/engine';
import { friendlyError, notificationText } from '../src/format';
import { feedRows } from '../src/gm/feed';
import { matchesFilter } from '../src/player/history';

describe('notificationText', () => {
  it('says what the GM took, with the reason, and files it under items (M6.A)', () => {
    const n = {
      kind: 'itemsTaken' as const,
      characterId: 'j',
      items: [
        { name: 'Hunter Fang', count: 2 },
        { name: 'Bone Charm', count: 1 },
      ],
      reason: ' Confiscated ',
    };
    expect(notificationText(n)).toBe('The GM took [Hunter Fang] ×2 and [Bone Charm]: Confiscated');
    expect(notificationText({ ...n, items: [{ name: 'Pelt', count: 1 }], reason: '' })).toBe(
      'The GM took [Pelt]',
    );
    expect(matchesFilter(n, 'items')).toBe(true);
    expect(matchesFilter(n, 'dings')).toBe(false);
  });

  it('a GM give shows its reason when it has one (QF.19)', () => {
    const n = {
      kind: 'gift' as const,
      characterId: 'j',
      from: null,
      currency: 0,
      currencyName: 'Credits',
      items: [{ name: 'Hunter Fang', count: 2 }],
    };
    expect(notificationText(n)).toBe('You received [Hunter Fang] ×2 from the GM');
    expect(notificationText({ ...n, reason: ' For the bridge ' })).toBe(
      'You received [Hunter Fang] ×2 from the GM: For the bridge',
    );
    expect(notificationText({ ...n, reason: '  ' })).toBe(
      'You received [Hunter Fang] ×2 from the GM',
    );
  });

  it('a new profession is acquired at a level, not gained from level 1 (MQ.6)', () => {
    expect(
      notificationText({ kind: 'profession', characterId: 'j', name: 'Beast Tamer', level: 17 }),
    ).toBe("*'DING!' Profession acquired: [Beast Tamer] – lvl 17*");
  });

  it('uses the books wording for class and race level-ups', () => {
    expect(
      notificationText({
        kind: 'level',
        characterId: 'j',
        track: 'class',
        name: 'Archer',
        from: 4,
        to: 5,
        freePoints: 0,
      }),
    ).toBe("*'DING!' Class: [Archer] has reached level 5 - Stat points allocated*");
    expect(
      notificationText({
        kind: 'level',
        characterId: 'j',
        track: 'race',
        name: 'Human',
        from: 4,
        to: 5,
        freePoints: 3,
      }),
    ).toBe("*'DING!' Race: [Human] has reached level 5 - +3 free points*");
    expect(
      notificationText({
        kind: 'level',
        characterId: 'j',
        track: 'class',
        name: 'Archer',
        from: 1,
        to: 3,
        freePoints: 0,
      }),
    ).toBe("*'DING!' Class: [Archer] has gained levels 2–3 - Stat points allocated*");
  });

  it('shows broadcasts verbatim and free-point reminders', () => {
    expect(notificationText({ kind: 'broadcast', characterId: 'j', text: 'Day 2.' })).toBe(
      'Day 2.',
    );
    expect(notificationText({ kind: 'freePoints', characterId: 'j', unassigned: 0 })).toBe(
      'All free points assigned',
    );
  });
});

describe('friendlyError', () => {
  it('strips event ids and payload prefixes', () => {
    expect(
      friendlyError('Event 24dc: bad character.created payload: name: must not be blank'),
    ).toBe('Name: must not be blank');
    expect(friendlyError('Event e9 (system.broadcast): unknown character "x"')).toBe(
      'Unknown character "x"',
    );
    expect(friendlyError('Not allowed: only the GM can x')).toBe('Not allowed: only the GM can x');
  });
});

describe('feedRows', () => {
  const state = {
    characterOrder: ['j', 'm', 'c'],
    characters: { j: { name: 'Jake' }, m: { name: 'Miranda' }, c: { name: 'Casper' } },
  } as unknown as CampaignState;
  const b = (seq: number, characterId: string, text: string) => ({
    seq,
    at: '2026-10-21T00:00:00.000Z',
    day: 1,
    notification: { kind: 'broadcast' as const, characterId, text },
  });

  it('folds one broadcast to many into one row, newest first', () => {
    const rows = feedRows(
      [
        b(3, 'j', 'All'),
        b(3, 'm', 'All'),
        b(3, 'c', 'All'),
        b(4, 'j', 'Two'),
        b(4, 'm', 'Two'),
        b(5, 'c', 'One'),
        {
          seq: 6,
          at: '2026-10-21T00:00:00.000Z',
          day: 1,
          notification: { kind: 'freePoints', characterId: 'j', unassigned: 2 },
        },
      ],
      state,
    );
    expect(rows.map((r) => [r.who, r.text])).toEqual([
      ['Jake', 'Free points waiting to be assigned: 2'],
      ['Casper', 'One'],
      ['Jake, Miranda', 'Two'],
      ['Everyone', 'All'],
    ]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});

describe('skill upgrade DING (M5.3)', () => {
  it('reads like the books and counts as a DING in the history', () => {
    const n = {
      kind: 'skillUpgrade' as const,
      characterId: 'jake',
      skill: 'Basic Archery',
      from: 'Inferior',
      to: 'Common',
    };
    expect(notificationText(n)).toBe(
      "*'DING!' Skill upgraded: [Basic Archery (Inferior)] → [Basic Archery (Common)]*",
    );
    expect(matchesFilter(n, 'dings')).toBe(true);
    expect(matchesFilter(n, 'class')).toBe(false);
  });
});
