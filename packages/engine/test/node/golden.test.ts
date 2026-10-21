import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, parseEventLines, replay, type EventType } from '../../src';

/**
 * Lives in test/node (typechecked with Node types, not the engine's pure
 * config) because it reads files. Golden event logs are committed and never regenerated: they prove that logs
 * written by older builds still replay to the same state. When an event
 * payload changes, bump its schemaVersion and add an upcaster; do not edit
 * these files.
 */
const dir = join(import.meta.dirname, '..', 'golden');
const logs = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));

/** Event types no event sequence can reach yet, with the item that makes them reachable. */
const NOT_YET_REACHABLE: Partial<Record<EventType, string>> = {
  'character.professionGranted': 'M1.10 (evolution to E-grade)',
};

describe('golden event logs', () => {
  it('exist', () => {
    expect(logs.length).toBeGreaterThan(0);
  });

  it.each(logs)('%s replays to its committed state', (file) => {
    const events = parseEventLines(readFileSync(join(dir, file), 'utf8'));
    const expected = JSON.parse(
      readFileSync(join(dir, file.replace(/\.jsonl$/, '.state.json')), 'utf8'),
    ) as unknown;
    expect(replay(events).state).toEqual(expected);
  });

  it('cover every reachable event type', () => {
    const seen = new Set<string>();
    for (const file of logs) {
      for (const raw of parseEventLines(readFileSync(join(dir, file), 'utf8'))) {
        seen.add((raw as { type: string }).type);
      }
    }
    const missing = EVENT_TYPES.filter((t) => !seen.has(t) && !(t in NOT_YET_REACHABLE));
    expect(missing, 'add a new golden log covering these event types').toEqual([]);
  });
});
