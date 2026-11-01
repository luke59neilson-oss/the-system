import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type PlayerRules } from '@the-system/engine';
import {
  evolutionPanelState,
  perLevelText,
  releaseArrived,
  picksComplete,
  professionUnchanged,
  readOpened,
  stepChoices,
  stepWarnings,
  writeOpened,
  type StepCard,
} from '../src/player/evolutionSteps';

// ME.5 (DESIGN §9 "Evolution on the player's screen"): the player's
// three-step evolution helpers.
const card = (id: string, over: Partial<StepCard> = {}): StepCard => ({
  id,
  name: id,
  rarity: 'common',
  description: '',
  distribution: { stats: { perception: 8, agility: 4 }, free: 4 },
  statBonus: {},
  transforms: [],
  ...over,
});
const steps = { class: [card('c1')], profession: [card('p1')], race: [card('r1')] };

describe("the player's evolution window (ME.5)", () => {
  it('is locked until a release, lit until opened, then open', () => {
    expect(evolutionPanelState(null, null)).toBe('locked');
    expect(evolutionPanelState(null, 'old')).toBe('locked');
    expect(evolutionPanelState({ releaseId: 'e1' }, null)).toBe('lit');
    expect(evolutionPanelState({ releaseId: 'e2' }, 'e1')).toBe('lit');
    expect(evolutionPanelState({ releaseId: 'e2' }, 'e2')).toBe('open');
  });

  it('remembers the opened release per character, and survives blocked storage', () => {
    const map = new Map<string, string>();
    const store = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    };
    writeOpened(store, 'kim', 'e1');
    expect(readOpened(store, 'kim')).toBe('e1');
    expect(readOpened(store, 'jo')).toBeNull();
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => writeOpened(blocked, 'kim', 'e1')).not.toThrow();
    expect(readOpened(blocked, 'kim')).toBeNull();
    expect(readOpened(null, 'kim')).toBeNull();
  });

  it('shows per-level stats in stat order, ending in free points', () => {
    expect(perLevelText(DEFAULT_RULES, card('c'))).toBe('Agility 4 · Perception 8 · Free points 4');
    expect(perLevelText(DEFAULT_RULES, card('h', { distribution: { stats: {}, free: 10 } }))).toBe(
      'Free points 10',
    );
  });

  it('needs a pick per step; "none for now" only without a profession', () => {
    const none = { profession: null };
    const held = { profession: 'Herbalist' };
    expect(picksComplete(steps, none, { class: 'c1', profession: null, race: 'r1' })).toBe(false);
    expect(picksComplete(steps, none, { class: 'c1', profession: '', race: 'r1' })).toBe(true);
    expect(picksComplete(steps, held, { class: 'c1', profession: 'p1', race: null })).toBe(false);
    // A held profession with no option to evolve it skips the step.
    expect(
      picksComplete({ ...steps, profession: [] }, held, {
        class: 'c1',
        profession: null,
        race: 'r1',
      }),
    ).toBe(true);
    expect(stepChoices({ class: 'c1', profession: '', race: 'r1' })).toEqual({
      class: 'c1',
      profession: null,
      race: 'r1',
    });
    expect(stepChoices({ class: 'c1', profession: 'p1', race: 'r1' }).profession).toBe('p1');
  });

  it('warns about merges across all three picks, and says the choice is final once', () => {
    const marks: PlayerRules['marks'] = {
      carryOver: false,
      resetOnUpgrade: true,
      upgrades: { inferior: 3, common: 4, uncommon: 6, rare: 8 },
      order: ['inferior', 'common', 'uncommon', 'rare', 'epic'],
    };
    const w = stepWarnings({ marks }, { skills: [] }, [
      card('c1', {
        transforms: [{ skill: 'A', merge: 'B', name: 'AB', rarity: 'rare' }],
      }),
      card('r1'),
    ]);
    expect(w).toEqual([
      '[A] and [B] merge into [AB]: both are used up, and the new skill’s progress starts at 0.',
      'The choice is final; the other options will be gone.',
    ]);
  });
});

describe('a profession taken while a release that offered professions waits (ME.6 a)', () => {
  const held = { profession: 'Cook' };
  const offered = { professionOffered: true as const };
  it('keeps the profession unchanged: no step, and the choice sends null', () => {
    expect(professionUnchanged(held, offered, steps)).toBe(true);
    expect(professionUnchanged(held, {}, steps)).toBe(false);
    expect(professionUnchanged({ profession: null }, offered, steps)).toBe(false);
    expect(picksComplete(steps, held, { class: 'c1', profession: null, race: 'r1' }, offered)).toBe(
      true,
    );
    // A pick saved before the profession was taken is not sent.
    expect(stepChoices({ class: 'c1', profession: 'p1', race: 'r1' }, true).profession).toBeNull();
  });
  it('a held profession cannot complete with "none for now" when it must evolve', () => {
    expect(picksComplete(steps, held, { class: 'c1', profession: '', race: 'r1' })).toBe(false);
  });
});

describe('the evolution sound on a release (ME.5 review)', () => {
  it('plays when a new release arrives while the page is open, never on load, a switch or in a pane', () => {
    expect(releaseArrived(null, 'kim', 'e1', false)).toBe(false);
    expect(releaseArrived({ id: 'kim', release: null }, 'kim', 'e1', false)).toBe(true);
    expect(releaseArrived({ id: 'kim', release: 'e1' }, 'kim', 'e2', false)).toBe(true);
    expect(releaseArrived({ id: 'kim', release: 'e1' }, 'kim', 'e1', false)).toBe(false);
    expect(releaseArrived({ id: 'kim', release: 'e1' }, 'kim', null, false)).toBe(false);
    expect(releaseArrived({ id: 'jo', release: null }, 'kim', 'e1', false)).toBe(false);
    expect(releaseArrived({ id: 'kim', release: null }, 'kim', 'e1', true)).toBe(false);
  });
});
