// MR.3 (DESIGN §2, L16): a stored campaign on the old banking rules switches to
// XP overflow when the app loads it; the switch is logged and happens once.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute, type Campaign, type Command } from '@the-system/engine';
import { startApp } from '../src/app';
import { CampaignStore } from '../src/store';

const now = () => '2026-10-23T00:00:00.000Z';
let n = 0;
const ctx = { actor: { role: 'gm' as const }, sessionId: null, now, newId: () => `m${n++}` };

function bankingCampaign(dataDir: string): void {
  const rules = JSON.parse(JSON.stringify(DEFAULT_RULES)) as { xp: Record<string, unknown> };
  delete rules.xp['overflow']; // stored before MQ.11
  const store = CampaignStore.open('main', { dataDir, now });
  const run = (command: Command) => {
    const result = execute(store.campaign, command, ctx);
    if (!result.ok) throw new Error(result.error);
    store.appendAll(result.events);
  };
  run({ type: 'campaign.create', name: 'Old', rules });
  run({
    type: 'character.create',
    id: 'jake',
    name: 'Jake',
    className: 'Archer',
    classSkills: [
      { name: 'Basic Archery', rarity: 'inferior' },
      { name: 'Basic Stealth', rarity: 'inferior' },
      { name: 'Archer’s Eye', rarity: 'common' },
    ],
  });
  run({ type: 'xp.award', track: 'class', amount: 1000, participants: [{ characterId: 'jake' }] });
  store.close();
}

describe('rules migrations on load (MR.3)', () => {
  let webRoot: string;
  let dataDir: string;
  beforeAll(() => {
    webRoot = mkdtempSync(path.join(tmpdir(), 'the-system-mig-web-'));
    dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-mig-data-'));
    writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>shell</title>');
    bankingCampaign(dataDir);
  });
  afterAll(() => {
    rmSync(webRoot, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  const load = async (): Promise<Campaign> => {
    const app = await startApp({ port: 0, host: '127.0.0.1', webRoot, dataDir });
    await app.close();
    const store = CampaignStore.open('main', { dataDir, now });
    const campaign = store.campaign;
    store.close();
    return campaign;
  };

  it('turns XP overflow on and logs the banked XP it cleared, once', async () => {
    const first = await load();
    const last = first.events.at(-1);
    expect(last?.type).toBe('rules.migrated');
    expect(last?.payload).toEqual({
      migration: 'xpOverflow',
      banked: [{ characterId: 'jake', track: 'class', xp: 600 }],
    });
    expect(first.state?.rules.xp.overflow).toBe(true);
    expect(first.state?.characters['jake']?.xp.class).toBe(0);
    const second = await load();
    expect(second.events.length).toBe(first.events.length);
  });
});
