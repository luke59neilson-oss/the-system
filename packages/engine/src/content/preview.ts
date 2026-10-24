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
   * A heads-up that does not block: an item or bestiary entry whose name
   * the campaign already has (both may share names, so importing a file
   * twice would add a second copy).
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
    const note = duplicateItemNote(scratch, command);
    const r = execute(scratch, command, ctx);
    if (r.ok) scratch = r.campaign;
    return { path, command, error: r.ok ? null : r.error, note: r.ok ? note : null };
  });
  return { ok: true, title: parsed.content.title ?? null, entries, errors };
}

function duplicateItemNote(campaign: Campaign, command: ContentCommand['command']): string | null {
  const state = campaign.state;
  if (!state || (command.type !== 'item.define' && command.type !== 'entity.define')) return null;
  const key = command.name.trim().toLowerCase();
  const same = (n: { name: string }) => n.name.trim().toLowerCase() === key;
  if (command.type === 'item.define') {
    return Object.values(state.items).some(same)
      ? `The item library already has an item named [${command.name}]: this adds another`
      : null;
  }
  return Object.values(state.entities).some(same)
    ? `The bestiary already has an entry named [${command.name}]: this adds another`
    : null;
}
