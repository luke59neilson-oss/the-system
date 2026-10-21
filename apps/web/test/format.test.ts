import { describe, expect, it } from 'vitest';
import { friendlyError, notificationText } from '../src/format';

describe('notificationText', () => {
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
