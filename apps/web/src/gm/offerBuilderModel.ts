import {
  dueSelections,
  offerSelection,
  passedOverOptions,
  retiredSkillNames,
  type CampaignState,
  type SkillOption,
} from '@the-system/engine';

// MW.1: the standing and practice summary live in the engine; the server's
// skill-offer drafts (MW.2) put the same facts in their prompt.
export {
  characterStanding,
  practiceSkillCounts,
  practiceSkillPairs,
  practiceStatCounts,
  recentPractice,
  type CharacterStanding,
} from '@the-system/engine';

// M5.1 offer builder: what the GM needs per character to
// build a selection menu, derived only from the engine's own rules so the
// builder and the engine never disagree.

/** One reached selection the character has not chosen yet. */
export interface BuilderSlot {
  readonly level: number;
  readonly grade: string;
  /** The grade's last selection: needs an option at the rarity ceiling. */
  readonly capstone: boolean;
  readonly ceiling: string;
  /** The menu offered now and not chosen yet, or null when nothing is offered. */
  readonly pending: readonly SkillOption[] | null;
  /** Older unchosen options the player will also see (GM can withdraw them). */
  readonly passedOver: readonly SkillOption[];
}

/** Same retired set the reducer uses for this character (from its practice log). */
const retiredOf = (state: CampaignState, characterId: string) =>
  retiredSkillNames(
    state.characters[characterId]!,
    state.practice.filter((e) => e.characterId === characterId).flatMap((e) => e.skills),
  );

/** Due selections for a character, oldest first, with what the builder shows. */
export function builderSlots(state: CampaignState, characterId: string): BuilderSlot[] {
  const c = state.characters[characterId];
  if (!c) return [];
  const rules = state.rules;
  const retired = retiredOf(state, characterId);
  return dueSelections(rules, c).map((slot) => {
    const record = c.selections.find((s) => s.level === slot.level);
    return {
      level: slot.level,
      grade: slot.grade,
      capstone: slot.capstone,
      ceiling: rules.grades.find((g) => g.id === slot.grade)?.rarityCeiling ?? '',
      pending: record && record.chosen === null ? record.options : null,
      passedOver: passedOverOptions(rules, c, slot.level, retired),
    };
  });
}

/**
 * Why the engine would refuse this menu (size, ceiling, capstone, profession
 * options, names the character already has), or null when it would accept it.
 */
export function offerProblem(
  state: CampaignState,
  characterId: string,
  level: number,
  options: readonly SkillOption[],
): string | null {
  const c = state.characters[characterId];
  if (!c) return 'No such character.';
  try {
    offerSelection(state.rules, c, level, options, retiredOf(state, characterId));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** MW.2: a menu row as the flags read it. */
export interface DraftRow {
  readonly name: string;
  readonly rarity: string;
  readonly spell: boolean;
  /** Amount typed for a spell's cost; a whole number above 0 is a cost. */
  readonly costAmount: string;
  readonly costPool: string;
}

/** A spell's typed cost, or null when it is not a whole number above 0. */
export function parseCost(amount: string): number | null {
  const t = amount.trim();
  const n = Number(t);
  return /^\d+$/.test(t) && n > 0 ? n : null;
}

/**
 * MW.2 (DESIGN §11): what stands against a menu, per row and for the whole menu:
 * a rarity above the ceiling, a missed capstone, a name the character has or
 * another row has, a spell with no cost. A flagged menu cannot be sent.
 */
/** The library entry a menu row would follow (keyed by name and rarity, L4). */
export function libraryEntry(state: CampaignState, name: string, rarity: string) {
  return Object.values(state.skillLibrary).find(
    (d) => d.name === name.trim() && d.rarity === rarity,
  );
}

export function draftFlags(
  state: CampaignState,
  characterId: string,
  level: number,
  rows: readonly DraftRow[],
): { readonly rows: readonly (readonly string[])[]; readonly menu: readonly string[] } {
  const { rules } = state;
  const slot = builderSlots(state, characterId).find((s) => s.level === level);
  const c = state.characters[characterId];
  const ladder = rules.skills.rarities.map((r) => r.id);
  const label = (id: string) => rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
  const key = (name: string) => name.trim().toLowerCase();
  const owned = new Set((c?.skills ?? []).map((s) => key(s.name)));
  const ceiling = slot ? ladder.indexOf(slot.ceiling) : -1;
  const flagged = rows.map((r, i) => {
    const flags: string[] = [];
    const name = key(r.name);
    if (ceiling >= 0 && ladder.indexOf(r.rarity) > ceiling) {
      flags.push(`Above this selection's ceiling (${label(slot?.ceiling ?? '')})`);
    }
    if (name !== '' && owned.has(name))
      flags.push(`${c?.name ?? 'The character'} already has this name`);
    if (name !== '' && rows.some((o, j) => j < i && key(o.name) === name)) {
      flags.push('Another option has this name');
    }
    if (name !== '' && r.spell) {
      const amount = parseCost(r.costAmount);
      const known = libraryEntry(state, r.name, r.rarity);
      if (amount === null) flags.push('A spell needs a cost');
      // Sending never changes a library entry other characters may follow.
      else if (known && (known.cost?.amount !== amount || known.cost.pool !== r.costPool)) {
        const has = known.cost
          ? `costs ${known.cost.amount} ${rules.pools.find((p) => p.id === known.cost?.pool)?.name ?? known.cost.pool}`
          : 'has no cost';
        flags.push(`The library's ${known.name} ${has}: match it or rename this option`);
      }
    }
    return flags;
  });
  const named = rows.filter((r) => key(r.name) !== '');
  const missed =
    slot?.capstone === true && named.length > 0 && !named.some((r) => r.rarity === slot.ceiling);
  return {
    rows: flagged,
    menu: missed ? [`The capstone needs an option at the ceiling (${label(slot.ceiling)})`] : [],
  };
}
