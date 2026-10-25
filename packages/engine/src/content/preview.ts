import { execute, type CommandContext } from '../events/commands';
import type { Campaign } from '../events/log';
import type { ContentError } from './format';
import { parseContentFile } from './format';
import { contentToCommands, type ContentCommand } from './toCommands';

/**
 * Import preview (ROADMAP M9.3): checks a content file against the open
 * campaign without changing it. The file's shape is checked first; then
 * each entry's command is run, in file order, on a scratch copy (pure
 * `execute`, nothing appended), so every rules check (ids, menu sizes,
 * capstones, duplicates within the file) reports against the campaign as it
 * would be after the entries before it. The GM then approves the entries
 * that passed; nothing applies before that.
 */
export interface ContentPreviewEntry {
  readonly path: string;
  readonly command: ContentCommand['command'];
  /** Null when the entry would apply; otherwise why not. */
  readonly error: string | null;
  /**
   * A heads-up that does not block: an item, bestiary entry, quest or GM
   * note whose name the campaign already has (these may share names, so
   * importing a file twice would add a second copy); or, for a drafted skill
   * menu or evolution, whose screen it goes to on Apply, its options, and
   * the menu or release it replaces (M9.A review).
   */
  readonly note: string | null;
}

export type ContentPreview =
  | { readonly ok: false; readonly errors: readonly ContentError[] }
  | {
      readonly ok: true;
      readonly title: string | null;
      readonly entries: readonly ContentPreviewEntry[];
      /** Entries that cannot apply (characters not found). */
      readonly errors: readonly ContentError[];
    };

/**
 * `only` (paths such as `items[1]`) previews just those entries, still in
 * file order, so an entry that needs one the GM left unticked shows why
 * before anything applies. Entries outside `only` report no error.
 */
export function previewContent(
  campaign: Campaign,
  input: string | unknown,
  ctx: CommandContext,
  only?: ReadonlySet<string>,
): ContentPreview {
  const parsed = parseContentFile(input);
  if (!parsed.ok) return parsed;
  if (!campaign.state) {
    return { ok: false, errors: [{ path: '(file)', message: 'No campaign is open' }] };
  }
  const { commands, errors } = contentToCommands(parsed.content, campaign.state);
  let scratch = campaign;
  const entries = commands.map(({ path, command }) => {
    if (only && !only.has(path)) return { path, command, error: null, note: null };
    const note = entryNote(scratch, command);
    const r = execute(scratch, command, ctx);
    if (r.ok) scratch = r.campaign;
    return { path, command, error: r.ok ? null : r.error, note: r.ok ? note : null };
  });
  return { ok: true, title: parsed.content.title ?? null, entries, errors };
}

function entryNote(campaign: Campaign, command: ContentCommand['command']): string | null {
  const state = campaign.state;
  if (!state) return null;
  const same = (wanted: string) => (n: { name?: string; title?: string }) =>
    (n.name ?? n.title ?? '').trim().toLowerCase() === wanted.trim().toLowerCase();
  switch (command.type) {
    case 'item.define':
      return Object.values(state.items).some(same(command.name))
        ? `The item library already has an item named [${command.name}]: this adds another`
        : null;
    case 'entity.define':
      return Object.values(state.entities).some(same(command.name))
        ? `The bestiary already has an entry named [${command.name}]: this adds another`
        : null;
    case 'quest.create':
      return Object.values(state.quests).some(same(command.title))
        ? `The campaign already has a quest named "${command.title}": this adds another`
        : null;
    case 'note.create':
      return Object.values(state.notes).some(
        (n) => n.kind === command.kind && same(command.title ?? '')(n),
      )
        ? `There is already a GM note named "${command.title ?? ''}": this adds another`
        : null;
    case 'selection.offer': {
      const who = characterOf(state, command.characterId);
      if (!who) return null;
      const options = command.options
        .map((o) => `[${o.name} (${rarityName(state, o.rarity)})]`)
        .join(', ');
      const replaces = who.selections.some((r) => r.level === command.level && r.chosen === null)
        ? `; replaces the level ${command.level} menu ${who.name} has now`
        : '';
      return `Goes to ${who.name}'s screen on Apply: ${options}${replaces}`;
    }
    case 'evolution.release': {
      const who = characterOf(state, command.characterId);
      if (!who) return null;
      const options = command.options.map((o) => `[${o.className}]`).join(', ');
      const replaces = who.evolution ? `; replaces the evolution ${who.name} was offered` : '';
      // The re-rating the import approves (MT.1): each changed skill, or none.
      const set = command.rerate ?? {};
      const changes = who.skills.flatMap((s) => {
        const to = Object.prototype.hasOwnProperty.call(set, s.name) ? set[s.name] : undefined;
        return to === undefined || to === s.rarity
          ? []
          : [`[${s.name}] ${rarityName(state, s.rarity)} → ${rarityName(state, to)}`];
      });
      const rerate =
        changes.length === 0
          ? '. Re-rating: every skill keeps its rarity'
          : `. Re-rating: ${changes.join(', ')}; the rest keep their rarity`;
      return `Goes to ${who.name}'s screen on Apply: ${options}${replaces}${rerate}`;
    }
    default:
      return null;
  }
}

function characterOf(state: NonNullable<Campaign['state']>, id: string) {
  return Object.prototype.hasOwnProperty.call(state.characters, id)
    ? (state.characters[id] ?? null)
    : null;
}

/** The rules' name for a rarity id ("rare" → "Rare"). */
const rarityName = (state: NonNullable<Campaign['state']>, id: string) =>
  state.rules.skills.rarities.find((r) => r.id === id)?.name ?? id;
