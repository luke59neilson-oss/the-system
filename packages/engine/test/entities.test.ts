import { describe, expect, it } from 'vitest';
import {
  execute,
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
  return projectForPlayer(c.state, id);
};
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
/** Jake trains Identify from Common to Uncommon (4 marks, one per session). */
function trainIdentify(c: Campaign): Campaign {
  let out = c;
  for (const session of ['s1', 's2', 's3', 's4']) {
    out = ok(out, { type: 'skill.awardMark', characterId: 'jake', skill: 'Identify', session });
  }
  return ok(out, { type: 'skill.upgrade', characterId: 'jake', skill: 'Identify' });
}

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
      { id: 'curse', label: 'The black miasma', text: '[Malignant Miasma]' },
    ]);
    expect(view(c, 'kim').identify).toEqual([]);
    const json = JSON.stringify(view(c));
    expect(json).not.toContain('immune response');
    expect(json).not.toContain('[Fever]');
    expect(json).not.toContain('Host');
  });

  it('a higher Identify rarity unlocks the best tier at or below it', () => {
    let c = ok(base(), curse({ knownBy: ['jake', 'kim'] }));
    c = trainIdentify(c);
    expect(view(c).identify[0]?.text).toBe('[Fever]');
    expect(view(c, 'kim').identify[0]?.text).toBe('[Malignant Miasma]');
    expect(JSON.stringify(view(c))).not.toContain('Malignant');
  });

  it('shows no text when no tier is low enough (tiers can be given in any order)', () => {
    const c = ok(
      base(),
      curse({
        tiers: [
          { minRarity: 'rare', text: 'deep' },
          { minRarity: 'uncommon', text: 'mid' },
        ],
      }),
    );
    expect(view(c).identify).toEqual([{ id: 'curse', label: 'The black miasma', text: null }]);
    expect(view(trainIdentify(c)).identify[0]?.text).toBe('mid');
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
      /at least 1|too_small|>=1/i,
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
    expect(view(c).identify).toEqual([{ id: 'curse', label: 'Black fog', text: '[Miasma]' }]);
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
