import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  currentSchemaVersion,
  readGoldens,
  readManifest,
  verify,
} from '../../../../scripts/golden-manifest.mjs';
import {
  CAMPAIGN_STATE_SCHEMA_VERSION,
  EVENT_TYPES,
  appendEvent,
  emptyCampaign,
  parseEvent,
  parseEventLines,
  replay,
  type EventType,
} from '../../src';

/**
 * Lives in test/node (typechecked with Node types, not the engine's pure
 * config) because it reads files. Golden event logs are committed, never regenerated, and pinned
 * by `manifest.json` (QF.4, `npm run golden:record`): they prove that logs
 * written by older builds still replay to the same state. When an event
 * payload changes, bump its schemaVersion and add an upcaster; do not edit
 * these files.
 */
const dir = join(import.meta.dirname, '..', 'golden');
const logs = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));

/** Event types no event sequence can reach yet, with the item that makes them reachable. */
const NOT_YET_REACHABLE: Partial<Record<EventType, string>> = {};

describe('golden event logs', () => {
  it('exist', () => {
    expect(logs.length).toBeGreaterThan(0);
  });

  it('are pinned by the manifest (QF.4): logs never change, states only with a schema bump', () => {
    expect(currentSchemaVersion()).toBe(CAMPAIGN_STATE_SCHEMA_VERSION);
    expect(verify(readGoldens(), readManifest(), CAMPAIGN_STATE_SCHEMA_VERSION)).toEqual([]);
  });

  it.each(logs)('%s replays to its committed state', (file) => {
    const events = parseEventLines(readFileSync(join(dir, file), 'utf8'));
    const expected = JSON.parse(
      readFileSync(join(dir, file.replace(/\.jsonl$/, '.state.json')), 'utf8'),
    ) as unknown;
    const replayed = replay(events);
    expect(replayed.state).toEqual(expected);
    expect(replayed.events).toHaveLength(events.length);
    const undos = replayed.events.filter((e) => e.type === 'event.undone');
    expect(Object.keys(replayed.undone)).toHaveLength(undos.length);
    const appended = events.reduce(
      (c: ReturnType<typeof emptyCampaign>, raw) => appendEvent(c, parseEvent(raw)),
      emptyCampaign(),
    );
    expect(appended).toEqual(replayed);
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
