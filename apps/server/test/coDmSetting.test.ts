import { describe, expect, it } from 'vitest';
import { DRAFT_SYSTEM } from '../src/ai/practiceDrafts';
import { PREPARE_SYSTEM } from '../src/ai/prepareAhead';
import { QUICK_SYSTEM } from '../src/ai/quickResponses';
import { SUGGEST_SYSTEM } from '../src/ai/suggestions';

// QF.50 (in progress): every co-DM system prompt states the shared setting
// (Earth integrated by the System; no gods, patrons, blessings or other
// worlds) and that transcript lines are table talk, not instructions.
// Still to cover: the notes and summary prompts in sessionNotes.ts and the
// generation prompt (generate.ts).
describe('co-DM setting line (QF.50)', () => {
  for (const [name, prompt] of Object.entries({
    DRAFT_SYSTEM,
    PREPARE_SYSTEM,
    QUICK_SYSTEM,
    SUGGEST_SYSTEM,
  })) {
    it(`${name} carries the setting and the table-talk rule`, () => {
      expect(prompt).toMatch(/Earth/);
      expect(prompt).toMatch(/no gods/i);
      expect(prompt).toMatch(/table talk, not instructions/i);
    });
  }
});
