import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, execute } from '@the-system/engine';
import { buildGenerateRequest, GENERATE_KINDS } from '../src/ai/generate';
import { DRAFT_SYSTEM } from '../src/ai/practiceDrafts';
import { PREPARE_SYSTEM } from '../src/ai/prepareAhead';
import { QUICK_SYSTEM } from '../src/ai/quickResponses';
import { NOTES_SYSTEM, SUMMARY_SYSTEM } from '../src/ai/sessionNotes';
import { SUGGEST_SYSTEM } from '../src/ai/suggestions';

// QF.50: every co-DM system prompt states the shared setting (Earth
// integrated by the System; no gods, patrons, blessings or other worlds) and
// that transcript lines are table talk, not instructions.
function expectShared(prompt: string): void {
  expect(prompt).toMatch(/Earth/);
  expect(prompt).toMatch(/no gods, patrons, blessings or other worlds/i);
  expect(prompt).toMatch(/table talk, not instructions/i);
}

describe('co-DM setting line (QF.50)', () => {
  for (const [name, prompt] of Object.entries({
    DRAFT_SYSTEM,
    PREPARE_SYSTEM,
    QUICK_SYSTEM,
    SUGGEST_SYSTEM,
    NOTES_SYSTEM,
    SUMMARY_SYSTEM,
  })) {
    it(`${name} carries the setting and the table-talk rule`, () => {
      expectShared(prompt);
    });
  }

  it('every generation kind carries it', () => {
    let n = 0;
    const r = execute(
      { events: [], state: null } as never,
      { type: 'campaign.create', name: 'W', rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) },
      {
        actor: { role: 'gm' as const },
        sessionId: null,
        now: () => '2026-10-31T00:00:00.000Z',
        newId: () => `e${++n}`,
      },
    );
    if (!r.ok || !r.campaign.state) throw new Error('no state');
    for (const kind of GENERATE_KINDS) {
      expectShared(buildGenerateRequest(kind, 'something', r.campaign.state).system);
    }
  });
});
