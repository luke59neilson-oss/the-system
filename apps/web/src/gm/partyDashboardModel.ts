import type { Character, CharacterFlag, RulesConfig } from '@the-system/engine';

/** Who a flag waits on: the GM has something to do, or the player does. */
export type FlagOwner = 'gm' | 'player';

export interface FlagView {
  readonly key: string;
  readonly text: string;
  readonly owner: FlagOwner;
}

/** A dashboard chip for one engine flag (M4.5). */
export function flagView(flag: CharacterFlag): FlagView {
  switch (flag.kind) {
    case 'selection': {
      const what = `${flag.capstone ? 'Capstone selection' : 'Selection'} (lvl ${flag.level})`;
      return flag.offered
        ? { key: `selection-${flag.level}`, text: `${what}: player choosing`, owner: 'player' }
        : { key: `selection-${flag.level}`, text: `${what}: build the menu`, owner: 'gm' };
    }
    case 'evolution': {
      const what = `Evolution to ${flag.toGrade}-grade`;
      switch (flag.status) {
        case 'ready':
          return { key: 'evolution', text: `${what}: ready to release`, owner: 'gm' };
        case 'blocked':
          return { key: 'evolution', text: `${what}: waits on a selection`, owner: 'player' };
        case 'released':
          return { key: 'evolution', text: `${what}: player choosing`, owner: 'player' };
      }
      break;
    }
    case 'upgrade':
      return {
        key: `upgrade-${flag.skill}`,
        text: `[${flag.skill}] can upgrade (${flag.marks} marks)`,
        owner: 'gm',
      };
    case 'merge':
      return {
        key: `merge-${flag.skills.join('+')}`,
        text: `Merge ready: [${flag.skills[0]}] + [${flag.skills[1]}] (logged ${flag.count}×)`,
        owner: 'gm',
      };
    case 'freePoints':
      return {
        key: 'freePoints',
        text: `${flag.points} free point${flag.points === 1 ? '' : 's'} to assign`,
        owner: 'player',
      };
  }
}

/** The sheet editor's fields, as typed (strings until saved). */
export interface SheetDraft {
  readonly name: string;
  readonly stats: Readonly<Record<string, string>>;
  readonly pools: Readonly<Record<string, string>>;
  /** Skill name → nickname ('' = none). */
  readonly nicknames: Readonly<Record<string, string>>;
  /** Skill name → Unique tag. */
  readonly unique: Readonly<Record<string, boolean>>;
  /** Stat and pool fields the GM has typed in (`stats.<id>`, `pools.<id>`). */
  readonly touched?: readonly string[];
}

export function draftOf(character: Character): SheetDraft {
  const str = (r: Readonly<Record<string, number>>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]));
  return {
    name: character.name,
    stats: str(character.stats),
    pools: str(character.pools),
    nicknames: Object.fromEntries(character.skills.map((s) => [s.name, s.nickname ?? ''])),
    unique: Object.fromEntries(character.skills.map((s) => [s.name, s.unique])),
  };
}

export type SheetCommand = { type: string } & Record<string, unknown>;

export type SheetPlan =
  | { readonly ok: true; readonly commands: readonly SheetCommand[] }
  | { readonly ok: false; readonly error: string };

const WHOLE = /^\d+$/;

/**
 * The audited events a save sends (M4.5): one command per kind of change, in
 * an order the reducer accepts (stats before pools, so a pool can rise to a
 * maximum the new stats give). A stat or pool is sent when it differs from
 * the live value and the GM changed it: typed something other than what the
 * editor opened with (`base`), or typed in it at all. So a pool that moved
 * live while the editor was open is not written back unless the GM touched
 * it, typing the old value back restores it, and a retry after a partial save
 * does not resend what already landed. Values must be whole numbers of 0 or
 * more; the engine checks pool maxima and the rest.
 */
export function sheetPlan(
  rules: RulesConfig,
  character: Character,
  base: SheetDraft,
  draft: SheetDraft,
): SheetPlan {
  const commands: SheetCommand[] = [];
  const characterId = character.id;
  const name = draft.name.trim();
  if (name === '') return { ok: false, error: 'The name cannot be empty' };
  if (name !== base.name.trim() && name !== character.name) {
    commands.push({ type: 'character.rename', characterId, name });
  }

  const changed = (
    list: readonly { id: string; name: string }[],
    group: 'stats' | 'pools',
    typed: Readonly<Record<string, string>>,
    opened: Readonly<Record<string, string>>,
    live: Readonly<Record<string, number>>,
  ): Record<string, number> | string => {
    const out: Record<string, number> = {};
    const touched = new Set(draft.touched ?? []);
    for (const { id, name: label } of list) {
      const raw = (typed[id] ?? '').trim();
      if (raw === (opened[id] ?? '').trim() && !touched.has(`${group}.${id}`)) continue;
      if (!WHOLE.test(raw)) return `${label} must be a whole number of 0 or more`;
      const value = Number(raw);
      if (!Number.isSafeInteger(value)) return `${label} is too large`;
      if (value !== live[id]) out[id] = value;
    }
    return out;
  };
  const stats = changed(rules.stats.list, 'stats', draft.stats, base.stats, character.stats);
  if (typeof stats === 'string') return { ok: false, error: stats };
  const pools = changed(rules.pools, 'pools', draft.pools, base.pools, character.pools);
  if (typeof pools === 'string') return { ok: false, error: pools };
  if (Object.keys(stats).length > 0) {
    commands.push({ type: 'character.setStats', characterId, stats });
  }
  if (Object.keys(pools).length > 0) {
    commands.push({ type: 'character.setPools', characterId, pools });
  }
  for (const skill of character.skills) {
    const typed = (draft.nicknames[skill.name] ?? '').trim();
    if (typed !== (base.nicknames[skill.name] ?? '').trim()) {
      const nickname = typed === '' ? null : typed;
      if (nickname !== skill.nickname) {
        commands.push({ type: 'skill.nickname', characterId, skill: skill.name, nickname });
      }
    }
    const unique = draft.unique[skill.name];
    if (unique !== undefined && unique !== base.unique[skill.name] && unique !== skill.unique) {
      commands.push({ type: 'skill.setUnique', characterId, skill: skill.name, unique });
    }
  }
  return { ok: true, commands };
}
