import type { CampaignState } from '../events';
import { canReadNote, type Note } from '../practice';

/**
 * What the GM console receives (DESIGN §7 "Notes"): the whole campaign state
 * except players' journal entries they have not marked shareable, which are
 * left out entirely (not even their titles or count).
 */
export function projectForGm(state: CampaignState): CampaignState {
  const notes: Record<string, Note> = {};
  const noteOrder: string[] = [];
  for (const id of state.noteOrder) {
    const note = Object.prototype.hasOwnProperty.call(state.notes, id)
      ? state.notes[id]
      : undefined;
    if (note && canReadNote(note, null)) {
      notes[id] = note;
      noteOrder.push(id);
    }
  }
  return { ...state, notes, noteOrder };
}
