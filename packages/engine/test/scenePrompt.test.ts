import { describe, expect, it } from 'vitest';
import { execute, projectForPlayer, type Campaign, type Command } from '../src';
import { kit, rawRules, run, testContext } from './helpers/events';

// MT.9 (Q63): "End scene" asks each player what they practised.

const setup: Command[] = [
  { type: 'campaign.create', name: 'C', rules: rawRules() },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
  { type: 'character.create', id: 'mira', name: 'Mira', className: 'Archer', classSkills: kit },
];

const asPlayer = (c: Campaign, command: Command, characterId: string) =>
  execute(c, command, { ...testContext('p'), actor: { role: 'player', characterId } });

describe('end-of-scene prompt (MT.9)', () => {
  it('asks the whole party by default; each player answers for themselves', () => {
    const c = run([...setup, { type: 'scene.end', sceneId: 'sc1' }]);
    expect(c.state!.scenePrompt).toMatchObject({ id: 'sc1', pending: ['jake', 'mira'] });
    const other = asPlayer(
      c,
      { type: 'scene.answer', sceneId: 'sc1', characterId: 'mira' },
      'jake',
    );
    expect(other.ok).toBe(false);
    const own = asPlayer(c, { type: 'scene.answer', sceneId: 'sc1', characterId: 'jake' }, 'jake');
    if (!own.ok) throw new Error(own.error);
    expect(own.campaign.state!.scenePrompt?.pending).toEqual(['mira']);
    expect(projectForPlayer(own.campaign.state!, 'jake').scenePrompt).toBeNull();
    expect(projectForPlayer(own.campaign.state!, 'mira').scenePrompt).toEqual({ id: 'sc1' });
    expect(JSON.stringify(projectForPlayer(own.campaign.state!, 'mira'))).not.toContain('pending');
    const done = run(
      [{ type: 'scene.answer', sceneId: 'sc1', characterId: 'mira' }],
      testContext('g'),
      own.campaign,
    );
    expect(done.state!.scenePrompt).toBeNull();
  });
});
