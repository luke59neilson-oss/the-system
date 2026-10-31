import { describe, expect, it } from 'vitest';
import {
  buildDemoEvents,
  execute,
  replay,
  projectForPlayer,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

const ctx = testContext('id');
const base = (): Campaign =>
  run(
    [
      { type: 'campaign.create', name: 'Whale', rules: rawRules() },
      { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
      { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
    ],
    ctx,
  );
function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const r = execute(c, command, context);
  if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
  return r.campaign;
}
function reject(c: Campaign, command: Command): string {
  const r = execute(c, command, ctx);
  expect(r.ok, JSON.stringify(command)).toBe(false);
  return r.ok ? '' : r.error;
}
const view = (c: Campaign, id = 'jake') => {
  if (!c.state) throw new Error('no state');
  const p = projectForPlayer(c.state, id);
  // MV.3: the bestiary's entries, flattened in category order.
  return { ...p, identify: p.bestiary.categories.flatMap((g) => g.entries) };
};
/** No grade or level: always in range (MQ.8). */
const open = { inRange: true, grade: null, level: null } as const;
const TIERS = [
  { minRarity: 'common', text: '[Malignant Miasma]' },
  { minRarity: 'uncommon', text: '[Fever]' },
  { minRarity: 'rare', text: '[The Host’s Response]' },
];
const curse = (extra: Partial<Extract<Command, { type: 'entity.define' }>> = {}): Command => ({
  type: 'entity.define',
  entityId: 'curse',
  name: 'Curse energy (immune response)',
  label: 'The black miasma',
  tiers: TIERS,
  knownBy: ['jake'],
  ...extra,
});
describe('Identify entities (M3.9, DESIGN §7)', () => {
  it('defines an entity; only characters who know it see it, by label, at their tier', () => {
    const c = ok(base(), curse());
    expect(c.state?.entities.curse).toMatchObject({
      name: 'Curse energy (immune response)',
      label: 'The black miasma',
      knownBy: ['jake'],
    });
    expect(c.state?.entityOrder).toEqual(['curse']);
    expect(view(c).identify).toEqual([
      { id: 'curse', label: 'The black miasma', ...open, text: '[Malignant Miasma]' },
    ]);
    expect(view(c, 'kim').identify).toEqual([]);
    const json = JSON.stringify(view(c));
    expect(json).not.toContain('immune response');
    expect(json).not.toContain('[Fever]');
    expect(json).not.toContain('Host');
  });

  it('keeps one Identify text: the lowest tier; the others go to the GM notes (MV.3)', () => {
    const c = ok(base(), curse({ knownBy: ['jake', 'kim'], notes: 'Spreads at night.' }));
    expect(c.state?.entities.curse?.tiers).toEqual([TIERS[0]]);
    expect(c.state?.entities.curse?.notes).toBe(
      'Spreads at night.\n\nOther Identify tiers (before one text per entity):\n' +
        'Uncommon: [Fever]\nRare: [The Host’s Response]',
    );
    expect(view(c).identify[0]?.text).toBe('[Malignant Miasma]');
    expect(view(c, 'kim').identify[0]?.text).toBe('[Malignant Miasma]');
    expect(JSON.stringify(view(c))).not.toContain('Fever');
    // An edit repeating a moved tier does not add it to the notes twice.
    const again = ok(c, { type: 'entity.edit', entityId: 'curse', tiers: TIERS });
    expect(again.state?.entities.curse?.notes).toBe(c.state?.entities.curse?.notes);
  });

  it('tiers in any order keep the lowest rarity’s text, whatever the viewer’s Identify', () => {
    const c = ok(
      base(),
      curse({
        tiers: [
          { minRarity: 'rare', text: 'deep' },
          { minRarity: 'uncommon', text: 'mid' },
        ],
      }),
    );
    expect(view(c).identify).toEqual([
      { id: 'curse', label: 'The black miasma', ...open, text: 'mid' },
    ]);
    expect(c.state?.entities.curse?.notes).toContain('Rare: deep');
  });

  it('label defaults to the name; knownBy defaults to nobody', () => {
    const c = ok(base(), {
      type: 'entity.define',
      entityId: 'drum',
      name: 'The Drum',
      tiers: TIERS,
    });
    expect(c.state?.entities.drum).toMatchObject({ label: 'The Drum', knownBy: [] });
    expect(view(c).identify).toEqual([]);
  });

  it('reveals to the named characters, or to everyone who does not know it yet', () => {
    let c = ok(base(), curse({ knownBy: [] }));
    c = ok(c, { type: 'entity.reveal', entityId: 'curse', characterIds: ['kim'] });
    expect(c.state?.entities.curse?.knownBy).toEqual(['kim']);
    c = ok(c, { type: 'entity.reveal', entityId: 'curse' });
    expect(c.state?.entities.curse?.knownBy).toEqual(['kim', 'jake']);
    expect(view(c).identify).toHaveLength(1);
    expect(reject(c, { type: 'entity.reveal', entityId: 'curse' })).toMatch(
      /already knows this entity/,
    );
    expect(reject(c, { type: 'entity.reveal', entityId: 'curse', characterIds: ['kim'] })).toMatch(
      /already knows/,
    );
  });

  it('edits label and tiers; the player view follows', () => {
    let c = ok(base(), curse());
    c = ok(c, { type: 'entity.edit', entityId: 'curse', label: 'Black fog' });
    c = ok(c, {
      type: 'entity.edit',
      entityId: 'curse',
      tiers: [{ minRarity: 'common', text: '[Miasma]' }],
    });
    expect(view(c).identify).toEqual([
      { id: 'curse', label: 'Black fog', ...open, text: '[Miasma]' },
    ]);
    expect(c.state?.entities.curse?.name).toBe('Curse energy (immune response)');
    expect(reject(c, { type: 'entity.edit', entityId: 'curse' })).toMatch(/nothing to change/);
  });

  it('rejects bad input', () => {
    const c = ok(base(), curse());
    expect(reject(c, curse())).toMatch(/already exists/);
    expect(reject(base(), curse({ tiers: [] }))).toMatch(/tiers/);
    expect(reject(base(), curse({ tiers: [{ minRarity: 'nope', text: 'x' }] }))).toMatch(
      /unknown rarity "nope"/,
    );
    expect(
      reject(
        base(),
        curse({
          tiers: [
            { minRarity: 'rare', text: 'a' },
            { minRarity: 'rare', text: 'b' },
          ],
        }),
      ),
    ).toMatch(/two tiers/);
    expect(reject(base(), curse({ tiers: [{ minRarity: 'common', text: '  ' }] }))).toMatch(/text/);
    expect(reject(base(), curse({ knownBy: ['ghost'] }))).toMatch(/unknown character "ghost"/);
    expect(reject(base(), curse({ knownBy: ['jake', 'jake'] }))).toMatch(/listed twice/);
    expect(reject(base(), curse({ label: ' ' }))).toMatch(/label/);
    expect(reject(c, { type: 'entity.edit', entityId: 'constructor', label: 'x' })).toMatch(
      /unknown entity/,
    );
    expect(reject(c, { type: 'entity.reveal', entityId: 'nope', characterIds: ['kim'] })).toMatch(
      /unknown entity/,
    );
    expect(
      reject(c, { type: 'entity.reveal', entityId: 'curse', characterIds: ['ghost'] }),
    ).toMatch(/unknown character/);
  });

  it('players cannot define, edit or reveal entities', () => {
    const c = ok(base(), curse());
    const player: CommandContext = { ...ctx, actor: { role: 'player', characterId: 'kim' } };
    const r = execute(
      c,
      { type: 'entity.reveal', entityId: 'curse', characterIds: ['kim'] },
      player,
    );
    expect(r.ok).toBe(false);
  });

  it('undo of a reveal hides the entity again', () => {
    let c = ok(base(), curse({ knownBy: [] }));
    c = ok(c, { type: 'entity.reveal', entityId: 'curse', characterIds: ['jake'] });
    const revealId = c.events.at(-1)?.id ?? '';
    expect(view(c).identify).toHaveLength(1);
    c = ok(c, { type: 'event.undo', eventId: revealId });
    expect(view(c).identify).toEqual([]);
  });
});

describe('Identify range (MQ.8, DESIGN §7)', () => {
  /** The demo party: Jake D-grade race 51, Casper F-grade race 7, Sultan G race 0. */
  const demo = (): Campaign => {
    let n = 0;
    return replay(
      buildDemoEvents({ now: () => '2026-10-21T00:00:00.000Z', newId: () => `d-${++n}` }),
    );
  };
  const who = ['demo-jake', 'demo-casper', 'demo-sultan'];
  const target = (entityId: string, grade: string | null, level: number | null): Command => ({
    type: 'entity.define',
    entityId,
    name: `GM name ${entityId}`,
    label: `Target ${entityId}`,
    tiers: [{ minRarity: 'inferior', text: `TEXT-${entityId}` }],
    knownBy: who,
    grade,
    level,
  });
  const seen = (c: Campaign, viewer: string, entityId: string) =>
    view(c, viewer).identify.find((e) => e.id === entityId);

  it('lower grade always; higher grade never; same grade up to 1.5 × the race level', () => {
    let c = demo();
    for (const [id, grade, level] of [
      ['g-high', 'G', 4],
      ['e-top', 'E', 49],
      ['d-76', 'D', 76],
      ['d-77', 'D', 77],
      ['c-low', 'C', 0],
      ['f-10', 'F', 10],
      ['f-11', 'F', 11],
      ['g-0', 'G', 0],
      ['g-1', 'G', 1],
    ] as const) {
      c = ok(c, target(id, grade, level));
    }
    const range = (viewer: string) =>
      Object.fromEntries(
        view(c, viewer)
          .identify.filter((e) => e.id !== 'curse')
          .map((e) => [e.id, e.inRange]),
      );
    // Jake (D, race 51): 1.5 × 51 = 76.5.
    expect(range('demo-jake')).toMatchObject({
      'g-high': true,
      'e-top': true,
      'd-76': true,
      'd-77': false,
      'c-low': false,
      'f-10': true,
    });
    // Casper (F, race 7): 10.5.
    expect(range('demo-casper')).toMatchObject({
      'g-high': true,
      'f-10': true,
      'f-11': false,
      'e-top': false,
    });
    // Sultan (G, race 0): only level 0 of his own grade.
    expect(range('demo-sultan')).toMatchObject({ 'g-0': true, 'g-1': false, 'g-high': false });
  });

  it('out of range sends the label only: no text, grade or level', () => {
    const c = ok(demo(), target('c-low', 'C', 3));
    expect(seen(c, 'demo-casper', 'c-low')).toEqual({
      id: 'c-low',
      label: 'Target c-low',
      inRange: false,
      grade: null,
      level: null,
      text: null,
    });
    const json = JSON.stringify(view(c, 'demo-casper'));
    expect(json).not.toContain('TEXT-c-low');
    expect(json).not.toContain('GM name');
    // In range, the grade and level come with the tier text.
    const jake = ok(demo(), target('f-2', 'F', 2));
    expect(seen(jake, 'demo-jake', 'f-2')).toMatchObject({
      inRange: true,
      grade: 'F',
      level: 2,
      text: 'TEXT-f-2',
    });
  });

  it('decides when marked and keeps it through level-ups and GM edits (MV.3)', () => {
    let c = ok(base(), {
      type: 'entity.define',
      entityId: 'rat',
      name: 'Rat',
      tiers: [TIERS[0]!],
      knownBy: ['jake'],
      grade: 'G',
      level: 1,
    });
    expect(view(c).identify[0]?.inRange).toBe(false);
    c = ok(c, {
      type: 'xp.award',
      track: 'class',
      amount: 100,
      participants: [{ characterId: 'jake' }],
    });
    expect(c.state?.characters.jake?.classLevel).toBe(1);
    // Still `[??? – lvl ???]` until the GM marks it again.
    expect(view(c).identify[0]?.inRange).toBe(false);
    c = ok(c, { type: 'entity.identify', entityId: 'rat', characterIds: ['jake'] });
    expect(view(c).identify[0]).toMatchObject({ inRange: true, grade: 'G', level: 1 });
    // A GM edit to its level does not re-decide; the text edit reaches the player.
    c = ok(c, { type: 'entity.edit', entityId: 'rat', level: 2 });
    expect(view(c).identify[0]?.inRange).toBe(true);
    c = ok(c, {
      type: 'entity.edit',
      entityId: 'rat',
      tiers: [{ minRarity: 'common', text: '[Rat, corrected]' }],
    });
    expect(view(c).identify[0]?.text).toBe('[Rat, corrected]');
    expect(c.state?.rules.identify.sameGradeLevelRatio).toBe(1.5);
  });

  it('refuses half a rank, unknown grades and levels past the cap', () => {
    const c = base();
    const def = (grade: string | null, level: number | null): Command => ({
      type: 'entity.define',
      entityId: 'x',
      name: 'X',
      tiers: TIERS,
      grade,
      level,
    });
    expect(reject(c, def('G', null))).toMatch(/both a grade and a level/);
    expect(reject(c, def(null, 3))).toMatch(/both a grade and a level/);
    expect(reject(c, def('Z', 3))).toMatch(/unknown grade "Z"/);
    expect(reject(c, def('A', 241))).toMatch(/at most 240/);
    const d = ok(c, def('G', 2));
    expect(reject(d, { type: 'entity.edit', entityId: 'x', grade: null })).toMatch(/both/);
  });
});

describe('bestiary stats and notes (M7.2)', () => {
  it('stores GM-only stats and notes, edits them, and checks stat ids', () => {
    let c = ok(
      base(),
      curse({
        tiers: [TIERS[0]!],
        stats: { strength: 40, vitality: 55 },
        notes: 'Hunts in pairs.',
      }),
    );
    expect(c.state?.entities['curse']).toMatchObject({
      stats: { strength: 40, vitality: 55 },
      notes: 'Hunts in pairs.',
    });
    c = ok(c, { type: 'entity.edit', entityId: 'curse', notes: 'Flees at half HP.' });
    expect(c.state?.entities['curse']?.stats).toEqual({ strength: 40, vitality: 55 });
    expect(c.state?.entities['curse']?.notes).toBe('Flees at half HP.');
    c = ok(c, { type: 'entity.edit', entityId: 'curse', stats: null });
    expect(c.state?.entities['curse']?.stats).toBeNull();
    expect(reject(c, { type: 'entity.edit', entityId: 'curse', stats: { luck: 3 } })).toMatch(
      /unknown stat "luck"/,
    );
    expect(reject(base(), curse({ stats: { strength: -1 } }))).toBeTruthy();
    // Defaults: none and blank.
    const plain = ok(base(), curse({ tiers: [TIERS[0]!] }));
    expect(plain.state?.entities['curse']).toMatchObject({ stats: null, notes: '' });
  });

  it('never sends stats or notes to players', () => {
    const c = ok(base(), curse({ stats: { strength: 98765 }, notes: 'SECRET weak to fire' }));
    const json = JSON.stringify(view(c));
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('98765');
    expect(replay(c.events).state).toEqual(c.state);
  });
});
