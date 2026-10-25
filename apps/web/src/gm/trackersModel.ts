import type { Command, Faction } from '@the-system/engine';

/** A faction form's text fields (M7.4). */
export interface FactionDraft {
  readonly name: string;
  readonly regionId: string;
  readonly members: string;
  readonly standing: string;
  readonly notes: string;
}

export const emptyFactionDraft = (): FactionDraft => ({
  name: '',
  regionId: '',
  members: '',
  standing: '',
  notes: '',
});

export function factionDraftOf(f: Faction): FactionDraft {
  return {
    name: f.name,
    regionId: f.regionId ?? '',
    members: f.members === null ? '' : String(f.members),
    standing: f.standing,
    notes: f.notes,
  };
}

/** The members field as a number, null for blank, or an error. */
function membersOf(text: string): number | null | string {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d+$/u.test(t)) return 'Members must be a whole number (or blank)';
  const n = Number(t);
  return n > 1_000_000_000 ? 'Members must be at most 1,000,000,000' : n;
}

/** Define (no `current`) or edit command for a faction draft; null when nothing changed. */
export function factionCommand(
  current: Faction | null,
  draft: FactionDraft,
): Command | string | null {
  const name = draft.name.trim().replace(/\s+/gu, ' ');
  if (name === '') return current ? 'Give the faction a name' : null;
  const members = membersOf(draft.members);
  if (typeof members === 'string') return members;
  const regionId = draft.regionId === '' ? null : draft.regionId;
  const standing = draft.standing.trim();
  const notes = draft.notes.trim();
  if (!current) {
    return { type: 'faction.define', name, regionId, members, standing, notes };
  }
  const change = {
    name: name === current.name ? undefined : name,
    regionId: regionId === current.regionId ? undefined : regionId,
    members: members === current.members ? undefined : members,
    standing: standing === current.standing ? undefined : standing,
    notes: notes === current.notes ? undefined : notes,
  };
  if (Object.values(change).every((v) => v === undefined)) return null;
  return { type: 'faction.edit', factionId: current.id, ...change };
}
