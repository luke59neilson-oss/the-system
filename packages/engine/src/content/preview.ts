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

export function previewContent(
  campaign: Campaign,
  input: string | unknown,
  ctx: CommandContext,
): ContentPreview {
  const parsed = parseContentFile(input);
  if (!parsed.ok) return parsed;
  if (!campaign.state) {
    return { ok: false, errors: [{ path: '(file)', message: 'No campaign is open' }] };
  }
  const { commands, errors } = contentToCommands(parsed.content, campaign.state);
  let scratch = campaign;
  const entries = commands.map(({ path, command }) => {
    const r = execute(scratch, command, ctx);
    if (r.ok) scratch = r.campaign;
    return { path, command, error: r.ok ? null : r.error };
  });
  return { ok: true, title: parsed.content.title ?? null, entries, errors };
}
