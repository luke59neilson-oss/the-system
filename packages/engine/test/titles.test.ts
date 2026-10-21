import { describe, expect, it } from 'vitest';
import { execute, projectForPlayer, type Campaign, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

const ctx = testContext('t');
const base = (): Campaign =>
  run(
    [
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
      { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
    ],
    ctx,
  );
const award = (title: string, characterId = 'jake'): Command => ({
  type: 'title.award',
  characterId,
  title,
});

describe('titles (M1.15 award; library and bonuses in M6.4)', () => {
  it('the GM awards titles by name, trimmed, in order', () => {
    const c = run([award('Forerunner'), award('  Rapid Spread ')], ctx, base());
    expect(c.state?.characters['jake']?.titles).toEqual(['Forerunner', 'Rapid Spread']);
    expect(c.state?.characters['kim']?.titles).toEqual([]);
  });

  it('refuses duplicates (any case), blanks, over-long names and unknown characters', () => {
    const c = run([award('Forerunner')], ctx, base());
    for (const cmd of [
      award('forerunner'),
      award('   '),
      award('x'.repeat(81)),
      award('Forerunner', 'ghost'),
    ]) {
      expect(execute(c, cmd, ctx).ok, JSON.stringify(cmd)).toBe(false);
    }
    // A raw (unchecked) command with a non-string title is refused, not thrown.
    const raw = { type: 'title.award', characterId: 'jake', title: 5 } as unknown as Command;
    expect(execute(c, raw, ctx).ok).toBe(false);
    // Another character may hold the same title.
    expect(execute(c, award('Forerunner', 'kim'), ctx).ok).toBe(true);
  });

  it('players cannot award titles, even to themselves', () => {
    const result = execute(base(), award('Self-made'), {
      ...ctx,
      actor: { role: 'player', characterId: 'jake' },
    });
    expect(result.ok).toBe(false);
  });

  it('undo removes the title; the owner sees titles, the party does not', () => {
    let c = run([award('Forerunner'), award('Oops')], ctx, base());
    const oops = c.events.at(-1)?.id ?? '';
    c = run([{ type: 'event.undo', eventId: oops }], ctx, c);
    const state = c.state;
    if (!state) throw new Error('no state');
    expect(state.characters['jake']?.titles).toEqual(['Forerunner']);
    expect(projectForPlayer(state, 'jake').me.titles).toEqual(['Forerunner']);
    expect(JSON.stringify(projectForPlayer(state, 'kim'))).not.toContain('Forerunner');
  });
});
