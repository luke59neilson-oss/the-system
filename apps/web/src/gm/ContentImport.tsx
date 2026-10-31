import { useEffect, useRef, useState } from 'react';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { OFF_KIND_NOTE, offKind } from './generationKinds';

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
      /** Sections read but no longer used (MT.3: `hunger`). */
      ignored: { path: string; message: string }[];
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

/** Content handed over by another window (MC.2: a co-DM generation). `seq` changes per hand-over. */
export interface IncomingContent {
  readonly text: string;
  readonly name: string;
  readonly seq: number;
  /** Written by the co-DM: the window says to check it before applying. */
  readonly generated?: boolean;
  /** QF.50: the generation kind asked for; entries of other kinds start unticked. */
  readonly kind?: string;
}

/** The entries ticked when a preview opens: every one that can apply and was asked for. */
export function initialPicks(
  entries: readonly { path: string; command: { type: string }; error: string | null }[],
  kind: string | undefined,
): Set<string> {
  return new Set(
    entries.filter((e) => e.error === null && !offKind(kind, e.command.type)).map((e) => e.path),
  );
}

/**
 * Whether Import content takes a hand-over now (MC.2 review H1/H2): never
 * while it is loading or applying (the hand-over waits), and each hand-over
 * once.
 */
export function takesIncoming(
  busy: boolean,
  incoming: IncomingContent | null,
  lastSeq: number | null,
): boolean {
  return !busy && incoming !== null && incoming.seq !== lastSeq;
}

export function ContentImport({
  client,
  gmKey,
  incoming = null,
  onApproved,
}: {
  client: LiveClient;
  gmKey: string;
  incoming?: IncomingContent | null;
  /** MC.4: every ticked entry of a co-DM generation applied (clears a loading screen). */
  onApproved?: () => void;
}) {
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [generated, setGenerated] = useState(false);
  const [genKind, setGenKind] = useState<string | undefined>(undefined);
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
    await loadText(() => file.text(), file.name, false);
  };

  /**
   * Reads and previews a file. Only the newest load (or re-check) may change
   * the window, so a slow file pick never overwrites a later generation.
   */
  const loadText = async (read: () => Promise<string>, name: string, isGenerated: boolean) => {
    setBusy(true);
    setOutcome(null);
    const run = ++checkRun.current;
    try {
      const text = await read();
      const p = await requestPreview(gmKey, text);
      if (run !== checkRun.current) return;
      setFileText(text);
      setFileName(name);
      setGenerated(isGenerated);
      setGenKind(undefined);
      setPreview(p);
      setChecks(new Map());
      setChecking(false);
      setPicked(p.ok ? initialPicks(p.entries, undefined) : new Set());
    } catch {
      if (run === checkRun.current) {
        setPreview(null);
        setChecks(new Map());
        setOutcome('Could not check the file: is the server running?');
      }
    } finally {
      setBusy(false);
    }
  };

  // MC.2: a generation (or the GM's edit of one) opens here like a picked
  // file. One that arrives while the window is busy (loading, or applying
  // entries) waits until it is done, so an apply never runs against, or
  // wipes, content the GM has not seen.
  const lastSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!takesIncoming(busy, incoming, lastSeq.current) || !incoming) return;
    lastSeq.current = incoming.seq;
    const { text, name } = incoming;
    const isGenerated = incoming.generated === true;
    const kind = isGenerated ? incoming.kind : undefined;
    const run = ++checkRun.current;
    setBusy(true);
    // An "Applied N" from the apply this hand-over waited for stays visible.
    setOutcome((cur) => (cur?.startsWith('Applied ') ? cur : null));
    requestPreview(gmKey, text)
      .then((p) => {
        if (run !== checkRun.current) return;
        setFileText(text);
        setFileName(name);
        setGenerated(isGenerated);
        setGenKind(kind);
        setPreview(p);
        setChecks(new Map());
        setChecking(false);
        setPicked(p.ok ? initialPicks(p.entries, kind) : new Set());
      })
      .catch(() => {
        if (run !== checkRun.current) return;
        setPreview(null);
        setChecks(new Map());
        setChecking(false);
        setOutcome('Could not check the file: is the server running?');
      })
      .finally(() => setBusy(false));
  }, [incoming, busy, gmKey]);

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
    setOutcome(null);
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
    if (generated && applied.size > 0) onApproved?.();
  };

  const blocked = [...picked].some((p) => checks.has(p));
  return (
    // QF.46: a new file pick or tick clears the old "Applied N" line.
    <section
      className="window import-window"
      aria-labelledby="import-heading"
      onChange={() => setOutcome(null)}
    >
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
          {generated && (
            <p className="small muted" data-testid="import-generated-note">
              Written by the co-DM: read it before you apply it.
            </p>
          )}
          {preview.errors.length > 0 && (
            <ul className="err" role="alert" aria-label="Entries that cannot apply">
              {preview.errors.map((e) => (
                <li key={`${e.path}:${e.message}`}>
                  <code>{e.path}</code>: {e.message}
                </li>
              ))}
            </ul>
          )}
          {preview.ignored.length > 0 && (
            <ul className="muted" aria-label="Ignored sections">
              {preview.ignored.map((e) => (
                <li key={e.path}>
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
                {!e.error && offKind(genKind, e.command.type) && (
                  <span className="small warn" data-testid="import-off-kind">
                    {' '}
                    {OFF_KIND_NOTE}
                  </span>
                )}
                {e.command.type === 'quest.create' && <QuestPreview command={e.command} />}
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
  'quest.create': 'Quest',
  'region.define': 'Region',
  'note.create': 'GM note',
  'shop.define': 'Shop',
};

/** "Item: Pale Hide Bracers", "Skill menu: level 10". */
function entryLabel(e: PreviewEntry): string {
  const kind = KINDS[e.command.type] ?? e.command.type;
  const c = e.command;
  if (typeof c.name === 'string') return `${kind}: ${c.name}`;
  if (typeof c.title === 'string') return `${kind}: ${c.title}`;
  if (typeof c.level === 'number') return `${kind}: level ${c.level}`;
  return kind;
}

/** QF.50: a quest's text and who sees it, so the GM reads it before approving. */
function QuestPreview({ command }: { command: Record<string, unknown> }) {
  const text = typeof command.text === 'string' ? command.text.trim() : '';
  const hidden = command.visible === false;
  return (
    <div className="small import-quest" data-testid="import-quest-preview">
      <strong>{hidden ? 'Hidden from players' : 'Visible to players'}</strong>
      {typeof command.days === 'number' && ` · ${command.days} days`}
      {text ? <p className="import-quest-text">{text}</p> : <p className="muted">No quest text.</p>}
    </div>
  );
}
