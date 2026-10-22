import type { ClassDef, ProfessionDef, RaceDef } from '../library';
import type { SkillDef } from '../skills';
import { STARTER_CLASSES } from './starters';

/**
 * The default library set (ROADMAP M4.2): the books' six starting classes
 * (MQ.13) and the Human race
 * (no professions, MQ.6), plus skill-library text for every starting class skill. Content,
 * not rules: `library.seedDefaults` copies it into a campaign's libraries as
 * one event, so editing this file never changes an existing campaign.
 */
export interface DefaultLibrary {
  readonly skills: readonly Omit<SkillDef, 'id'>[];
  readonly classes: readonly Omit<ClassDef, 'id'>[];
  readonly races: readonly Omit<RaceDef, 'id'>[];
  readonly professions: readonly Omit<ProfessionDef, 'id'>[];
}

/**
 * Skill-library text for every starting class skill, and the classes
 * themselves: both come from the books' six starting classes (MQ.13).
 */
const SKILLS: readonly Omit<SkillDef, 'id'>[] = STARTER_CLASSES.flatMap((c) =>
  c.skills.map((s) => ({
    name: s.name,
    rarity: s.rarity,
    tags: s.tags,
    description: s.description,
    flavor: s.flavor,
    effects: '',
  })),
);

const CLASSES: readonly Omit<ClassDef, 'id'>[] = STARTER_CLASSES.map((c) => ({
  name: c.name,
  description: c.description,
  skills: c.skills.map((s) => ({ name: s.name, rarity: s.rarity })),
  weights: c.weights,
}));

const RACES: readonly Omit<RaceDef, 'id'>[] = [
  {
    name: 'Human',
    description:
      'Earth’s own, newly integrated. Humans lean no way in particular, which is exactly why the System expects so much of them.',
  },
];

/**
 * No default professions (MQ.6, D105): the GM offers each character
 * professions tailored to what they have done, at the E-grade evolution.
 * The profession library holds only the GM's own entries.
 */
const PROFESSIONS: readonly Omit<ProfessionDef, 'id'>[] = [];

export const DEFAULT_LIBRARY: DefaultLibrary = {
  skills: SKILLS,
  classes: CLASSES,
  races: RACES,
  professions: PROFESSIONS,
};

/** The libraries `missingDefaultEntries` compares against. */
export interface DefaultTarget {
  readonly rules: { readonly skills: { readonly libraryByRarity: boolean } };
  readonly skillLibrary: Readonly<
    Record<string, { readonly name: string; readonly rarity: string }>
  >;
  readonly classLibrary: Readonly<Record<string, { readonly name: string }>>;
  readonly raceLibrary: Readonly<Record<string, { readonly name: string }>>;
  readonly professionLibrary: Readonly<Record<string, { readonly name: string }>>;
}

/**
 * The default entries a campaign's libraries lack: matched by name (ignoring
 * case), and skills under `libraryByRarity` by name and rarity (MQ.12, D126),
 * since that is what makes two skill entries distinct.
 */
export function missingDefaultEntries(state: DefaultTarget): DefaultLibrary {
  const byName = (d: { name: string }) => d.name.trim().toLowerCase();
  const byNameAndRarity = (d: { name: string; rarity?: string }) =>
    `${byName(d)}\u0000${d.rarity ?? ''}`;
  const missing = <T extends { name: string }>(
    defaults: readonly T[],
    library: Readonly<Record<string, { name: string }>>,
    key: (d: { name: string; rarity?: string }) => string = byName,
  ) => {
    const have = new Set(Object.values(library).map(key));
    return defaults.filter((d) => !have.has(key(d)));
  };
  return {
    skills: missing(
      DEFAULT_LIBRARY.skills,
      state.skillLibrary,
      state.rules.skills.libraryByRarity ? byNameAndRarity : byName,
    ),
    classes: missing(DEFAULT_LIBRARY.classes, state.classLibrary),
    races: missing(DEFAULT_LIBRARY.races, state.raceLibrary),
    professions: missing(DEFAULT_LIBRARY.professions, state.professionLibrary),
  };
}
