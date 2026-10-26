import type { Command } from '../events/commands';
import type { CampaignState } from '../events/reducer';
import type { ContentError, ContentFile } from './format';

/**
 * The GM commands a checked content file stands for (M9.2; applied with the
 * GM's approval in M9.3). Characters named by name (any case) or id are
 * resolved against `state`; a name that matches no character, or two, is an
 * error with its path. Title percentages are whole percent in files and
 * fractions in the engine (5 → 0.05). Nothing here runs a command: the
 * engine's own checks (rules ids, menu sizes, capstones) still apply when
 * the GM approves.
 */
export interface ContentCommand {
  /** Where in the file it came from, e.g. `skills[2]`. */
  readonly path: string;
  readonly command: Command;
}

export function contentToCommands(
  content: ContentFile,
  state: CampaignState,
): { readonly commands: readonly ContentCommand[]; readonly errors: readonly ContentError[] } {
  const commands: ContentCommand[] = [];
  const errors: ContentError[] = [];
  const character = (ref: string, path: string): string | null => {
    if (Object.prototype.hasOwnProperty.call(state.characters, ref)) return ref;
    const wanted = ref.trim().toLowerCase();
    const matches = state.characterOrder.filter(
      (id) => state.characters[id]?.name.trim().toLowerCase() === wanted,
    );
    if (matches.length === 1) return matches[0] ?? null;
    errors.push({
      path,
      message:
        matches.length === 0
          ? `No character named "${ref}"`
          : `${matches.length} characters are named "${ref}": use the id`,
    });
    return null;
  };

  (content.skills ?? []).forEach((s, i) =>
    commands.push({ path: `skills[${i}]`, command: { type: 'skillDef.define', ...s } }),
  );
  (content.items ?? []).forEach((item, i) =>
    commands.push({ path: `items[${i}]`, command: { type: 'item.define', ...item } }),
  );
  (content.titles ?? []).forEach((t, i) => {
    const { bonuses, ...rest } = t;
    commands.push({
      path: `titles[${i}]`,
      command: {
        type: 'titleDef.define',
        ...rest,
        ...(bonuses
          ? {
              bonuses: bonuses.map((b) => ({
                stat: b.stat,
                ...(b.flat === undefined ? {} : { flat: b.flat }),
                ...(b.percent === undefined ? {} : { percent: b.percent / 100 }),
              })),
            }
          : {}),
      },
    });
  });
  (content.bestiary ?? []).forEach((e, i) =>
    commands.push({ path: `bestiary[${i}]`, command: { type: 'entity.define', ...e } }),
  );
  (content.skillOffers ?? []).forEach((o, i) => {
    const characterId = character(o.character, `skillOffers[${i}].character`);
    if (characterId === null) return;
    commands.push({
      path: `skillOffers[${i}]`,
      command: { type: 'selection.offer', characterId, level: o.level, options: o.options },
    });
  });
  (content.evolutions ?? []).forEach((e, i) => {
    const characterId = character(e.character, `evolutions[${i}].character`);
    if (characterId === null) return;
    commands.push({
      path: `evolutions[${i}]`,
      command: {
        type: 'evolution.release',
        characterId,
        options: e.options,
        ...(e.professions ? { professions: e.professions } : {}),
        ...(e.rerate ? { rerate: e.rerate } : {}),
        // The import preview lists the re-rating; approving the import
        // approves it (MT.1, D209).
        rerateApproved: true,
      },
    });
  });
  (content.regions ?? []).forEach((r, i) =>
    commands.push({ path: `regions[${i}]`, command: { type: 'region.define', ...r } }),
  );
  // MT.11 (Q72): `notice: false` imports a hidden quest switched off (nobody told).
  (content.quests ?? []).forEach(({ notice, ...q }, i) =>
    commands.push({
      path: `quests[${i}]`,
      command: { type: 'quest.create', ...q, ...(notice === false ? { noticeTo: [] } : {}) },
    }),
  );
  (content.gmNotes ?? []).forEach((n, i) =>
    commands.push({
      path: `gmNotes[${i}]`,
      command: { type: 'note.create', characterId: null, kind: 'gm', ...n },
    }),
  );
  // `hunger` (M9.5) still reads, but stands for nothing (MT.3: no hunger tracker).
  return { commands, errors };
}
