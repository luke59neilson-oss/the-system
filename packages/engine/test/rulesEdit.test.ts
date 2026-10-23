import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, defaultRules, execute, type Campaign, type Command } from '../src';
import { rulesEditStateProblem, rulesStateProblems } from '../src/events/reducer';
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

  it('never turns XP overflow on by an edit: banked XP needs the migration', () => {
    const ctx = testContext('o');
    const legacy = edited((x) => (x.xp.overflow = false));
    const c = run([{ type: 'campaign.create', name: 'Old', rules: legacy }] as Command[], ctx);
    const r = execute(c, { type: 'rules.reset' }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/rules migration/);
  });

  it('refuses rules the campaign as it is does not fit, naming who', () => {
    const { c, ctx } = setup();
    const lv = execute(
      c,
      { type: 'xp.award', track: 'class', amount: 400, participants: [{ characterId: 'jake' }] },
      ctx,
    );
    if (!lv.ok) throw new Error(lv.error);
    expect(lv.campaign.state!.characters['jake']!.classLevel).toBe(4);
    const top = execute(
      lv.campaign,
      { type: 'rules.set', rules: edited((x) => (x.grades[0].topLevel = 3)) },
      ctx,
    );
    expect(top.ok).toBe(false);
    if (!top.ok) expect(top.error).toMatch(/Jake's class level 4 is above 3/);
    const ceiling = execute(
      c,
      { type: 'rules.set', rules: edited((x) => (x.grades[0].rarityCeiling = 'inferior')) },
      ctx,
    );
    expect(ceiling.ok).toBe(false);
    if (!ceiling.ok) expect(ceiling.error).toMatch(/\[Identify\] is above the G-grade ceiling/);
  });

  it('refuses fewer slots than are worn, and undoing the edit that added one', () => {
    const { c, ctx } = setup();
    const steps: Command[] = [
      { type: 'rules.set', rules: edited((x) => (x.economy.equipmentSlots[1].count = 2)) },
      { type: 'item.define', id: 'amulet', name: 'Amulet', rarity: 'common', slot: 'necklace' },
      { type: 'holdings.adjust', characterId: 'jake', items: { amulet: 2 } },
      { type: 'item.equip', characterId: 'jake', itemId: 'amulet', slot: 'necklace', index: 0 },
      { type: 'item.equip', characterId: 'jake', itemId: 'amulet', slot: 'necklace', index: 1 },
    ];
    let cur = c;
    for (const step of steps) {
      const r = execute(cur, step, ctx);
      if (!r.ok) throw new Error(r.error);
      cur = r.campaign;
    }
    const fewer = execute(cur, { type: 'rules.reset' }, ctx);
    expect(fewer.ok).toBe(false);
    if (!fewer.ok) expect(fewer.error).toMatch(/Jake has an item in Necklace slot 2/);
    const loosening = cur.events.find((e) => e.type === 'rules.edited')!;
    const undo = execute(cur, { type: 'event.undo', eventId: loosening.id }, ctx);
    expect(undo.ok).toBe(false);
    if (!undo.ok) expect(undo.error).toMatch(/later event depends on it/);
  });

  it('lets an unrelated edit through when the state already breaks a rule', () => {
    const { c } = setup();
    // A misfit the state already has (built by hand here, as a GM sheet edit
    // could) is not the edit's fault.
    const state = c.state!;
    const rules = {
      ...state.rules,
      grades: state.rules.grades.map((g, i) => (i === 0 ? { ...g, rarityCeiling: 'inferior' } : g)),
    };
    const odd = { ...state, rules };
    expect(rulesStateProblems(odd, rules).length).toBeGreaterThan(0);
    expect(
      rulesEditStateProblem(odd, {
        ...rules,
        economy: { ...rules.economy, currencyName: 'Shards' },
      }),
    ).toBeNull();
  });
});
