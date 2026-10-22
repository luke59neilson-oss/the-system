import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  execute,
  nextSelectionLevel,
  practiceAlerts,
  projectForGm,
  repeatedEntryIds,
  searchNotes,
  skillPairCounts,
  type Campaign,
  type Command,
  type CommandContext,
  type PracticeEntry,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

const created: Command = { type: 'campaign.create', name: 'Whale', rules: rawRules() };
const make = (id: string, name: string): Command => ({
  type: 'character.create',
  id,
  name,
  className: 'Archer',
  classSkills: kit,
});
const ctx = testContext('p');
const base = (): Campaign => run([created, make('jake', 'Jake'), make('kim', 'Kim')], ctx);
const RULES = (base().state ?? (null as never)).rules;
const player = (characterId: string, sessionId: string | null = 's1'): CommandContext => ({
  ...ctx,
  sessionId,
  actor: { role: 'player', characterId },
});
const system: CommandContext = { ...ctx, actor: { role: 'system' } };

function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const result = execute(c, command, context);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}
function reject(c: Campaign, command: Command, context: CommandContext = ctx): string {
  const result = execute(c, command, context);
  expect(result.ok, JSON.stringify(command)).toBe(false);
  return result.ok ? '' : result.error;
}

const [archery, stealth, eye] = kit.map((k) => k.name) as [string, string, string];
const log = (
  characterId: string,
  action: string,
  skills: string[],
  stat: string | null = null,
): Extract<Command, { type: 'practice.log' }> => ({
  type: 'practice.log',
  characterId,
  action,
  skills,
  stat,
});

describe('practice log', () => {
  it('records character, action, skills/stat, tags, source and session', () => {
    const c = ok(
      base(),
      {
        type: 'practice.log',
        characterId: 'jake',
        action: 'Sniped the pale hunter from the trees',
        skills: [archery, stealth],
        stat: 'perception',
        tags: ['combat'],
      },
      player('jake'),
    );
    expect(c.state?.practice).toEqual([
      {
        id: c.events[c.events.length - 1]?.id,
        at: c.events[c.events.length - 1]?.timestamp,
        sessionId: 's1',
        characterId: 'jake',
        action: 'Sniped the pale hunter from the trees',
        skills: [archery, stealth],
        stat: 'perception',
        tags: ['combat'],
        source: 'player',
      },
    ]);
    const gm = ok(c, { ...log('kim', 'Montage: drills', [eye]), source: 'montage' });
    expect(gm.state?.practice[1]).toMatchObject({ source: 'montage', sessionId: 's1' });
    expect(ok(c, log('kim', 'Ran', [], 'agility')).state?.practice[1]?.source).toBe('gm');
  });

  it.each([
    [log('jake', 'x', []), 'name a skill or a stat'],
    [log('jake', 'x', ['Fireball']), 'no skill "Fireball"'],
    [log('jake', 'x', [archery, archery]), 'listed twice'],
    [log('jake', 'x', [], 'luck'), 'unknown stat'],
    [log('ghost', 'x', [archery]), 'unknown character'],
    [log('jake', '  ', [archery]), 'action'],
    [{ ...log('jake', 'x', [archery]), source: 'player' }, 'source "player"'],
  ])('rejects %j', (command, reason) => {
    expect(reject(base(), command as Command)).toContain(reason);
  });

  it('players log only for themselves and only as "player"', () => {
    expect(reject(base(), log('kim', 'x', [archery]), player('jake'))).toContain('own character');
    expect(
      reject(base(), { ...log('jake', 'x', [archery]), source: 'montage' }, player('jake')),
    ).toContain('source "player"');
  });

  const entry = (
    id: string,
    action: string,
    skills: string[],
    sessionId: string | null = 's1',
    characterId = 'jake',
  ): PracticeEntry => ({
    id,
    at: '2026-10-21T12:00:00.000Z',
    sessionId,
    characterId,
    action,
    skills,
    stat: null,
    tags: [],
    source: 'gm',
  });

  it('flags repeats: same character, session, action and skills', () => {
    const entries = [
      entry('a', 'Shot the wolf', [archery, eye]),
      entry('b', '  shot the WOLF. ', [eye, archery]),
      entry('c', 'Shot the wolf', [archery, eye], 's2'),
      entry('d', 'Shot the wolf', [archery]),
      entry('e', 'Shot the wolf', [archery, eye], 's1', 'kim'),
      entry('f', 'Shot the bear', [archery, eye]),
      entry('g', 'Shot the wolf', [archery, eye]),
      entry('h', 'Shot the wolf', [archery, eye], null),
      entry('i', 'Shot the wolf', [archery, eye], null),
    ];
    expect([...repeatedEntryIds(entries)]).toEqual(['b', 'g']);
  });

  it('counts skill pairs per character, ignoring repeats', () => {
    const entries = [
      entry('a', 'Volley', [archery, eye]),
      entry('b', 'Volley', [archery, eye]), // repeat
      entry('c', 'Ambush', [stealth, archery, eye]),
      entry('d', 'Ambush', [archery, eye], 's2'),
      entry('e', 'Volley', [archery, eye], 's1', 'kim'),
      entry('f', 'Sneak', [stealth]),
    ];
    expect(skillPairCounts(entries, 'jake')).toEqual([
      { skills: [archery, eye].sort(), count: 3 },
      { skills: [eye, stealth].sort(), count: 1 },
      { skills: [archery, stealth].sort(), count: 1 },
    ]);
    expect(skillPairCounts(entries, 'kim')).toEqual([{ skills: [archery, eye].sort(), count: 1 }]);
  });
});

describe('alerts', () => {
  it('finds the next selection level from the grade table', () => {
    const cases: [number, number | null][] = [
      [0, 5],
      [4, 5],
      [5, 10],
      [10, 15],
      [14, 15],
      [44, 45],
      [45, 50],
      [49, 50],
      [90, 100],
      [235, 240],
      [240, null],
    ];
    for (const [level, next] of cases) {
      expect(nextSelectionLevel(RULES, level), `level ${level}`).toBe(next);
    }
  });

  it('every selection level over a 0→240 run is found exactly once (29 selections)', () => {
    const found: number[] = [];
    for (let level = 0; level < 240; level++) {
      const next = nextSelectionLevel(RULES, level);
      if (next !== null && !found.includes(next)) found.push(next);
    }
    expect(found).toHaveLength(29);
  });

  it('raises a selection alert within the configured levels and a merge alert at 3 joint uses', () => {
    let c = base();
    const jake = () => c.state?.characters['jake'] ?? (null as never);
    const alerts = () =>
      practiceAlerts(c.state?.rules ?? (null as never), jake(), c.state?.practice ?? []);
    // Level 0, next selection at 5: exactly 5 away → alert (within 5).
    expect(DEFAULT_RULES.practice.selectionAlertWithinLevels).toBe(5);
    expect(alerts()).toEqual([{ kind: 'selection', characterId: 'jake', level: 5, levelsAway: 5 }]);
    c = ok(c, log('jake', 'Volley', [archery, eye]));
    c = ok(c, log('jake', 'Volley', [archery, eye])); // repeat: does not count
    c = ok(c, log('jake', 'Ambush', [archery, eye, stealth]));
    expect(alerts().filter((a) => a.kind === 'merge')).toEqual([]);
    c = ok(c, log('jake', 'Overwatch', [eye, archery]));
    expect(alerts().filter((a) => a.kind === 'merge')).toEqual([
      {
        kind: 'merge',
        characterId: 'jake',
        skills: [archery, eye].sort(),
        count: 3,
        // Inferior + Common are below the Uncommon merge minimum.
        rarityOk: false,
      },
    ]);
    expect(DEFAULT_RULES.skills.merge.requiredJointUses).toBe(3);
  });

  it('no selection alert when the next selection is further than the window', () => {
    let c = base();
    // Level 5 → next at 10, 5 away: alert. Then the window shrinks to 4 via rules.
    const own = c.state?.rules ?? (null as never);
    const rules = { ...own, practice: { selectionAlertWithinLevels: 4 } };
    const jake = c.state?.characters['jake'] ?? (null as never);
    expect(practiceAlerts(rules, jake, [])).toEqual([]);
    c = ok(c, {
      type: 'xp.award',
      track: 'class',
      amount: 100,
      participants: [{ characterId: 'jake' }],
    });
    const leveled = c.state?.characters['jake'] ?? (null as never);
    expect(leveled.classLevel).toBe(1);
    expect(practiceAlerts(rules, leveled, [])).toEqual([
      { kind: 'selection', characterId: 'jake', level: 5, levelsAway: 4 },
    ]);
  });
});

describe('notes', () => {
  const journal: Command = {
    type: 'note.create',
    noteId: 'j1',
    characterId: 'jake',
    kind: 'journal',
    title: 'Day 1',
    body: 'I do not trust **Casper**.',
    tags: ['npc:Casper'],
  };

  it('players keep private journals; the GM cannot read unshared entries', () => {
    let c = ok(base(), journal, player('jake'));
    expect(c.state?.notes['j1']).toMatchObject({
      kind: 'journal',
      author: 'jake',
      shareable: false,
    });
    const gmView = projectForGm(c.state ?? (null as never));
    expect(gmView.notes).toEqual({});
    expect(gmView.noteOrder).toEqual([]);
    expect(JSON.stringify(gmView)).not.toContain('Casper');
    c = ok(
      c,
      { type: 'note.edit', noteId: 'j1', characterId: 'jake', shareable: true },
      player('jake'),
    );
    expect(projectForGm(c.state ?? (null as never)).notes['j1']?.body).toContain('Casper');
    // Un-sharing hides it again.
    c = ok(
      c,
      { type: 'note.edit', noteId: 'j1', characterId: 'jake', shareable: false },
      player('jake'),
    );
    expect(projectForGm(c.state ?? (null as never)).notes).toEqual({});
  });

  it('the GM can neither write, edit, share nor delete a journal entry', () => {
    const c = ok(base(), journal, player('jake'));
    expect(reject(c, { ...journal, noteId: 'j2', characterId: null })).toContain(
      'only a player keeps a journal',
    );
    expect(reject(c, { ...journal, noteId: 'j2' })).toContain('written as yourself');
    expect(
      reject(c, { type: 'note.edit', noteId: 'j1', characterId: null, shareable: true }),
    ).toContain('only the author');
    expect(
      reject(c, { type: 'note.edit', noteId: 'j1', characterId: 'jake', body: 'x' }),
    ).toContain('written as yourself');
    expect(reject(c, { type: 'note.delete', noteId: 'j1', characterId: null })).toContain(
      'only the author',
    );
    expect(
      reject(c, { type: 'note.edit', noteId: 'j1', characterId: 'kim', body: 'x' }, player('kim')),
    ).toContain('unknown note');
    // M3.10: another player cannot tell a journal entry from a missing note.
    const why = (noteId: string) =>
      reject(c, { type: 'note.delete', noteId, characterId: 'kim' }, player('kim'))
        .replace(/^Event \S+ /, '')
        .replace(noteId, 'ID');
    expect(why('j1')).toBe(why('nope'));
    expect(reject(c, { ...journal, noteId: 'j3' }, system)).toContain('system does not write');
  });

  it('party notes are shared and editable by their author or the GM; GM notes are GM-only', () => {
    let c = ok(
      base(),
      {
        type: 'note.create',
        noteId: 'p1',
        characterId: 'kim',
        kind: 'party',
        body: 'Camp at the river',
      },
      player('kim'),
    );
    expect(c.state?.notes['p1']).toMatchObject({ shareable: true, author: 'kim' });
    c = ok(c, { type: 'note.edit', noteId: 'p1', characterId: null, tags: ['region:river'] });
    expect(
      reject(
        c,
        { type: 'note.edit', noteId: 'p1', characterId: 'jake', body: 'x' },
        player('jake'),
      ),
    ).toContain('only the author');
    expect(
      reject(c, { type: 'note.edit', noteId: 'p1', characterId: null, shareable: false }),
    ).toContain('only journal entries');
    expect(
      reject(c, { type: 'note.create', characterId: 'kim', kind: 'gm', body: 'x' }, player('kim')),
    ).toContain('only the GM');
    c = ok(c, {
      type: 'note.create',
      noteId: 'g1',
      characterId: null,
      kind: 'gm',
      body: 'Casper is the traitor',
    });
    expect(c.state?.notes['g1']).toMatchObject({ shareable: false, author: null });
    expect(
      reject(c, { type: 'note.edit', noteId: 'g1', characterId: 'kim', body: 'x' }, player('kim')),
    ).toContain('unknown note');
    expect(
      reject(c, { type: 'note.create', characterId: null, kind: 'gm', body: 'x', shareable: true }),
    ).toContain('never shared');
    expect(reject(c, { type: 'note.create', characterId: null, kind: 'party' })).toContain(
      'title or text',
    );
    expect(reject(c, { type: 'note.edit', noteId: 'g1', characterId: null })).toContain(
      'nothing to change',
    );
    c = ok(c, { type: 'note.delete', noteId: 'p1', characterId: 'kim' }, player('kim'));
    expect(c.state?.noteOrder).toEqual(['g1']);
    expect(reject(c, { type: 'note.delete', noteId: 'p1', characterId: null })).toContain(
      'unknown note',
    );
  });

  it('searches by words and tags, newest first', () => {
    let c = base();
    const at = (n: number): CommandContext => ({
      ...ctx,
      now: () => `2026-10-2${n}T12:00:00.000Z`,
    });
    c = ok(
      c,
      {
        type: 'note.create',
        noteId: 'a',
        characterId: null,
        kind: 'gm',
        title: 'Casper',
        body: 'Hides a key',
        tags: ['NPC:Casper'],
      },
      at(1),
    );
    c = ok(
      c,
      {
        type: 'note.create',
        noteId: 'b',
        characterId: null,
        kind: 'party',
        body: 'Casper owes us',
        tags: ['npc:casper', 'debt'],
      },
      at(2),
    );
    c = ok(
      c,
      { type: 'note.create', noteId: 'c', characterId: null, kind: 'party', body: 'The river' },
      at(3),
    );
    const notes = Object.values(c.state?.notes ?? {});
    expect(searchNotes(notes, { text: 'casper' }).map((n) => n.id)).toEqual(['b', 'a']);
    expect(searchNotes(notes, { tags: ['npc:casper'] }).map((n) => n.id)).toEqual(['b', 'a']);
    expect(searchNotes(notes, { tags: ['npc:casper', 'debt'] }).map((n) => n.id)).toEqual(['b']);
    expect(searchNotes(notes, { text: 'hides key' }).map((n) => n.id)).toEqual(['a']);
    expect(searchNotes(notes, { kinds: ['party'] }).map((n) => n.id)).toEqual(['c', 'b']);
    expect(searchNotes(notes, {}).map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('montages (M3.11)', () => {
  const clocked = (filled: number, failures = 0): Campaign => {
    let c = ok(base(), {
      type: 'clock.create',
      clockId: 'k',
      name: 'Cross the swamp',
      segments: 4,
    });
    if (filled > 0)
      c = ok(c, { type: 'clock.tick', clockId: 'k', result: 'success', amount: filled });
    for (let i = 0; i < failures; i++) {
      c = ok(c, { type: 'clock.tick', clockId: 'k', result: 'failure' });
    }
    return c;
  };
  const offer: Command = {
    type: 'montage.offer',
    montageId: 'm',
    clockId: 'k',
    characterIds: ['jake'],
  };
  const focus = (characterId: string, action = 'Scout ahead', skills = [archery]): Command => ({
    type: 'montage.focus',
    montageId: 'm',
    characterId,
    action,
    skills,
  });

  it('is offered only on a clock at least half filled with no failures', () => {
    expect(reject(clocked(1), offer)).toContain('does not qualify');
    expect(reject(clocked(2, 1), offer)).toContain('does not qualify');
    expect(reject(clocked(2), { ...offer, clockId: 'nope' })).toContain('unknown clock');
    expect(reject(clocked(2), { ...offer, characterIds: ['jake', 'jake'] })).toContain('twice');
    const c = ok(clocked(2), offer);
    // The label never defaults to the GM-only clock's name.
    expect(c.state?.montages['m']).toMatchObject({ label: 'Montage', status: 'open' });
    expect(reject(c, offer)).toContain('already exists');
    expect(reject(c, offer, player('jake'))).toContain('only the GM');
  });

  it('takes one focus per offered player and logs it as montage practice', () => {
    let c = ok(clocked(2), offer);
    c = ok(c, focus('jake'), player('jake'));
    const entry = c.state?.practice.at(-1);
    expect(entry).toMatchObject({
      characterId: 'jake',
      action: 'Scout ahead',
      skills: [archery],
      source: 'montage',
      tags: [],
    });
    expect(c.state?.montages['m']?.focuses).toEqual({ jake: entry?.id });
    expect(reject(c, focus('jake', 'Again'), player('jake'))).toContain('already given');
    // Kim was not offered it: to her it does not exist.
    expect(reject(c, focus('kim'), player('kim'))).toContain('unknown montage');
    expect(reject(c, focus('kim'))).toContain('not offered');
    expect(reject(c, focus('kim'), player('jake'))).toContain('their own character');
    c = ok(c, { type: 'montage.close', montageId: 'm' });
    expect(reject(c, { type: 'montage.close', montageId: 'm' })).toContain('already closed');
    const reopened = ok(ok(clocked(2), offer), { type: 'montage.close', montageId: 'm' });
    expect(reject(reopened, focus('jake'), player('jake'))).toContain('closed');
    expect(reject(ok(clocked(2), offer), focus('jake', 'x', ['Nope']))).toContain('no skill');
  });
});
