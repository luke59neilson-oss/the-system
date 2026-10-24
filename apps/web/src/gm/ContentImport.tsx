import { useState } from 'react';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';

/**
 * Import with approval (ROADMAP M9.3, WIP). The GM picks a content file
 * (docs/CONTENT-FORMAT.md); the server previews it against the campaign
 * without changing anything; the GM ticks what applies and the approved
 * entries' commands go over the GM connection, in file order.
 */
interface PreviewEntry {
  readonly path: string;
  readonly command: { type: string } & Record<string, unknown>;
  readonly error: string | null;
}
type Preview =
  | { ok: false; errors: { path: string; message: string }[] }
  | {
      ok: true;
      title: string | null;
      entries: PreviewEntry[];
      errors: { path: string; message: string }[];
    };

export function ContentImport({ client, gmKey }: { client: LiveClient; gmKey: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setOutcome(null);
    try {
      const r = await fetch('/api/gm/content/preview', {
        method: 'POST',
        headers: { 'x-gm-key': gmKey, 'content-type': 'application/json' },
        body: JSON.stringify(await file.text()),
      });
      const p = (await r.json()) as Preview;
      setPreview(p);
      setPicked(new Set(p.ok ? p.entries.filter((e) => e.error === null).map((e) => e.path) : []));
    } catch {
      setOutcome('Could not check the file: is the server running?');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!preview?.ok) return;
    setBusy(true);
    let done = 0;
    for (const e of preview.entries) {
      if (!picked.has(e.path)) continue;
      const r = await client.command(e.command);
      if (!r.ok) {
        setOutcome(`Applied ${done}; ${e.path} failed: ${friendlyError(r.error)}`);
        setBusy(false);
        return;
      }
      done++;
    }
    setBusy(false);
    setPreview(null);
    setOutcome(`Applied ${done} entr${done === 1 ? 'y' : 'ies'}`);
  };

  return (
    <section className="window import-window" aria-labelledby="import-heading">
      <h2 id="import-heading">Import content</h2>
      <label>
        Content file (.json)
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => void load(e.target.files?.[0])}
        />
      </label>
      {preview && !preview.ok && (
        <ul className="err" role="alert" aria-label="Problems in the file">
          {preview.errors.map((e) => (
            <li key={`${e.path}:${e.message}`}>
              <code>{e.path}</code>: {e.message}
            </li>
          ))}
        </ul>
      )}
      {preview?.ok && (
        <>
          {preview.title && <p>{preview.title}</p>}
          {preview.errors.length > 0 && (
            <ul className="err" role="alert" aria-label="Entries that cannot apply">
              {preview.errors.map((e) => (
                <li key={`${e.path}:${e.message}`}>
                  <code>{e.path}</code>: {e.message}
                </li>
              ))}
            </ul>
          )}
          <ul className="import-entries">
            {preview.entries.map((e) => (
              <li key={e.path}>
                <label>
                  <input
                    type="checkbox"
                    disabled={busy || e.error !== null}
                    checked={picked.has(e.path)}
                    onChange={(ev) => {
                      const next = new Set(picked);
                      if (ev.target.checked) next.add(e.path);
                      else next.delete(e.path);
                      setPicked(next);
                    }}
                  />
                  <span>{entryLabel(e)}</span> <code>{e.path}</code>
                </label>
                {e.error && <span className="err small"> {friendlyError(e.error)}</span>}
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy || picked.size === 0} onClick={() => void apply()}>
            Apply {picked.size}
          </button>
        </>
      )}
      {outcome && <p role="status">{outcome}</p>}
    </section>
  );
}

const KINDS: Record<string, string> = {
  'skillDef.define': 'Skill',
  'item.define': 'Item',
  'titleDef.define': 'Title',
  'entity.define': 'Bestiary',
  'selection.offer': 'Skill menu',
  'evolution.release': 'Evolution options',
};

/** "Item: Pale Hide Bracers", "Skill menu: level 10". */
function entryLabel(e: PreviewEntry): string {
  const kind = KINDS[e.command.type] ?? e.command.type;
  const c = e.command;
  if (typeof c.name === 'string') return `${kind}: ${c.name}`;
  if (typeof c.level === 'number') return `${kind}: level ${c.level}`;
  return kind;
}
