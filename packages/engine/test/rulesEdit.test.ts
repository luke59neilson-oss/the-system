import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, defaultRules, execute, type Campaign, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// M4.9 Rules settings: the GM edits the rules as an event; validation; reset.

const edited = (mutate: (r: Record<string, any>) => void) => {
  const r = rawRules() as Record<string, any>;
  mutate(r);
  return r;
};

function setup(): { c: Campaign; ctx: ReturnType<typeof testContext> } {
  const ctx = testContext('r');
  const c = run(
    [
      { type: 'campaign.create', name: 'Rules', rules: rawRules() },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
    ] as Command[],
    ctx,
  );
  return { c, ctx };
}

describe('rules.set (M4.9)', () => {
  it('replaces a value, and undo puts it back', () => {
    const { c, ctx } = setup();
    const r = execute(
      c,
      { type: 'rules.set', rules: edited((x) => (x.economy.currencyName = 'Shards')) },
      ctx,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.campaign.state!.rules.economy.currencyName).toBe('Shards');
    expect(r.campaign.events.at(-1)!.type).toBe('rules.edited');
    const u = execute(
      r.campaign,
      { type: 'event.undo', eventId: r.campaign.events.at(-1)!.id },
      ctx,
    );
    if (!u.ok) throw new Error(u.error);
    expect(u.campaign.state!.rules.economy.currencyName).toBe(DEFAULT_RULES.economy.currencyName);
  });

  it('rejects an invalid config with the reason', () => {
    const { c, ctx } = setup();
    const r = execute(
      c,
      { type: 'rules.set', rules: edited((x) => (x.xp.aboveLevelBonusPerLevel = -1)) },
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/invalid rules/);
  });

  it('keeps stat, grade and rarity ids fixed and XP overflow on', () => {
    const { c, ctx } = setup();
    const renamed = execute(
      c,
      { type: 'rules.set', rules: edited((x) => (x.stats.list[0].name = 'Might')) },
      ctx,
    );
    expect(renamed.ok).toBe(true);
    const dropped = execute(
      c,
      { type: 'rules.set', rules: edited((x) => (x.economy.equipmentSlots[0].id = 'ring9')) },
      ctx,
    );
    expect(dropped.ok).toBe(false);
    if (!dropped.ok) expect(dropped.error).toMatch(/equipment slots list/);
    const off = execute(
      c,
      { type: 'rules.set', rules: edited((x) => (x.xp.overflow = false)) },
      ctx,
    );
    expect(off.ok).toBe(false);
    if (!off.ok) expect(off.error).toMatch(/overflow/);
  });

  it('resets to the defaults', () => {
    const { c, ctx } = setup();
    const a = execute(
      c,
      { type: 'rules.set', rules: edited((x) => (x.economy.currencyName = 'Shards')) },
      ctx,
    );
    if (!a.ok) throw new Error(a.error);
    const b = execute(a.campaign, { type: 'rules.reset' }, ctx);
    if (!b.ok) throw new Error(b.error);
    expect(b.campaign.state!.rules).toEqual(defaultRules());
  });

  it('is GM-only', () => {
    const { c, ctx } = setup();
    const r = execute(
      c,
      { type: 'rules.reset' },
      { ...ctx, actor: { role: 'player', characterId: 'jake' } },
    );
    expect(r.ok).toBe(false);
  });
});
