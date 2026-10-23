import { describe, expect, it } from 'vitest';
import {
  execute,
  pendingRulesMigrations,
  previewXpAward,
  replay,
  type Campaign,
  type Command,
} from '../src';
import { kit, run, testContext } from './helpers/events';
import { DEFAULT_RULES } from '../src/rules/defaults';

/** MR.3 (DESIGN §2, L16, D153): stored banking campaigns switch to XP overflow on load. */
const ctx = testContext('r');
function ok(c: Campaign, command: Command): Campaign {
  const result = execute(c, command, ctx);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}
const bankingRules = () => {
  const raw = JSON.parse(JSON.stringify(DEFAULT_RULES)) as { xp: Record<string, unknown> };
  delete raw.xp['overflow']; // rules stored before MQ.11 have no flag
  return raw as unknown;
};
const character = (id: string) => ({
  type: 'character.create' as const,
  id,
  name: id,
  className: 'Archer',
  classSkills: kit,
});
/** Jake at the G-grade top with banked class XP; Ana below the top. */
const stored = (): Campaign => {
  let c = run(
    [
      { type: 'campaign.create', name: 'Old', rules: bankingRules() },
      character('jake'),
      character('ana'),
    ],
    ctx,
  );
  c = ok(c, {
    type: 'xp.award',
    track: 'class',
    amount: 1000,
    participants: [{ characterId: 'jake' }],
  });
  c = ok(c, {
    type: 'xp.award',
    track: 'class',
    amount: 150,
    participants: [{ characterId: 'ana' }],
  });
  return c;
};

describe('XP overflow for every campaign (MR.3)', () => {
  it('a stored banking campaign needs the overflow migration; a new one does not', () => {
    const c = stored();
    expect(c.state?.rules.xp.overflow).toBe(false);
    expect(c.state?.characters['jake']?.classLevel).toBe(4);
    expect(c.state?.characters['jake']?.xp.class).toBe(600);
    expect(pendingRulesMigrations(c.state)).toEqual([
      { type: 'rules.migrate', migration: 'xpOverflow' },
    ]);
    const fresh = run([{ type: 'campaign.create', name: 'New', rules: DEFAULT_RULES }], ctx);
    expect(pendingRulesMigrations(fresh.state)).toEqual([]);
    expect(pendingRulesMigrations(null)).toEqual([]);
  });

  it('turns overflow on, clears banked XP on capped tracks only, and logs what went', () => {
    const before = stored();
    const result = execute(before, { type: 'rules.migrate', migration: 'xpOverflow' }, ctx);
    if (!result.ok) throw new Error(result.error);
    const event = result.events[0];
    expect(event?.type).toBe('rules.migrated');
    expect(event?.payload).toEqual({
      migration: 'xpOverflow',
      cleared: [{ characterId: 'jake', track: 'class', xp: 600 }],
    });
    const after = result.campaign.state;
    expect(after?.rules.xp.overflow).toBe(true);
    expect(after?.characters['jake']).toMatchObject({ classLevel: 4, xp: { class: 0 } });
    expect(after?.characters['ana']).toMatchObject({ classLevel: 1, xp: { class: 50 } });
    expect(pendingRulesMigrations(after ?? null)).toEqual([]);
    // The log replays to the same state.
    expect(replay(result.campaign.events).state).toEqual(after);
  });

  it('the GM award preview warns about lost XP once migrated', () => {
    const c = ok(stored(), { type: 'rules.migrate', migration: 'xpOverflow' });
    const state = c.state;
    if (!state) throw new Error('no state');
    const [jake] = previewXpAward(state.rules, state.characters, 'class', {
      amount: 300,
      participants: [{ characterId: 'jake' }],
    });
    expect(jake).toMatchObject({ gained: 300, lost: 300, overflowed: 0 });
    // Before the migration the same award banked silently.
    const old = stored().state;
    if (!old) throw new Error('no state');
    expect(
      previewXpAward(old.rules, old.characters, 'class', {
        amount: 300,
        participants: [{ characterId: 'jake' }],
      })[0],
    ).toMatchObject({ lost: 0 });
  });

  it('refuses a second migration and a player', () => {
    const c = ok(stored(), { type: 'rules.migrate', migration: 'xpOverflow' });
    const again = execute(c, { type: 'rules.migrate', migration: 'xpOverflow' }, ctx);
    expect(again).toMatchObject({ ok: false, error: expect.stringContaining('already on') });
    const player = execute(
      stored(),
      { type: 'rules.migrate', migration: 'xpOverflow' },
      { ...ctx, actor: { role: 'player', characterId: 'jake' } },
    );
    expect(player.ok).toBe(false);
  });
});
