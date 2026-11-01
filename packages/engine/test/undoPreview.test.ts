import { describe, expect, it } from 'vitest';
import { changeLog, undoPreview, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// QF.62 (deep review playtest-6): a refused undo names the later change that blocks it.
describe('undo preview names the blocking change (QF.62)', () => {
  const commands: Command[] = [
    { type: 'campaign.create', name: 'Undo', rules: rawRules() },
    { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
    { type: 'character.rename', characterId: 'kim', name: 'Kimberly' },
  ];
  const c = run(commands, testContext('a'));
  it('gives the change-log line of the later change', () => {
    const created = c.events.find((e) => e.type === 'character.created')!;
    const renamed = c.events.find((e) => e.type === 'character.renamed')!;
    const p = undoPreview(c, created.id, '2026-11-01T00:00:00.000Z');
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.error).toContain('depends on it');
    const line = changeLog(c).find((r) => r.id === renamed.id)!.lines[0];
    expect(line).toBeTruthy();
    expect(p.blockedBy).toBe(line);
  });
  it('gives no blocker for a refusal that is not a dependency', () => {
    const p = undoPreview(c, c.events[0]!.id, '2026-11-01T00:00:00.000Z');
    expect(p.ok).toBe(false);
    expect(p.ok ? null : p.blockedBy).toBeUndefined();
  });
});
