import { describe, expect, it } from 'vitest';
import {
  DEMO_BROADCASTS,
  DEMO_CAMPAIGN_NAME,
  DEMO_CHARACTERS,
  DEMO_QUEST_TITLE,
  buildDemoEvents,
  characterEffectiveStats,
  poolMax,
  projectForPlayer,
  raceLevel,
  replay,
  selectionSlots,
  statBudgetTotal,
  type CampaignState,
} from '../src';

const ctx = () => {
  let n = 0;
  return { now: () => '2026-10-21T00:00:00.000Z', newId: () => `id-${++n}` };
};
const demoState = (): CampaignState => {
  const state = replay(buildDemoEvents(ctx())).state;
  if (!state) throw new Error('no state');
  return state;
};

describe('demo campaign (MS.4, M1.15)', () => {
  it('builds the party from ordinary GM commands (notes by their authors)', () => {
    const events = buildDemoEvents(ctx());
    // M3.10: journal entries and Miranda's party note are written by their players.
    expect(events.filter((e) => e.actor.role !== 'gm').map((e) => [e.type, e.actor])).toEqual([
      ['note.created', { role: 'player', characterId: 'demo-jake' }],
      ['note.created', { role: 'player', characterId: 'demo-jake' }],
      ['note.created', { role: 'player', characterId: 'demo-miranda' }],
    ]);
    const state = demoState();
    expect(state.name).toBe(DEMO_CAMPAIGN_NAME);
    expect(state.characterOrder).toEqual(DEMO_CHARACTERS.map((c) => c.id));
    expect(state.broadcasts.map((b) => b.text)).toEqual(DEMO_BROADCASTS);
  });

  it('has a character at each of grades G, F, E and D, reached through evolutions', () => {
    const state = demoState();
    const rows = DEMO_CHARACTERS.map((d) => {
      const c = state.characters[d.id];
      if (!c) throw new Error(d.id);
      return [c.grade, c.className, c.classLevel, c.profession, c.professionLevel];
    });
    expect(rows).toEqual([
      ['D', 'Tempest Warden', 52, 'Alchemist', 50],
      ['E', 'Storm Ranger', 22, 'Cook', 18],
      ['F', 'Ranger', 7, null, 0],
      ['G', 'Archer', 0, null, 0],
    ]);
    const jake = state.characters['demo-jake'];
    if (!jake) throw new Error('jake');
    expect(raceLevel(state.rules, jake)).toBe(51);
    // The evolutions transformed the first class skill at each grade.
    expect(jake.skills[0]).toMatchObject({ name: 'Expert Archery', rarity: 'rare' });
    expect(state.characters['demo-casper']?.skills[0]).toMatchObject({ name: 'Archery' });
    // DESIGN §4 budget, each level at its grade: base 90, G 4×6 = 24, F 10×8 = 80,
    // E 35×(8+4), then the class and race levels past each grade top.
    const budgets: Record<string, number> = {
      'demo-jake': 90 + 24 + 80 + 35 * 12 + 3 * 12 + 2 * 6,
      'demo-miranda': 90 + 24 + 80 + 8 * 8 + 6 * 4,
      'demo-casper': 90 + 24 + 3 * 5 + 3 * 3,
      'demo-sultan': 90,
    };
    for (const d of DEMO_CHARACTERS) {
      const c = state.characters[d.id];
      if (!c) throw new Error(d.id);
      expect(statBudgetTotal(c), d.id).toBe(budgets[d.id]);
      // Rested: every pool full.
      for (const pool of state.rules.pools) {
        expect(c.pools[pool.id], `${d.id} ${pool.id}`).toBe(poolMax(state.rules, c.stats, pool.id));
      }
    }
  });

  it('every reached selection has a menu; Jake and Miranda each have one left to pick', () => {
    const state = demoState();
    for (const d of DEMO_CHARACTERS) {
      const c = state.characters[d.id];
      if (!c) throw new Error(d.id);
      const reached = selectionSlots(state.rules).filter((s) => s.level <= c.classLevel);
      expect(
        c.selections.map((s) => s.level),
        d.id,
      ).toEqual(reached.map((s) => s.level));
      const open = c.selections.filter((s) => s.chosen === null).map((s) => s.level);
      expect(open, d.id).toEqual(d.id === 'demo-jake' ? [50] : d.id === 'demo-miranda' ? [20] : []);
    }
    // The player sees their own open menu.
    expect(projectForPlayer(state, 'demo-jake').me.selections.at(-1)?.chosen).toBeNull();
  });

  it('leaves the newest free-point batch for each levelled player to assign', () => {
    const state = demoState();
    for (const d of DEMO_CHARACTERS) {
      const c = state.characters[d.id];
      if (!c) throw new Error(d.id);
      const open = c.freePointBatches.filter((b) => b.allocation === null);
      expect(open.length, d.id).toBe(c.freePointBatches.length > 0 ? 1 : 0);
      expect(c.freePointBatches.slice(0, -1).every((b) => b.locked)).toBe(true);
    }
  });

  it('has titles and items; Jake wears gear that raises his effective stats', () => {
    const state = demoState();
    expect(state.characters['demo-jake']?.titles).toEqual(['Forerunner', 'Rapid Spread']);
    expect(projectForPlayer(state, 'demo-jake').me.titles).toEqual(['Forerunner', 'Rapid Spread']);
    expect(state.itemOrder).toEqual(['demo-ring-haste', 'demo-bow', 'demo-potion']);
    const holdings = state.holdings['demo-jake'];
    expect(holdings?.equipped).toEqual({ 'ring:0': 'demo-ring-haste', 'mainHand:0': 'demo-bow' });
    expect(holdings?.inventory).toEqual({ 'demo-potion': 2 });
    const jake = state.characters['demo-jake'];
    if (!jake) throw new Error('jake');
    const effective = characterEffectiveStats(state, 'demo-jake');
    expect(effective['agility']).toBeGreaterThan(jake.stats['agility'] ?? 0);
    expect(effective['perception']).toBe((jake.stats['perception'] ?? 0) + 3);
  });

  it('Jake has a nicknamed class skill, so the status screen can show one', () => {
    const state = demoState();
    const me = projectForPlayer(state, 'demo-jake').me;
    const first = me.skills.find((s) => s.kind === 'class');
    expect(first?.nickname).toBe('Old Faithful');
    expect(me.skills.filter((s) => s.nickname !== null)).toHaveLength(1);
    for (const id of ['demo-miranda', 'demo-casper', 'demo-sultan']) {
      expect(projectForPlayer(state, id).me.skills.every((s) => s.nickname === null)).toBe(true);
    }
  });

  it('every player sees the tutorial quest with its World Stability gauge, never its rules', () => {
    const state = demoState();
    for (const d of DEMO_CHARACTERS) {
      const view = projectForPlayer(state, d.id);
      expect(view.quests).toEqual([
        expect.objectContaining({
          title: DEMO_QUEST_TITLE,
          status: 'active',
          daysLeft: 26,
          stability: 100 - 3 * 5 + 2 * 2,
        }),
      ]);
      const json = JSON.stringify(view);
      expect(json).not.toContain('pale hunter');
      expect(json).not.toContain('Demo: tutorial fights');
    }
  });

  it('players never see another character’s open menu or the GM’s award reasons', () => {
    const state = demoState();
    const jakeMenu = state.characters['demo-jake']?.selections.at(-1)?.options ?? [];
    expect(jakeMenu.length).toBeGreaterThan(0);
    for (const d of DEMO_CHARACTERS.filter((c) => c.id !== 'demo-jake')) {
      const json = JSON.stringify(projectForPlayer(state, d.id));
      expect(json).not.toContain('Demo: brewing at camp');
      for (const o of jakeMenu) expect(json, `${d.id} sees ${o.name}`).not.toContain(o.name);
    }
  });

  it('is deterministic for a fixed clock and ids', () => {
    expect(buildDemoEvents(ctx())).toEqual(buildDemoEvents(ctx()));
  });
});
