import { describe, expect, it } from 'vitest';
import {
  clampStability,
  daysLeft,
  defaultRules,
  execute,
  notificationHistory,
  projectForPlayer,
  type Campaign,
  type Command,
  type CommandContext,
  type Quest,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

const rules = defaultRules();
const ctx = testContext('q');
const base = (): Campaign =>
  run(
    [
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
    ],
    ctx,
  );
function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const r = execute(c, command, context);
  if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
  return r.campaign;
}
function reject(c: Campaign, command: Command, context: CommandContext = ctx): string {
  const r = execute(c, command, context);
  expect(r.ok, JSON.stringify(command)).toBe(false);
  return r.ok ? '' : r.error;
}
const quest = (c: Campaign, id = 'whale'): Quest => {
  const q = c.state?.quests[id];
  if (!q) throw new Error(`no quest ${id}`);
  return q;
};
const view = (c: Campaign) => {
  if (!c.state) throw new Error('no state');
  return projectForPlayer(c.state, 'jake');
};
/** The tutorial quest (DESIGN §8) with its stability rules. */
const tutorial = (extra: Partial<Extract<Command, { type: 'quest.create' }>> = {}): Command => ({
  type: 'quest.create',
  questId: 'whale',
  title: 'The world is dying',
  text: 'Find what is killing it. Delve to the heart of the world and purge the infection.',
  days: 30,
  stability: { rules: { cleanse: -5, 'kill-pale-hunter': -3, 'kill-beast': 2 } },
  ...extra,
});

describe('quests and World Stability (DESIGN §7)', () => {
  it('creates a quest with a day timer and stability from the config start', () => {
    const c = ok(base(), tutorial());
    expect(quest(c)).toMatchObject({
      status: 'active',
      visible: true,
      days: 30,
      startDay: 1,
      stability: { value: 100, visible: false, rules: { cleanse: -5 } },
    });
    expect(daysLeft(quest(c), c.state?.day ?? 0)).toBe(30);
  });

  it('rules: action tag → delta × count, clamped to 0–100', () => {
    let c = ok(base(), tutorial());
    c = ok(c, { type: 'stability.applyAction', questId: 'whale', tag: ' Cleanse ' });
    expect(quest(c).stability?.value).toBe(95);
    c = ok(c, {
      type: 'stability.applyAction',
      questId: 'whale',
      tag: 'kill-pale-hunter',
      count: 4,
    });
    expect(quest(c).stability?.value).toBe(83);
    c = ok(c, { type: 'stability.applyAction', questId: 'whale', tag: 'kill-beast', count: 20 });
    expect(quest(c).stability?.value, 'clamped at max').toBe(100);
    c = ok(c, { type: 'stability.applyAction', questId: 'whale', tag: 'cleanse', count: 30 });
    expect(quest(c).stability?.value, 'clamped at min').toBe(0);
    expect(reject(c, { type: 'stability.applyAction', questId: 'whale', tag: 'dance' })).toMatch(
      /no stability rule for "dance"/,
    );
    expect(
      reject(c, { type: 'stability.applyAction', questId: 'whale', tag: 'cleanse', count: 0 }),
    ).toMatch(/count|too small|>=1/i);
    expect(clampStability(rules, 140)).toBe(100);
    expect(clampStability(rules, -3)).toBe(0);
  });

  it('manual nudge, clamped; edits replace the rules', () => {
    let c = ok(base(), tutorial({ stability: { initial: 50, rules: { cleanse: -5 } } }));
    c = ok(c, {
      type: 'stability.nudge',
      questId: 'whale',
      delta: 7.5,
      reason: 'the whale shudders',
    });
    expect(quest(c).stability?.value).toBe(57.5);
    c = ok(c, { type: 'stability.nudge', questId: 'whale', delta: 999 });
    expect(quest(c).stability?.value).toBe(100);
    expect(reject(c, { type: 'stability.nudge', questId: 'whale', delta: 0 })).toMatch(/non-zero/);
    c = ok(c, { type: 'quest.edit', questId: 'whale', stabilityRules: { heal: 4 } });
    expect(reject(c, { type: 'stability.applyAction', questId: 'whale', tag: 'cleanse' })).toMatch(
      /no stability rule/,
    );
    expect(
      reject(c, { type: 'quest.edit', questId: 'whale', stabilityRules: { 'Big Tag ': 4 } }),
    ).toMatch(/lower-case/);
    expect(reject(c, { type: 'quest.edit', questId: 'whale', stabilityRules: { x: 0 } })).toMatch(
      /non-zero/,
    );
    expect(reject(c, { type: 'quest.edit', questId: 'whale', stabilityRules: { x: 101 } })).toMatch(
      /at most 100/,
    );
    expect(reject(c, { type: 'quest.edit', questId: 'whale' })).toMatch(/nothing to change/);
  });

  it('rejects bad quests and quests without stability', () => {
    let c = ok(base(), tutorial());
    expect(reject(c, tutorial())).toMatch(/already exists/);
    expect(reject(c, tutorial({ questId: 'q2', stability: { initial: 120, rules: {} } }))).toMatch(
      /between 0 and 100/,
    );
    expect(reject(c, tutorial({ questId: 'q3', days: 0 }))).toMatch(/days/);
    c = ok(c, { type: 'quest.create', questId: 'side', title: 'Find the survivors' });
    expect(quest(c, 'side')).toMatchObject({ stability: null, days: null, text: '' });
    expect(reject(c, { type: 'stability.nudge', questId: 'side', delta: 1 })).toMatch(
      /no World Stability/,
    );
    expect(reject(c, { type: 'quest.edit', questId: 'side', stabilityVisible: true })).toMatch(
      /no World Stability/,
    );
    expect(reject(c, { type: 'stability.nudge', questId: 'ghost', delta: 1 })).toMatch(
      /unknown quest/,
    );
  });

  it('day counter and timers; status changes; a closed quest takes no actions', () => {
    let c = ok(base(), { type: 'campaign.advanceDay', days: 4 });
    c = ok(c, tutorial());
    expect(quest(c).startDay).toBe(5);
    c = ok(c, { type: 'campaign.advanceDay' });
    expect(c.state?.day).toBe(6);
    expect(view(c).quests[0]?.daysLeft).toBe(29);
    c = ok(c, { type: 'campaign.advanceDay', days: 31 });
    expect(view(c).quests[0]?.daysLeft).toBe(-2);
    c = ok(c, { type: 'quest.edit', questId: 'whale', days: null });
    expect(view(c).quests[0]?.daysLeft).toBeNull();
    c = ok(c, { type: 'quest.setStatus', questId: 'whale', status: 'completed' });
    expect(reject(c, { type: 'quest.setStatus', questId: 'whale', status: 'completed' })).toMatch(
      /already completed/,
    );
    expect(reject(c, { type: 'stability.applyAction', questId: 'whale', tag: 'cleanse' })).toMatch(
      /is completed/,
    );
    expect(reject(c, { type: 'campaign.advanceDay', days: 0 })).toMatch(/days/);
    // The GM's manual nudge still works on a closed quest (an override).
    c = ok(c, { type: 'stability.nudge', questId: 'whale', delta: -10 });
    expect(quest(c).stability?.value).toBe(90);
  });

  it('visibility: hidden quests and hidden gauges never reach players; the GM toggles them', () => {
    let c = ok(base(), tutorial({ visible: false }));
    c = ok(c, { type: 'stability.applyAction', questId: 'whale', tag: 'cleanse' });
    const hidden = JSON.stringify(view(c));
    expect(view(c).quests).toEqual([]);
    expect(hidden).not.toContain('dying');
    c = ok(c, { type: 'quest.edit', questId: 'whale', visible: true });
    expect(view(c).quests).toEqual([
      {
        id: 'whale',
        title: 'The world is dying',
        text: expect.stringContaining('Delve') as unknown as string,
        status: 'active',
        daysLeft: 30,
        stability: null,
        stabilityPercent: null,
      },
    ]);
    expect(JSON.stringify(view(c))).not.toContain('cleanse');
    c = ok(c, { type: 'quest.edit', questId: 'whale', stabilityVisible: true });
    expect(view(c).quests[0]?.stability).toBe(95);
    expect(view(c).quests[0]?.stabilityPercent).toBe(95);
    expect(JSON.stringify(view(c))).not.toContain('kill-pale-hunter');
    expect(view(c).day).toBe(1);
  });

  it('a new quest gauge follows the config default visibility', () => {
    const raw = rawRules() as { stability: { visibleToPlayersByDefault: boolean } };
    raw.stability.visibleToPlayersByDefault = true;
    let c = run(
      [
        { type: 'campaign.create', name: 'Open', rules: raw },
        {
          type: 'character.create',
          id: 'jake',
          name: 'Jake',
          className: 'Archer',
          classSkills: kit,
        },
      ],
      testContext('o'),
    );
    c = ok(c, tutorial());
    expect(quest(c).stability?.visible).toBe(true);
    expect(view(c).quests[0]?.stability).toBe(100);
  });

  it('the gauge percent follows the configured range (M3.8)', () => {
    const raw = rawRules() as { stability: { min: number; max: number; initial: number } };
    raw.stability.min = -50;
    raw.stability.max = 150;
    let c = run(
      [
        { type: 'campaign.create', name: 'Range', rules: raw },
        {
          type: 'character.create',
          id: 'jake',
          name: 'Jake',
          className: 'Archer',
          classSkills: kit,
        },
      ],
      testContext('r'),
    );
    c = ok(c, tutorial({ stability: { initial: 0, visible: true, rules: {} } }));
    expect(view(c).quests[0]).toMatchObject({ stability: 0, stabilityPercent: 25 });
  });

  it('only the GM manages quests; undo restores stability', () => {
    let c = ok(base(), tutorial());
    const asJake: CommandContext = { ...ctx, actor: { role: 'player', characterId: 'jake' } };
    for (const command of [
      tutorial({ questId: 'mine' }),
      { type: 'stability.applyAction', questId: 'whale', tag: 'cleanse' },
      { type: 'stability.nudge', questId: 'whale', delta: 1 },
      { type: 'campaign.advanceDay' },
      { type: 'quest.setStatus', questId: 'whale', status: 'failed' },
    ] as Command[]) {
      expect(reject(c, command, asJake)).toMatch(/only the GM|own character/);
    }
    c = ok(c, { type: 'stability.applyAction', questId: 'whale', tag: 'cleanse', count: 2 });
    c = ok(c, { type: 'event.undo', eventId: c.events.at(-1)?.id ?? '' });
    expect(quest(c).stability?.value).toBe(100);
  });
});

describe('hidden quest notice (MQ.7, DESIGN §7)', () => {
  const party = (): Campaign =>
    ok(base(), {
      type: 'character.create',
      id: 'mira',
      name: 'Miranda',
      className: 'Archer',
      classSkills: kit,
    });
  const seen = (c: Campaign, id: string) => {
    if (!c.state) throw new Error('no state');
    return projectForPlayer(c.state, id);
  };
  /** Hidden-quest notices per character, from the folded history. */
  const told = (c: Campaign) =>
    notificationHistory(c)
      .filter((h) => h.notification.kind === 'hiddenQuest')
      .map((h) => h.notification.characterId);
  const secret = (extra: Partial<Extract<Command, { type: 'quest.create' }>> = {}): Command => ({
    type: 'quest.create',
    questId: 'secret',
    title: 'SECRET-title',
    text: 'SECRET-text',
    visible: false,
    days: 3,
    stability: { visible: true, rules: { 'secret-tag': -4 } },
    ...extra,
  });

  it('tells every character by default, with a count and nothing else', () => {
    const c = ok(party(), secret());
    expect(quest(c, 'secret').noticeTo).toBeNull();
    expect(told(c)).toEqual(['jake', 'mira']);
    for (const id of ['jake', 'mira']) {
      const v = seen(c, id);
      expect(v.hiddenQuests).toBe(1);
      expect(v.quests).toEqual([]);
      expect(JSON.stringify(v)).not.toMatch(/SECRET|secret-tag/);
      expect(JSON.stringify(v)).not.toContain('"secret"');
    }
  });

  it('tells only the affected players when the GM names them', () => {
    const c = ok(party(), secret({ noticeTo: ['mira'] }));
    expect(told(c)).toEqual(['mira']);
    expect(seen(c, 'mira').hiddenQuests).toBe(1);
    expect(seen(c, 'jake').hiddenQuests).toBe(0);
  });

  it('a visible quest sends no notice; hiding it later does', () => {
    let c = ok(party(), secret({ visible: true }));
    expect(told(c)).toEqual([]);
    expect(seen(c, 'jake').hiddenQuests).toBe(0);
    c = ok(c, { type: 'quest.edit', questId: 'secret', visible: false });
    expect(told(c)).toEqual(['jake', 'mira']);
  });

  it('widening the notice list tells only the newly affected; narrowing tells nobody', () => {
    let c = ok(party(), secret({ noticeTo: ['jake'] }));
    c = ok(c, { type: 'quest.edit', questId: 'secret', noticeTo: ['jake', 'mira'] });
    expect(told(c)).toEqual(['jake', 'mira']);
    c = ok(c, { type: 'quest.edit', questId: 'secret', noticeTo: ['mira'] });
    expect(told(c)).toEqual(['jake', 'mira']);
    expect(seen(c, 'jake').hiddenQuests).toBe(0);
    c = ok(c, { type: 'quest.edit', questId: 'secret', noticeTo: null });
    expect(quest(c, 'secret').noticeTo).toBeNull();
    expect(told(c)).toEqual(['jake', 'mira', 'jake']);
  });

  it('a revealed, completed or failed quest is no longer counted; reopening tells again', () => {
    let c = ok(party(), secret());
    c = ok(c, { type: 'quest.setStatus', questId: 'secret', status: 'completed' });
    expect(seen(c, 'jake').hiddenQuests).toBe(0);
    c = ok(c, { type: 'quest.setStatus', questId: 'secret', status: 'active' });
    expect(seen(c, 'jake').hiddenQuests).toBe(1);
    expect(told(c)).toEqual(['jake', 'mira', 'jake', 'mira']);
    c = ok(c, { type: 'quest.edit', questId: 'secret', visible: true });
    expect(seen(c, 'jake').hiddenQuests).toBe(0);
    expect(seen(c, 'jake').quests.map((q) => q.title)).toEqual(['SECRET-title']);
  });

  it('counts several hidden quests; a character created later is counted under "everyone"', () => {
    let c = ok(base(), secret());
    c = ok(c, secret({ questId: 'other', noticeTo: ['jake'] }));
    c = ok(c, {
      type: 'character.create',
      id: 'mira',
      name: 'Miranda',
      className: 'Archer',
      classSkills: kit,
    });
    expect(seen(c, 'jake').hiddenQuests).toBe(2);
    expect(seen(c, 'mira').hiddenQuests).toBe(1);
    // Miranda joins after both: she is told of the one meant for everyone.
    expect(told(c)).toEqual(['jake', 'jake', 'mira']);
  });

  it('refuses unknown or repeated characters and an empty edit; undo removes the notice', () => {
    const c = party();
    expect(reject(c, secret({ noticeTo: ['ghost'] }))).toMatch(/ghost/);
    expect(reject(c, secret({ noticeTo: ['jake', 'jake'] }))).toMatch(/listed twice/);
    let d = ok(c, secret({ noticeTo: ['jake'] }));
    expect(reject(d, { type: 'quest.edit', questId: 'secret', noticeTo: ['ghost'] })).toMatch(
      /ghost/,
    );
    expect(reject(d, { type: 'quest.edit', questId: 'secret' })).toMatch(/nothing to change/);
    d = ok(d, { type: 'event.undo', eventId: d.events.at(-1)?.id ?? '' });
    expect(told(d)).toEqual([]);
    expect(seen(d, 'jake').hiddenQuests).toBe(0);
  });

  it('only the GM sets who is told', () => {
    const c = ok(party(), secret());
    const asJake: CommandContext = { ...ctx, actor: { role: 'player', characterId: 'jake' } };
    expect(
      reject(c, { type: 'quest.edit', questId: 'secret', noticeTo: ['jake'] }, asJake),
    ).toMatch(/only the GM|own character/);
  });
});
