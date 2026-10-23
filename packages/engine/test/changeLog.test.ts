import { describe, expect, it } from 'vitest';
import { changeLog, changeLogCategory, execute, type Campaign, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// M4.8: the GM's change log rows.

describe('changeLog (M4.8)', () => {
  it('lists every event but undo markers, in words, marking what was undone', () => {
    const ctx = testContext('c');
    const setup: Command[] = [
      { type: 'campaign.create', name: 'Log', rules: rawRules() },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
      { type: 'system.broadcast', text: 'Hello, Jake.' },
    ];
    let c: Campaign = run(setup, ctx);
    const broadcastId = c.events.at(-1)!.id;
    const r = execute(c, { type: 'event.undo', eventId: broadcastId }, ctx);
    if (!r.ok) throw new Error(r.error);
    c = r.campaign;
    const rows = changeLog(c);
    expect(rows.map((x) => x.type)).toEqual([
      'campaign.created',
      'character.created',
      'system.broadcast',
    ]);
    const last = rows.at(-1)!;
    expect(last.lines.join(' ')).toContain('Hello, Jake.');
    expect(last.category).toBe('messages');
    expect(last.undoneBy).toBe(c.events.at(-1)!.id);
    expect(rows[0]!.undoneBy).toBeNull();
    expect(rows[0]!.lines).toEqual(['Campaign created (Log)']);
    expect(rows[1]!.category).toBe('characters');
  });

  it('gives words to events the session log does not describe, never a raw type', () => {
    const ctx = testContext('w');
    const c = run(
      [
        { type: 'campaign.create', name: 'Words', rules: rawRules() },
        {
          type: 'character.create',
          id: 'jake',
          name: 'Jake',
          className: 'Archer',
          classSkills: kit,
        },
        { type: 'skillDef.define', name: 'Arcane Powershot', rarity: 'rare' },
        { type: 'skill.nickname', characterId: 'jake', skill: 'Basic Archery', nickname: 'Pew' },
      ] as Command[],
      ctx,
    );
    const rows = changeLog(c);
    const def = rows.find((r) => r.type === 'skillDef.defined')!;
    expect(def.lines).toEqual(['Skill added to the library (Arcane Powershot)']);
    expect(def.category).toBe('library');
    const nick = rows.find((r) => r.type === 'skill.nicknamed')!;
    expect(nick.lines).toEqual(['Jake skill nicknamed (Basic Archery)']);
    expect(rows.every((r) => !r.lines.includes(r.type))).toBe(true);
  });

  it('never shows a note title, so a private journal stays private', () => {
    const ctx = testContext('n');
    let c = run(
      [
        { type: 'campaign.create', name: 'Notes', rules: rawRules() },
        {
          type: 'character.create',
          id: 'jake',
          name: 'Jake',
          className: 'Archer',
          classSkills: kit,
        },
      ],
      ctx,
    );
    const r = execute(
      c,
      {
        type: 'note.create',
        characterId: 'jake',
        kind: 'journal',
        title: 'Secret plan',
        body: 'Betray Bob',
      },
      { ...ctx, actor: { role: 'player', characterId: 'jake' } },
    );
    if (!r.ok) throw new Error(r.error);
    c = r.campaign;
    const row = changeLog(c).at(-1)!;
    expect(row.type).toBe('note.created');
    expect(row.lines).toEqual(['Jake note written']);
    expect(JSON.stringify(row)).not.toContain('Secret');
    expect(JSON.stringify(row)).not.toContain('Betray');
  });
  it('files unknown event areas under campaign', () => {
    expect(changeLogCategory('mystery.thing')).toBe('campaign');
  });
});
