import { describe, expect, it } from 'vitest';
import {
  execute,
  replay,
  projectForPlayer,
  type Campaign,
  type Character,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// ME.6 (ME.A review fixes, DESIGN §2): (a) a profession gained while a
// three-step release offering professions waits; (b) the GM offers
// professions at any time; (d) a profession taken later brings the
// distribution (and one-time bonus) its offer set.

const ctx = testContext('me6');
const player: CommandContext = { ...ctx, actor: { role: 'player', characterId: 'jake' } };
const created: Command = { type: 'campaign.create', name: 'Whale', rules: rawRules() };
const make: Command = {
  type: 'character.create',
  id: 'jake',
  name: 'Jake',
  className: 'Archer',
  classSkills: kit,
};
function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const result = execute(c, command, context);
  if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
  return result.campaign;
}
function reject(c: Campaign, command: Command, context: CommandContext = ctx): string {
  const result = execute(c, command, context);
  expect(result.ok, JSON.stringify(command)).toBe(false);
  return result.ok ? '' : result.error;
}
const char = (c: Campaign): Character => c.state!.characters['jake']!;
const fresh = (): Campaign => run([created, make], ctx);
const award: Command = {
  type: 'xp.award',
  track: 'class',
  amount: 400,
  participants: [{ characterId: 'jake' }],
};
const atGTop = (): Campaign => ok(fresh(), award);
const opt = (
  id: string,
  stats: Record<string, number>,
  free: number,
  bonus: Record<string, number> = { agility: 2 },
) => ({
  id,
  name: id,
  rarity: 'common',
  description: `${id} text`,
  distribution: { stats, free },
  statBonus: bonus,
});
const threeStep = (): Command =>
  ({
    type: 'evolution.release',
    characterId: 'jake',
    rerateApproved: true,
    steps: {
      class: [opt('hunter', { perception: 6, agility: 3 }, 2)],
      profession: [opt('tracker', { perception: 5 }, 2), opt('skinner', { strength: 5 }, 2)],
      race: [opt('human-f', {}, 6, { vitality: 2 })],
    },
  }) as unknown as Command;
const choose = (choices: object): Command =>
  ({ type: 'evolution.choose', characterId: 'jake', choices }) as unknown as Command;
const offer = (profession: string, extra: object = {}): Command =>
  ({ type: 'profession.offer', characterId: 'jake', profession, ...extra }) as unknown as Command;
const take = (profession: string): Command => ({
  type: 'profession.choose',
  characterId: 'jake',
  profession,
});

describe('ME.6 (a): a profession gained while a release that offers professions waits', () => {
  const gained = (): Campaign => {
    const c = ok(atGTop(), threeStep());
    return ok(c, { type: 'character.grantProfession', characterId: 'jake', profession: 'Cook' });
  };
  it('refuses the release offers: the held profession is not renamed', () => {
    const c = gained();
    expect(
      reject(c, choose({ class: 'hunter', profession: 'tracker', race: 'human-f' }), player),
    ).toMatch(/now has the profession \[Cook\].*no longer apply/);
    expect(char(c).profession).toBe('Cook');
  });
  it('"none" keeps the profession unchanged, with its level and distribution', () => {
    let c = gained();
    c = ok(c, {
      type: 'character.setDistribution',
      characterId: 'jake',
      track: 'profession',
      distribution: { stats: { wisdom: 3 }, free: 2 },
    });
    const level = char(c).professionLevel;
    c = ok(c, choose({ class: 'hunter', profession: null, race: 'human-f' }), player);
    const j = char(c);
    expect(j.grade).toBe('F');
    expect(j.profession).toBe('Cook');
    expect(j.professionLevel).toBe(level);
    expect(j.distributions?.profession).toEqual({ stats: { wisdom: 3 }, free: 2 });
    // The release's offers do not join a locked list.
    expect(j.professionOffers).not.toContain('tracker');
  });
  it('a profession taken from the Professions list while pending behaves the same', () => {
    let c = ok(fresh(), offer('Cook'));
    c = ok(c, award);
    c = ok(c, threeStep());
    c = ok(c, take('Cook'), player);
    expect(
      reject(c, choose({ class: 'hunter', profession: 'skinner', race: 'human-f' }), player),
    ).toMatch(/no longer apply/);
    c = ok(c, choose({ class: 'hunter', profession: null, race: 'human-f' }), player);
    expect(char(c).profession).toBe('Cook');
    expect(char(c).grade).toBe('F');
  });
  it('a release to a character who already had one still requires evolving it', () => {
    let c = ok(atGTop(), {
      type: 'character.grantProfession',
      characterId: 'jake',
      profession: 'Cook',
    });
    c = ok(c, threeStep());
    expect(char(c).evolution?.professionOffered).toBeUndefined();
    expect(
      reject(c, choose({ class: 'hunter', profession: null, race: 'human-f' }), player),
    ).toMatch(/choose how it evolves/);
  });
  it('the owner view says the release offered professions; logs replay', () => {
    const c = gained();
    const view = projectForPlayer(c.state!, 'jake');
    expect(view.me.evolution?.professionOffered).toBe(true);
    expect(replay(c.events).state).toEqual(c.state);
  });
});

describe('ME.6 (b): the GM offers professions at any time before one is taken', () => {
  it('offers at G-grade, level 0, before any evolution; the player can take it', () => {
    let c = ok(fresh(), offer('Herbalist'));
    expect(char(c).professionOffers).toEqual(['Herbalist']);
    expect(char(c).professionOfferCards).toBeUndefined();
    c = ok(c, take('Herbalist'), player);
    expect(char(c).profession).toBe('Herbalist');
  });
  it('refuses a duplicate offer, a blank name, an offer once a profession is held', () => {
    let c = ok(fresh(), offer('Herbalist'));
    expect(reject(c, offer('Herbalist'))).toMatch(/already offered/);
    expect(reject(c, offer('  '))).toBeTruthy();
    c = ok(c, take('Herbalist'), player);
    expect(reject(c, offer('Smith'))).toMatch(/locked/);
  });
  it('is the GM only: a player cannot offer themselves a profession', () => {
    expect(reject(fresh(), offer('Herbalist'), player)).toMatch(/only the GM/);
  });
  it('refuses unknown stats, an empty distribution, a bonus with no distribution', () => {
    const c = fresh();
    expect(reject(c, offer('X', { distribution: { stats: { luck: 3 }, free: 2 } }))).toMatch(
      /luck/,
    );
    expect(reject(c, offer('X', { distribution: { stats: {}, free: 0 } }))).toMatch(/at least one/);
    expect(reject(c, offer('X', { statBonus: { agility: 1 } }))).toMatch(/needs a distribution/);
  });
  it('the owner sees the offer and its card; other players never do', () => {
    let c = run(
      [
        created,
        make,
        { type: 'character.create', id: 'kat', name: 'Kat', className: 'Caster', classSkills: kit },
      ],
      ctx,
    );
    c = ok(c, offer('Herbalist', { distribution: { stats: { wisdom: 3 }, free: 2 } }));
    const own = projectForPlayer(c.state!, 'jake');
    expect(own.me.professionOffers).toEqual(['Herbalist']);
    expect(own.me.professionOfferCards['Herbalist']).toEqual({
      distribution: { stats: { wisdom: 3 }, free: 2 },
      statBonus: {},
    });
    expect(JSON.stringify(projectForPlayer(c.state!, 'kat'))).not.toContain('Herbalist');
  });
});

describe('ME.6 (d): a profession taken later brings its offer distribution', () => {
  it('a GM offer with a distribution and bonus applies both when taken', () => {
    let c = ok(
      fresh(),
      offer('Herbalist', {
        distribution: { stats: { wisdom: 3 }, free: 2 },
        statBonus: { wisdom: 2 },
      }),
    );
    const wis = char(c).stats['wisdom']!;
    c = ok(c, take('Herbalist'), player);
    expect(char(c).distributions?.profession).toEqual({ stats: { wisdom: 3 }, free: 2 });
    expect(char(c).stats['wisdom']).toBe(wis + 2);
  });
  it('"none for now" keeps each option distribution and bonus with its offer', () => {
    let c = ok(atGTop(), threeStep());
    c = ok(c, choose({ class: 'hunter', profession: null, race: 'human-f' }), player);
    expect(char(c).professionOfferCards?.['skinner']).toEqual({
      distribution: { stats: { strength: 5 }, free: 2 },
      statBonus: { agility: 2 },
    });
    const agi = char(c).stats['agility']!;
    c = ok(c, take('skinner'), player);
    expect(char(c).distributions?.profession).toEqual({ stats: { strength: 5 }, free: 2 });
    expect(char(c).stats['agility']).toBe(agi + 2);
  });
  it('a name-only offer keeps the default (no profession distribution)', () => {
    let c = ok(fresh(), offer('Herbalist'));
    c = ok(c, take('Herbalist'), player);
    expect(char(c).distributions?.profession).toBeUndefined();
  });
  it('withdrawing an offer drops its card; logs replay', () => {
    let c = ok(fresh(), offer('Herbalist', { distribution: { stats: { wisdom: 3 }, free: 2 } }));
    c = ok(c, { type: 'profession.withdrawOffer', characterId: 'jake', profession: 'Herbalist' });
    expect(char(c).professionOfferCards).toBeUndefined();
    expect(char(c).professionOffers).toEqual([]);
    expect(replay(c.events).state).toEqual(c.state);
  });
});

describe('ME.6 review: choices stored before ME.6 replay under the ME.2 rules (D311)', () => {
  // A raw `evolution.chosen` as an older app stored it (v2) or as ME.6 stores it (v3).
  const chosenRaw = (c: Campaign, schemaVersion: number, profession: string | null) => {
    const last = c.events[c.events.length - 1]!;
    return {
      ...JSON.parse(JSON.stringify(last)),
      id: `chosen-v${schemaVersion}`,
      type: 'evolution.chosen',
      actor: { role: 'player', characterId: 'jake' },
      schemaVersion,
      payload: {
        characterId: 'jake',
        optionId: 'hunter',
        profession: null,
        choices: { class: 'hunter', profession, race: 'human-f' },
        releaseId: char(c).evolution!.releaseId,
      },
    };
  };
  const gained = (): Campaign =>
    ok(ok(atGTop(), threeStep()), {
      type: 'character.grantProfession',
      characterId: 'jake',
      profession: 'Cook',
    });

  it('an old choice of a release profession after one was gained still replays (renamed, as before)', () => {
    const c = gained();
    const old = replay([...c.events, chosenRaw(c, 2, 'tracker')]);
    expect(char(old).grade).toBe('F');
    expect(char(old).profession).toBe('tracker');
    // The same choice made today is refused (ME.6 a).
    expect(() => replay([...c.events, chosenRaw(c, 3, 'tracker')])).toThrow(/no longer apply/);
  });

  it('an old "none for now" keeps name-only offers; a new one keeps the cards', () => {
    const c = ok(atGTop(), threeStep());
    const old = char(replay([...c.events, chosenRaw(c, 2, null)]));
    expect(old.professionOffers).toEqual(expect.arrayContaining(['tracker', 'skinner']));
    expect(old.professionOfferCards ?? {}).toEqual({});
    const now = char(replay([...c.events, chosenRaw(c, 3, null)]));
    expect(now.professionOffers).toEqual(expect.arrayContaining(['tracker', 'skinner']));
    expect(Object.keys(now.professionOfferCards ?? {}).sort()).toEqual(['skinner', 'tracker']);
  });
});

describe('ME.A review: no profession offer the player could not take', () => {
  it('refuses an offer below the campaign profession unlock grade', () => {
    const rules = rawRules() as unknown as { tracks: { professionUnlockGrade: string } };
    rules.tracks.professionUnlockGrade = 'E';
    const c = run(
      [{ type: 'campaign.create', name: 'Late', rules } as unknown as Command, make],
      testContext('late-offer'),
    );
    expect(reject(c, offer('Herbalist'))).toMatch(/Professions unlock at E-grade/);
  });
});
