import { describe, expect, it } from 'vitest';
import { changeLog, execute, type Campaign, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// M4.8 (in progress): the GM's change log rows.

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
    expect(last.undoneBy).toBe(c.events.at(-1)!.id);
    expect(rows[0]!.undoneBy).toBeNull();
    expect(rows.every((x) => x.lines.length > 0)).toBe(true);
  });
});
