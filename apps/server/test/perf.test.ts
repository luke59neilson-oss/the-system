// M11.3 Performance: a 50,000-event log loads in under 3 s (full replay, no
// snapshot to help: the worst case after a lost or stale snapshot).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  emptyCampaign,
  execute,
  type Campaign,
  type Command,
  type CommandContext,
} from '@the-system/engine';
import { CampaignStore } from '../src/store';

export const PERF_EVENTS = 50_000;

const root = mkdtempSync(path.join(tmpdir(), 'the-system-perf-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function context(): CommandContext {
  let tick = 0;
  let id = 0;
  return {
    actor: { role: 'gm' },
    sessionId: 's1',
    now: () => new Date(Date.UTC(2026, 9, 21, 12) + 1000 * tick++).toISOString(),
    newId: () => `ev${++id}`,
  };
}

describe('M11.3 performance', () => {
  it(`loads a ${PERF_EVENTS}-event log in under 3 s`, () => {
    const kit = [
      { name: 'Basic Archery', rarity: 'inferior' },
      { name: 'Basic Stealth', rarity: 'inferior' },
      { name: 'Archer’s Eye', rarity: 'common' },
    ];
    const heroes = ['ana', 'bo', 'cy', 'di'];
    const ctx = context();
    let campaign: Campaign = emptyCampaign();
    const lines: string[] = [];
    const run = (command: Command) => {
      const result = execute(campaign, command, ctx);
      if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
      campaign = result.campaign;
      for (const e of result.events) lines.push(JSON.stringify(e));
    };
    run({
      type: 'campaign.create',
      name: 'Long',
      rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
    });
    for (const id of heroes) {
      run({ type: 'character.create', id, name: id, className: 'Archer', classSkills: kit });
    }
    const built = performance.now();
    for (let i = 0; lines.length < PERF_EVENTS; i++) {
      if (i % 10_000 === 0)
        console.log(`M11.3 build: ${i} commands at ${(performance.now() - built).toFixed(0)} ms`);
      const who = heroes[i % heroes.length] as string;
      run(
        i % 4 === 0
          ? { type: 'xp.award', track: 'class', amount: 7, participants: [{ characterId: who }] }
          : i % 4 === 1
            ? {
                type: 'practice.log',
                characterId: who,
                action: `step ${i}`,
                skills: ['Basic Archery'],
              }
            : i % 4 === 2
              ? { type: 'character.rename', characterId: who, name: `${who} ${i}` }
              : { type: 'system.broadcast', text: `Notice ${i}`, characterIds: null },
      );
    }
    const dir = path.join(root, 'campaigns', 'long');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'events.jsonl'), `${lines.join('\n')}\n`);
    const started = performance.now();
    const store = CampaignStore.open('long', {
      dataDir: root,
      now: () => new Date().toISOString(),
    });
    const ms = performance.now() - started;
    console.log(`M11.3: ${lines.length} events loaded in ${ms.toFixed(0)} ms`);
    expect(store.campaign.events).toHaveLength(lines.length);
    expect(store.loadedFromSnapshot).toBe(false);
    store.close();
    expect(ms).toBeLessThan(3000);
  }, 120_000);
});
