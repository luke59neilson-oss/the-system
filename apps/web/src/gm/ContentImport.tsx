import { useRef, useState } from 'react';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';

/**
 * Import with approval (ROADMAP M9.3). The GM picks a content file
 * (docs/CONTENT-FORMAT.md); the server previews it against the campaign
 * without changing anything; the GM ticks what applies and the approved
 * entries' commands go over the GM connection, in file order.
 */
interface PreviewEntry {
  readonly path: string;
  readonly command: { type: string } & Record<string, unknown>;
  readonly error: string | null;
  readonly note: string | null;
}
type Preview =
  | { ok: false; errors: { path: string; message: string }[] }
  | {
      ok: true;
      title: string | null;
      entries: PreviewEntry[];
      errors: { path: string; message: string }[];
    };

/** Error replies (no campaign, a stale key, a file over 2 MB) have no preview shape. */
async function requestPreview(gmKey: string, body: unknown): Promise<Preview> {
  const r = await fetch('/api/gm/content/preview', {
    method: 'POST',
    headers: { 'x-gm-key': gmKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const reply = (await r.json().catch(() => null)) as Preview | { error?: string } | null;
  if (r.ok && reply && 'ok' in reply) return reply;
  const message =
    r.status === 413
      ? 'The file is too large (over 2 MB)'
      : (reply && 'error' in reply && reply.error) || `The server refused it (${r.status})`;
  return { ok: false, errors: [{ path: '(file)', message }] };
}

export function ContentImport({ client, gmKey }: { client: LiveClient; gmKey: string }) {
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  // Errors from re-checking only the ticked entries (an entry that needs one
  // the GM left unticked fails here even though the full preview passed it).
  const [checks, setChecks] = useState<ReadonlyMap<string, string>>(new Map());
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const checkRun = useRef(0);

  const offline = () => {
    setPreview(null);
    setChecks(new Map());
    setOutcome('Could not check the file: is the server running?');
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setOutcome(null);
    checkRun.current++;
    try {
      const text = await file.text();
      const p = await requestPreview(gmKey, text);
      setFileText(text);
      setFileName(file.name);
      setPreview(p);
      setChecks(new Map());
      setChecking(false);
      setPicked(new Set(p.ok ? p.entries.filter((e) => e.error === null).map((e) => e.path) : []));
    } catch {
      offline();
    } finally {
      setBusy(false);
    }
  };

  /** Re-previews just `paths`, in file order, against the campaign as it is now. */
  const recheck = async (paths: ReadonlySet<string>) => {
    const run = ++checkRun.current;
    setChecking(true);
    try {
      const p = await requestPreview(gmKey, { file: fileText, only: [...paths] });
      if (run !== checkRun.current) return;
      if (!p.ok) {
        setPreview(p);
        return;
      }
      setChecks(
        new Map(
          p.entries
            .filter((e) => paths.has(e.path) && e.error !== null)
            .map((e) => [e.path, e.error ?? '']),
        ),
      );
      // Notes ("this adds another") follow the campaign as it is now.
      const notes = new Map(p.entries.map((e) => [e.path, e.note]));
      setPreview((cur) =>
        cur?.ok
          ? {
              ...cur,
              entries: cur.entries.map((e) =>
                notes.has(e.path) && paths.has(e.path)
                  ? { ...e, note: notes.get(e.path) ?? null }
                  : e,
              ),
            }
          : cur,
      );
    } catch {
      if (run === checkRun.current) offline();
    } finally {
      if (run === checkRun.current) setChecking(false);
    }
  };

  const toggle = (path: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(path);
    else next.delete(path);
    setPicked(next);
    void recheck(next);
  };

  const apply = async () => {
    if (!preview?.ok) return;
    setBusy(true);
    const applied = new Set<string>();
    for (const e of preview.entries) {
      if (!picked.has(e.path)) continue;
      const r = await client.command(e.command);
      if (!r.ok) {
        // Drop what applied (it is in the campaign now), keep the rest ticked
        // and check them again so the list shows what still stands.
        const remaining = new Set([...picked].filter((p) => !applied.has(p)));
        setPreview({ ...preview, entries: preview.entries.filter((x) => !applied.has(x.path)) });
        setPicked(remaining);
        setOutcome(
          `Applied ${applied.size}; ${e.path} failed: ${friendlyError(r.error)}. ` +
            'The campaign may have changed since the preview: check the entries above again.',
        );
        setBusy(false);
        void recheck(remaining);
        return;
      }
      applied.add(e.path);
    }
    setBusy(false);
    setPreview(null);
    setChecks(new Map());
    setOutcome(`Applied ${applied.size} entr${applied.size === 1 ? 'y' : 'ies'}`);
  };

  const blocked = [...picked].some((p) => checks.has(p));
  return (
    <section className="window import-window" aria-labelledby="import-heading">
      <h2 id="import-heading">Import content</h2>
      <label>
        Content file (.json)
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => {
            void load(e.target.files?.[0]);
            // Picking the same file again (after editing it) checks it again.
            e.target.value = '';
          }}
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
          <p>
            <code>{fileName}</code>
            {preview.title && ` · ${preview.title}`}
          </p>
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
                    onChange={(ev) => toggle(e.path, ev.target.checked)}
                  />
                  <span>{entryLabel(e)}</span> <code>{e.path}</code>
                </label>
                {e.note && !e.error && <span className="small muted"> {e.note}</span>}
                {(e.error ?? (picked.has(e.path) ? checks.get(e.path) : undefined)) && (
                  <span className="err small">
                    {' '}
                    {friendlyError(e.error ?? checks.get(e.path) ?? '')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy || checking || blocked || picked.size === 0}
            onClick={() => void apply()}
          >
            Apply {picked.size}
          </button>
          {blocked && (
            <p className="small">Untick the entries marked above, or tick what they need.</p>
          )}
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
