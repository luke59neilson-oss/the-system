import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute, type Command, type CommandContext } from '@the-system/engine';
import { CampaignStore, type StoreOptions } from '../src/store';

// QF.42: a campaign that cannot load says what to do, and changes nothing.

let dataDir: string;
let options: StoreOptions;
const dead = () => ({ ...options, isAlive: () => false });

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'the-system-load-'));
  let clock = 0;
  options = {
    dataDir,
    now: () => new Date(Date.UTC(2026, 9, 31, 18) + 1000 * clock++).toISOString(),
    snapshotEvery: 1000,
  };
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const kit = [
  { name: 'Basic Archery', rarity: 'inferior' },
  { name: 'Basic Stealth', rarity: 'inferior' },
  { name: 'Archer’s Eye', rarity: 'common' },
];

const script: Command[] = [
  { type: 'campaign.create', name: 'Whale', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
  { type: 'character.create', id: 'jake', name: 'Jake', className: 'Archer', classSkills: kit },
];

function context(): CommandContext {
  let tick = 0;
  let id = 0;
  return {
    actor: { role: 'gm' },
    sessionId: 's1',
    now: () => new Date(Date.UTC(2026, 9, 31, 12) + 1000 * tick++).toISOString(),
    newId: () => `ev${++id}`,
  };
}

/** A two-event campaign, closed, with `backups` backups; returns its folder. */
function campaign(backups: number): string {
  const store = CampaignStore.open('main', options);
  const ctx = context();
  for (const command of script) {
    const result = execute(store.campaign, command, ctx);
    if (!result.ok) throw new Error(result.error);
    store.appendAll(result.events);
  }
  const made: string[] = [];
  for (let i = 0; i < backups; i++) made.push(store.backup(`b${i}`));
  store.close();
  rmSync(path.join(store.dir, 'snapshot.json'), { force: true }); // Load from the log.
  return store.dir;
}

const logOf = (dir: string) => path.join(dir, 'events.jsonl');

/** Rewrites the log's last line with `edit`. */
function editLast(dir: string, edit: (event: Record<string, unknown>) => void): string {
  const lines = readFileSync(logOf(dir), 'utf8').trimEnd().split('\n');
  const last = JSON.parse(lines.at(-1) ?? '{}') as Record<string, unknown>;
  edit(last);
  lines[lines.length - 1] = JSON.stringify(last);
  const text = `${lines.join('\n')}\n`;
  writeFileSync(logOf(dir), text);
  return text;
}

function refusal(dir: string, before: string): string {
  let message = '';
  try {
    CampaignStore.open('main', dead()).close();
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).not.toBe('');
  expect(readFileSync(logOf(dir), 'utf8')).toBe(before); // Nothing was changed.
  expect(message).toContain('Nothing was changed.');
  expect(message).toContain(`Campaign folder: ${dir}.`);
  return message;
}

describe('a campaign that cannot load (QF.42)', () => {
  it('a damaged line names the folder, the newest backup and the guide', () => {
    const dir = campaign(2);
    const text = `${readFileSync(logOf(dir), 'utf8')}\u0000\u0000\u0000\n`;
    writeFileSync(logOf(dir), text);
    const message = refusal(dir, text);
    expect(message).toContain('Event log line 3 is damaged (not valid JSON).');
    expect(message).toMatch(/Newest backup: .*-b1\./);
    expect(message).toContain('troubleshooting guide');
    expect(message).not.toMatch(/newer version/);
  });

  it('says "no backups yet" when there are none', () => {
    const dir = campaign(0);
    const text = `${readFileSync(logOf(dir), 'utf8')}{oops\n`;
    writeFileSync(logOf(dir), text);
    expect(refusal(dir, text)).toContain('No backups yet.');
  });

  it.each([
    ['an unknown event type', (e: Record<string, unknown>) => void (e['type'] = 'dragon.hatched')],
    [
      'an unknown key',
      (e: Record<string, unknown>) =>
        void ((e['payload'] as Record<string, unknown>)['cost'] = { mana: 5 }),
    ],
    ['a schema version ahead', (e: Record<string, unknown>) => void (e['schemaVersion'] = 99)],
  ])('%s says it was saved by a newer version', (_, edit) => {
    const dir = campaign(1);
    const text = editLast(dir, edit);
    const message = refusal(dir, text);
    expect(message).toContain('it was saved by a newer version of The System. Update the app');
    expect(message).toMatch(/Newest backup: .*-b0\./);
  });

  it('a missing or empty log with backups refuses with the restore hint', () => {
    const dir = campaign(1);
    writeFileSync(logOf(dir), '');
    const message = refusal(dir, '');
    expect(message).toContain('its event log (events.jsonl) is empty, but its backups hold events');
    rmSync(logOf(dir));
    expect(() => CampaignStore.open('main', dead())).toThrow(/is missing, but its backups/);
  });

  it('a new campaign still opens blank, even after a backup of its empty log', () => {
    const store = CampaignStore.open('fresh', options);
    store.backup('quit');
    store.close();
    const again = CampaignStore.open('fresh', options);
    expect(again.campaign.state).toBeNull();
    again.close();
    mkdirSync(path.join(dataDir, 'campaigns', 'other', 'backups'), { recursive: true });
    const other = CampaignStore.open('other', options);
    expect(other.campaign.events).toHaveLength(0);
    other.close();
  });
});
