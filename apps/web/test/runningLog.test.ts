import { describe, expect, it } from 'vitest';
import { gmChangeText, notificationText } from '../src/format';
import type { LiveNotification, SeqNotification } from '../src/live';
import { RUNNING_LOG_SIZE, filterHistory, isQueued, runningLog } from '../src/player/history';

// MU.2 (DESIGN §7 "Player log"): the running log and the GM-change wording.

const at = '2026-10-30T19:00:00.000Z';
const xp = (seq: number): SeqNotification => ({
  seq,
  at,
  day: 1,
  notification: {
    kind: 'gmChange',
    characterId: 'j',
    change: 'xp',
    subject: 'class',
    detail: String(seq),
  },
});

describe('running log (MU.2)', () => {
  it('keeps the last 20, newest first', () => {
    const items = Array.from({ length: 25 }, (_, i) => xp(i + 1));
    const rows = runningLog(items);
    expect(RUNNING_LOG_SIZE).toBe(20);
    expect(rows.map((r) => r.seq)).toEqual(Array.from({ length: 20 }, (_, i) => 25 - i));
    expect(runningLog([])).toEqual([]);
    expect(runningLog(items.slice(0, 3)).map((r) => r.seq)).toEqual([3, 2, 1]);
  });

  it('GM changes pop up, and equipping counts as an item notice', () => {
    const equip: LiveNotification = {
      kind: 'gmChange',
      characterId: 'j',
      change: 'equipped',
      subject: 'Bone Ring',
    };
    expect(isQueued(equip)).toBe(true);
    const items: SeqNotification[] = [{ seq: 1, at, day: 1, notification: equip }, xp(2)];
    expect(filterHistory(items, 'items', '').map((n) => n.seq)).toEqual([1]);
    expect(filterHistory(items, 'all', 'bone').map((n) => n.seq)).toEqual([1]);
  });
});

describe('GM change wording (MU.2)', () => {
  const t = (n: Omit<Extract<LiveNotification, { kind: 'gmChange' }>, 'kind' | 'characterId'>) =>
    gmChangeText({ kind: 'gmChange', characterId: 'j', ...n });
  it('says what changed, values included', () => {
    expect(t({ change: 'stats', diffs: [{ label: 'Strength', from: '1.0', to: '1.4' }] })).toBe(
      'The GM set your stats: Strength 1.0 → 1.4',
    );
    expect(
      t({
        change: 'pools',
        diffs: [
          { label: 'Health Points (HP)', from: '100', to: '50' },
          { label: 'Stamina', from: '100', to: '90' },
        ],
      }),
    ).toBe('The GM set your pools: Health Points (HP) 100 → 50, Stamina 100 → 90');
    expect(t({ change: 'xp', subject: 'class', detail: '50' })).toBe('+50 class XP');
    expect(t({ change: 'xp', subject: 'profession', detail: '7' })).toBe('+7 profession XP');
    expect(t({ change: 'skillGranted', subject: 'Quick Draw', detail: 'Common' })).toBe(
      '*Skill acquired: [Quick Draw (Common)]*',
    );
    expect(t({ change: 'equipped', subject: 'Bone Ring' })).toBe('The GM equipped [Bone Ring]');
    expect(t({ change: 'questStatus', subject: 'Find the heart', detail: 'completed' })).toBe(
      'Quest completed: Find the heart',
    );
    expect(t({ change: 'skillNickname', subject: 'Basic Archery', detail: '' })).toBe(
      'Nickname cleared: [Basic Archery]',
    );
    expect(notificationText({ kind: 'gmChange', characterId: 'j', change: 'portrait' })).toBe(
      'The GM changed your portrait',
    );
  });
});
