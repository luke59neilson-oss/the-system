import { describe, expect, it } from 'vitest';
import {
  PORTRAIT_REF,
  execute,
  portraitUrl,
  projectForPlayer,
  replay,
  type Campaign,
  type Command,
  type CommandContext,
} from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

/** Character portraits (M4.4): stored file names in the log, URLs in the player view. */

const ctx: CommandContext = testContext('pt');
const A = `${'a'.repeat(64)}.png`;
const B = `${'0123456789abcdef'.repeat(4)}.webp`;

function base(portrait?: string): Campaign {
  return run(
    [
      { type: 'campaign.create', name: 'P', rules: rawRules() },
      {
        type: 'character.create',
        id: 'jake',
        name: 'Jake',
        className: 'Archer',
        classSkills: kit,
        ...(portrait === undefined ? {} : { portrait }),
      } as Command,
      { type: 'character.create', id: 'kim', name: 'Kim', className: 'Archer', classSkills: kit },
    ],
    ctx,
  );
}

function ok(c: Campaign, command: Command, context: CommandContext = ctx): Campaign {
  const r = execute(c, command, context);
  if (!r.ok) throw new Error(`${command.type}: ${r.error}`);
  return r.campaign;
}

function err(c: Campaign, command: Command, context: CommandContext = ctx): string {
  const r = execute(c, command, context);
  if (r.ok) throw new Error(`${command.type} was accepted`);
  return r.error;
}

const set = (characterId: string, portrait: string | null): Command => ({
  type: 'character.setPortrait',
  characterId,
  portrait,
});

describe('portraits', () => {
  it('accepts only stored file names (sha-256 hex and png, jpg or webp)', () => {
    expect(PORTRAIT_REF.test(A)).toBe(true);
    expect(PORTRAIT_REF.test(B)).toBe(true);
    for (const bad of [
      'a.png',
      `${'a'.repeat(64)}.svg`,
      `${'A'.repeat(64)}.png`,
      `../${'a'.repeat(61)}.png`,
      `${'a'.repeat(64)}.png/x`,
      `/portraits/${A}`,
    ]) {
      expect(PORTRAIT_REF.test(bad), bad).toBe(false);
    }
  });

  it('starts a character with a portrait, or with none', () => {
    const c = base(A);
    expect(c.state?.characters.jake?.portrait).toBe(A);
    expect(c.state?.characters.kim?.portrait).toBeNull();
    const evil: Command = {
      type: 'character.create',
      id: 'x',
      name: 'X',
      className: 'Archer',
      classSkills: kit,
      portrait: 'evil.svg',
    };
    expect(err(c, evil)).toMatch('stored portrait file name');
  });

  it('sets, replaces and clears a portrait; refuses no-op changes and unknown characters', () => {
    let c = ok(base(), set('jake', A));
    expect(c.state?.characters.jake?.portrait).toBe(A);
    expect(err(c, set('jake', A))).toMatch('already has that portrait');
    c = ok(c, set('jake', B));
    expect(c.state?.characters.jake?.portrait).toBe(B);
    c = ok(c, set('jake', null));
    expect(c.state?.characters.jake?.portrait).toBeNull();
    expect(err(c, set('jake', null))).toMatch('has no portrait');
    expect(err(c, set('nobody', A))).toMatch('nobody');
    expect(err(c, set('jake', '../../etc/passwd'))).toMatch('stored portrait file name');
    expect(replay(c.events)).toEqual(c);
  });

  it('undo restores the previous portrait', () => {
    let c = ok(base(A), set('jake', B));
    const id = c.events[c.events.length - 1]?.id ?? '';
    c = ok(c, { type: 'event.undo', eventId: id });
    expect(c.state?.characters.jake?.portrait).toBe(A);
    expect(replay(c.events)).toEqual(c);
  });

  it('only the GM changes portraits', () => {
    const player: CommandContext = { ...ctx, actor: { role: 'player', characterId: 'jake' } };
    expect(err(base(), set('jake', A), player)).toMatch('only the GM');
  });

  it('players see their own and party members’ portraits as /portraits/ URLs', () => {
    const c = ok(base(A), set('kim', B));
    const state = c.state;
    if (!state) throw new Error('no state');
    const jake = projectForPlayer(state, 'jake');
    expect(jake.me.portrait).toBe(`/portraits/${A}`);
    expect(jake.party[0]?.portrait).toBe(`/portraits/${B}`);
    expect(projectForPlayer(state, 'kim').party[0]?.portrait).toBe(`/portraits/${A}`);
    expect(portraitUrl(null)).toBeNull();
  });
});
