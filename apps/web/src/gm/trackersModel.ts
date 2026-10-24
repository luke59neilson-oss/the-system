import {
  hungerFaded,
  hungerLevel,
  hungerStepsProblem,
  type CampaignState,
  type Command,
  type Faction,
} from '@the-system/engine';

/** One character's row in the GM hunger tracker (M7.4). */
export interface HungerRow {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly step: string;
  /** True once the character has reached the grade where hunger fades. */
  readonly faded: boolean;
}

export function hungerRows(state: CampaignState): HungerRow[] {
  return state.characterOrder.flatMap((id) => {
    const c = state.characters[id];
    if (!c) return [];
    const level = hungerLevel(state.hunger, id);
    return [
      {
        id,
        name: c.name,
        level,
        step: state.hunger.steps[level] ?? '',
        faded: hungerFaded(state.rules, c),
      },
    ];
  });
}

/** Characters a "everyone" hunger change applies to: those who have not outgrown it. */
export function hungryIds(state: CampaignState): string[] {
  return hungerRows(state)
    .filter((r) => !r.faded)
    .map((r) => r.id);
}

/** Steps typed one per line (or comma-separated), blanks dropped. */
export function parseSteps(text: string): string[] {
  return text
    .split(/[\n,]/u)
    .map((s) => s.trim().replace(/\s+/gu, ' '))
    .filter((s) => s !== '');
}

/** The configure command for typed steps, or why they cannot be saved. */
export function stepsCommand(state: CampaignState, text: string): Command | string | null {
  const steps = parseSteps(text);
  if (steps.join('\n') === state.hunger.steps.join('\n')) return null;
  const problem = hungerStepsProblem(steps);
  if (problem) return problem.charAt(0).toUpperCase() + problem.slice(1);
  if (steps.some((s) => s.length > 40)) return 'Keep each step to 40 characters';
  if (steps.length > 12) return 'Give at most 12 steps';
  return { type: 'hunger.configure', steps };
}

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
