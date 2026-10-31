import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendEvent,
  emptyCampaign,
  parseEventLines,
  replay,
  type Campaign,
  type CampaignState,
} from '../../src';

/**
 * QF.52 canary (D292): the server sends the GM only the top-level state keys
 * whose value is a new object. That is correct only if every event leaves the
 * previous state untouched and replaces each key it changes. Every golden log
 * is appended event by event (undos included) and checked for both.
 */
const dir = join(import.meta.dirname, '..', 'golden');
const logs = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));

describe('state keys change by reference (QF.52 GM patches)', () => {
  it.each(logs)('%s', (file) => {
    const raw = parseEventLines(readFileSync(join(dir, file), 'utf8'));
    const { events } = replay(raw);
    let campaign: Campaign = emptyCampaign();
    for (const event of events) {
      const before: CampaignState | null = campaign.state;
      const frozen = before ? JSON.stringify(before) : null;
      const perKey = before
        ? Object.fromEntries(Object.entries(before).map(([k, v]) => [k, JSON.stringify(v)]))
        : {};
      campaign = appendEvent(campaign, event);
      if (!before) continue;
      // The old state is never edited in place.
      expect(JSON.stringify(before), `${file} ${event.id} mutated the old state`).toBe(frozen);
      const after = campaign.state as CampaignState;
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const a = (before as unknown as Record<string, unknown>)[key];
        const b = (after as unknown as Record<string, unknown>)[key];
        if (a === b) {
          expect(JSON.stringify(b), `${file} ${event.id} changed "${key}" in place`).toBe(
            perKey[key],
          );
        }
      }
    }
  });
});
