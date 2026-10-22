import { describe, expect, it } from 'vitest';
import {
  buildDemoEvents,
  buildSessionLog,
  emptyCampaign,
  appendEvent,
  execute,
  noteIsExportable,
  renderSessionLog,
  sessionLogBase,
  sessionLogBaseIsCurrent,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

const ctx = testContext('l');
const player = (characterId: string): CommandContext => ({
  ...ctx,
  actor: { role: 'player', characterId },
});
function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const result = execute(c, command, context);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}
/** The campaign as it was with only its first `n` events. */
function replayPrefix(c: Campaign, n: number): Campaign {
  let out = emptyCampaign();
  for (const event of c.events.slice(0, n)) out = appendEvent(out, event);
  return out;
}
const lastId = (c: Campaign) => c.events[c.events.length - 1]?.id ?? '';
const meta = { startedAt: '2026-10-21T12:00:00.000Z', writtenAt: '2026-10-21T12:05:00.000Z' };

const CANARY_JOURNAL = 'CANARY-unshared-journal-7d1';
const CANARY_GM = 'CANARY-gm-private-9f3';

/** A sitting that touches every kind of entry the log reports. */
function sitting(): { campaign: Campaign; fromSeq: number; earlierXp: string } {
  let c = run(
    [
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
      { type: 'character.create', id: 'kim', name: 'Kim', className: 'Warrior', classSkills: kit },
      {
        type: 'xp.award',
        track: 'class',
        amount: 100,
        participants: [{ characterId: 'kim' }],
        reason: 'before the sitting',
      },
    ],
    ctx,
  );
  const earlierXp = lastId(c);
  const fromSeq = c.events.length;
  const gm = (command: Command) => {
    c = ok(c, command);
  };
  gm({
    type: 'xp.award',
    track: 'class',
    amount: 400,
    participants: [{ characterId: 'jake' }, { characterId: 'kim' }],
    enemyLevel: 3,
    reason: 'Pale hunter pack',
  });
  gm({ type: 'title.award', characterId: 'jake', title: 'Hunter of the Pale' });
  gm({ type: 'system.broadcast', text: 'The whale\nstirs.', characterIds: null });
  gm({ type: 'item.define', id: 'ring', name: 'Ring of Dew', rarity: 'common', slot: null });
  gm({ type: 'gift.give', characterId: null, to: 'jake', items: { ring: 2 }, currency: 5 });
  gm({
    type: 'quest.create',
    questId: 'q1',
    title: 'Calm the whale',
    days: 30,
    visible: false,
    stability: { initial: 100, visible: true, rules: { harm: -5 } },
  });
  gm({ type: 'stability.applyAction', questId: 'q1', tag: 'harm', count: 2, reason: 'cut a gill' });
  gm({ type: 'campaign.advanceDay', days: 2 });
  c = ok(
    c,
    {
      type: 'practice.log',
      characterId: 'jake',
      action: 'Shot from the canopy',
      skills: [kit[0]?.name ?? '', kit[1]?.name ?? ''],
      stat: 'perception',
    },
    player('jake'),
  );
  c = ok(
    c,
    {
      type: 'practice.log',
      characterId: 'jake',
      action: 'Shot from the canopy',
      skills: [kit[0]?.name ?? '', kit[1]?.name ?? ''],
      stat: 'perception',
    },
    player('jake'),
  );
  c = ok(
    c,
    {
      type: 'note.create',
      characterId: 'jake',
      kind: 'journal',
      title: 'Secret',
      body: CANARY_JOURNAL,
    },
    player('jake'),
  );
  c = ok(
    c,
    {
      type: 'note.create',
      characterId: 'jake',
      kind: 'journal',
      title: 'Shared thoughts',
      body: '## Heading\nline two',
      shareable: true,
    },
    player('jake'),
  );
  c = ok(
    c,
    { type: 'note.create', characterId: 'kim', kind: 'party', title: 'Map', body: 'North is up' },
    player('kim'),
  );
  gm({ type: 'note.create', characterId: null, kind: 'gm', title: 'Twist', body: CANARY_GM });
  gm({
    type: 'note.create',
    characterId: null,
    kind: 'gm',
    title: 'Recap hook',
    body: 'Use the eel',
    tags: ['Export'],
  });
  // An award undone inside the sitting leaves no trace; an undo of an earlier event is noted.
  gm({
    type: 'xp.award',
    track: 'class',
    amount: 9999,
    participants: [{ characterId: 'kim' }],
    reason: 'MISTAKE-award',
  });
  gm({ type: 'event.undo', eventId: lastId(c) });
  gm({ type: 'event.undo', eventId: earlierXp });
  return { campaign: c, fromSeq, earlierXp };
}

describe('session log (M2.4)', () => {
  it('reports notable events, practice and shareable notes for the sitting', () => {
    const { campaign, fromSeq } = sitting();
    const log = buildSessionLog(campaign, fromSeq);
    const text = log.entries.map((e) => `${e.kind}|${e.text}`);
    expect(text).toContain(
      'xp|400 class XP for Pale hunter pack, enemy level 3: Jake 200, Kim 200',
    );
    expect(text.some((t) => t.startsWith('level|Jake: class Archer 0 → '))).toBe(true);
    expect(
      text.some((t) => t.startsWith('level|Jake: race Human 0 → ') && t.includes('free points')),
    ).toBe(true);
    expect(text).toContain('title|Jake earned the title Hunter of the Pale');
    expect(text).toContain('broadcast|System message to everyone: The whale stirs.');
    expect(text).toContain('item|GM gave Jake: 5 currency, 2× Ring of Dew');
    expect(text).toContain(
      'quest|New quest: Calm the whale (hidden from players), 30 days, World Stability 100',
    );
    expect(text).toContain(
      'stability|World Stability (Calm the whale): 100 → 90 (harm × 2; cut a gill)',
    );
    expect(text).toContain('day|Day 1 → 3');
    expect(text).toContain('undo|GM undid an earlier change');
    expect(text.join('\n')).not.toContain('MISTAKE');
    expect(text.join('\n')).not.toContain('before the sitting');
    expect(log.practice).toHaveLength(2);
    expect(log.practice.map((p) => p.repeat)).toEqual([false, true]);
    expect(log.practice[0]).toMatchObject({
      character: 'Jake',
      stat: 'Perception',
      source: 'player',
    });
    expect(log.notes.map((n) => n.title)).toEqual(['Shared thoughts', 'Map', 'Recap hook']);
    expect(log.day).toBe(3);
  });

  it('never includes unshared journal entries or untagged GM notes', () => {
    const { campaign, fromSeq } = sitting();
    const markdown = renderSessionLog(buildSessionLog(campaign, fromSeq), meta);
    expect(markdown).not.toContain(CANARY_JOURNAL);
    expect(markdown).not.toContain(CANARY_GM);
    expect(markdown).toContain('Use the eel');
    expect(markdown).toContain('North is up');
  });

  it('drops a journal entry again once its author unshares it', () => {
    let { campaign } = sitting();
    const { fromSeq } = sitting();
    const shared = Object.values(campaign.state?.notes ?? {}).find(
      (n) => n.title === 'Shared thoughts',
    );
    campaign = ok(
      campaign,
      { type: 'note.edit', noteId: shared?.id ?? '', characterId: 'jake', shareable: false },
      player('jake'),
    );
    const log = buildSessionLog(campaign, fromSeq);
    expect(log.notes.map((n) => n.title)).toEqual(['Map', 'Recap hook']);
  });

  it('keeps note bodies quoted so their markdown stays inside the note', () => {
    const { campaign, fromSeq } = sitting();
    const markdown = renderSessionLog(buildSessionLog(campaign, fromSeq), meta);
    expect(markdown).toContain('> ## Heading\n> line two');
    expect(markdown.split('\n').filter((l) => l.startsWith('## '))).toEqual([
      '## Timeline',
      '## Practice',
      '## Notes',
    ]);
    expect(markdown).toContain('- Sitting started: 2026-10-21T12:00:00.000Z');
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('is empty for a sitting with no events, and covers everything from 0', () => {
    const { campaign } = sitting();
    const empty = buildSessionLog(campaign, campaign.events.length);
    expect(empty.entries).toEqual([]);
    expect(empty.practice).toEqual([]);
    expect(empty.notes).toEqual([]);
    expect(renderSessionLog(empty, meta)).toContain('Nothing notable yet.');
    const all = buildSessionLog(campaign, 0);
    expect(all.entries.some((e) => e.text.startsWith('New character Jake'))).toBe(true);
    // The pre-sitting award is undone, so it is gone from the full log too.
    expect(all.entries.map((e) => e.text).join('\n')).not.toContain('before the sitting');
    expect(buildSessionLog(emptyCampaign(), 0)).toMatchObject({ entries: [], day: null });
  });

  it('describes the demo campaign (evolutions, selections, titles, items, stability) without GM notes', () => {
    const c = run([], ctx);
    let demo = c;
    for (const event of buildDemoEvents({ now: ctx.now, newId: ctx.newId })) {
      demo = appendEvent(demo, event);
    }
    demo = ok(demo, {
      type: 'note.create',
      characterId: null,
      kind: 'gm',
      title: 'x',
      body: CANARY_GM,
    });
    const log = buildSessionLog(demo, 0);
    const kinds = new Set(log.entries.map((e) => e.kind));
    for (const kind of ['evolution', 'selection', 'title', 'item', 'stability', 'level', 'quest']) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
    expect(log.entries.some((e) => /grade [A-Z] → [A-Z]/.test(e.text))).toBe(true);
    expect(renderSessionLog(log, meta)).not.toContain(CANARY_GM);
  });

  it('describes skill upgrades and merges, trades, renames, quest edits and status, and nudges', () => {
    const { campaign } = sitting();
    let c = campaign;
    const fromSeq = c.events.length;
    const [archery, stealth] = [kit[0]?.name ?? '', kit[1]?.name ?? ''];
    let session = 0;
    for (const name of [archery, stealth]) {
      for (const marks of [3, 4]) {
        for (let m = 0; m < marks; m++) {
          c = ok(c, {
            type: 'skill.awardMark',
            characterId: 'jake',
            skill: name,
            session: `m${++session}`,
          });
        }
        c = ok(c, { type: 'skill.upgrade', characterId: 'jake', skill: name });
      }
    }
    for (let i = 0; i < 3; i++) {
      c = ok(
        c,
        {
          type: 'practice.log',
          characterId: 'jake',
          action: `Shot ${i}`,
          skills: [archery, stealth],
        },
        { ...ctx, sessionId: `p${i}` },
      );
    }
    c = ok(c, {
      type: 'skill.merge',
      characterId: 'jake',
      skills: [archery, stealth],
      name: 'Shadow Shot',
    });
    c = ok(c, { type: 'character.rename', characterId: 'kim', name: 'Kimberly' });
    c = ok(
      c,
      {
        type: 'trade.propose',
        tradeId: 't1',
        characterId: 'jake',
        to: 'kim',
        give: { items: { ring: 1 } },
        get: {},
      },
      player('jake'),
    );
    c = ok(c, { type: 'trade.accept', tradeId: 't1', characterId: 'kim' }, player('kim'));
    c = ok(c, {
      type: 'holdings.adjust',
      characterId: 'kim',
      currency: -0,
      items: { ring: -1 },
      reason: 'lost it',
    });
    c = ok(c, { type: 'quest.edit', questId: 'q1', title: 'Soothe the whale' });
    c = ok(c, { type: 'stability.nudge', questId: 'q1', delta: 3 });
    c = ok(c, { type: 'quest.setStatus', questId: 'q1', status: 'completed' });
    c = ok(c, {
      type: 'character.setPortrait',
      characterId: 'jake',
      portrait: `${'a'.repeat(64)}.png`,
    });
    c = ok(c, { type: 'character.setPortrait', characterId: 'jake', portrait: null });
    const text = buildSessionLog(c, fromSeq).entries.map((e) => e.text);
    expect(text).toContain(`Jake earned a mark on ${archery}`);
    expect(text).toContain(`Jake upgraded ${archery}: Inferior → Common`);
    expect(text).toContain(`Jake upgraded ${stealth}: Common → Uncommon`);
    expect(text).toContain(`Jake merged ${archery} and ${stealth} into Shadow Shot (Rare)`);
    expect(text).toContain('Kim is now called Kimberly');
    expect(text).toContain('Jake has a new portrait');
    expect(text).toContain("Jake's portrait was removed");
    expect(text).toContain('Trade: Jake gave Kimberly 1× Ring of Dew; Kimberly gave nothing');
    expect(text).toContain("GM adjusted Kimberly's holdings: -1× Ring of Dew (lost it)");
    expect(text).toContain('Quest edited: Soothe the whale');
    expect(text).toContain('World Stability (Soothe the whale): 90 → 93 (GM nudge)');
    expect(text).toContain('Quest Soothe the whale: completed');
  });

  it('gives the same log from a cached base, and refuses a base an undo made stale', () => {
    const { campaign, fromSeq } = sitting();
    const full = buildSessionLog(campaign, fromSeq);
    // The sitting already undid a pre-sitting event, so a base taken now is current.
    const base = sessionLogBase(campaign, fromSeq);
    expect(sessionLogBaseIsCurrent(campaign, base)).toBe(true);
    expect(buildSessionLog(campaign, fromSeq, base)).toEqual(full);
    // A base from before that undo is stale: the builder ignores it and folds from 0.
    const undoSeq = campaign.events.findIndex(
      (e) => e.type === 'event.undone' && e.payload.eventId === campaign.events[3]?.id,
    );
    const before: Campaign = replayPrefix(campaign, undoSeq);
    const stale = sessionLogBase(before, fromSeq);
    expect(sessionLogBaseIsCurrent(campaign, stale)).toBe(false);
    expect(buildSessionLog(campaign, fromSeq, stale)).toEqual(full);
    // A wrong-sitting base is ignored too.
    expect(buildSessionLog(campaign, fromSeq, { ...base, fromSeq: 0 })).toEqual(full);
  });

  it('marks the file as GM-only', () => {
    const { campaign, fromSeq } = sitting();
    expect(renderSessionLog(buildSessionLog(campaign, fromSeq), meta)).toContain(
      'GM-only file: it includes hidden quests and GM reasons. Do not show it to players.',
    );
  });

  it('decides note visibility by kind', () => {
    const note = { id: 'n', author: null, title: '', body: '', createdAt: '', updatedAt: '' };
    expect(noteIsExportable({ ...note, kind: 'journal', tags: [], shareable: false })).toBe(false);
    expect(noteIsExportable({ ...note, kind: 'journal', tags: [], shareable: true })).toBe(true);
    expect(noteIsExportable({ ...note, kind: 'party', tags: [], shareable: true })).toBe(true);
    expect(noteIsExportable({ ...note, kind: 'gm', tags: ['exported'], shareable: false })).toBe(
      false,
    );
    expect(noteIsExportable({ ...note, kind: 'gm', tags: [' EXPORT '], shareable: false })).toBe(
      true,
    );
  });
});
