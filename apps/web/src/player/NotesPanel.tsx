import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PlayerNote, PlayerView } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import {
  NOTE_FILTERS,
  editedLabel,
  isOwnNote,
  noteLabel,
  noteTitle,
  parseMarkdown,
  parseTags,
  tagProblem,
  visibleNotes,
  type Inline,
  type NoteFilter,
} from './notes';

/** Title and text limits of the note events (envelope.ts). */
const MAX_TITLE = 200;
const MAX_BODY = 20_000;

type Draft = {
  /** null = a new note. */
  id: string | null;
  kind: 'journal' | 'party';
  title: string;
  body: string;
  tags: string;
  shareable: boolean;
  /** The note's `updatedAt` when the form opened (edits only). */
  base: string | null;
};

const emptyDraft = (): Draft => ({
  id: null,
  kind: 'journal',
  title: '',
  body: '',
  tags: '',
  shareable: false,
  base: null,
});

/**
 * Notes (ROADMAP M3.10, DESIGN §7): the player's private journal (Markdown,
 * optionally shared with the GM) and the party's shared notes, live; tags and
 * search. `client` is null in the GM's View-as panes, which are read-only.
 */
export function NotesPanel({
  view,
  client,
  onLimits,
}: {
  view: PlayerView;
  client: LiveClient | null;
  /** QF.52: asks the server for whole note bodies (absent in tests). */
  onLimits?: LiveClient['viewLimits'];
}) {
  const me = view.viewerId;
  const [filter, setFilter] = useState<NoteFilter>('all');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  // QF.52: the view carries the start of each note; the open one and the one
  // being edited come whole.
  const wantedId = draft?.id ?? null;
  useEffect(() => {
    onLimits?.({ openNotes: [openId, wantedId].filter((id): id is string => id !== null) });
  }, [onLimits, openId, wantedId]);
  const names: Record<string, string> = Object.fromEntries(view.party.map((p) => [p.id, p.name]));
  names[me] = view.me.name;
  const byId = new Map(view.notes.map((n) => [n.id, n]));
  const rows = visibleNotes(view.notes, filter, query, tag);
  const editing = draft?.id != null ? byId.get(draft.id) : undefined;
  // The note being edited was deleted (by its author elsewhere, the GM, or an undo).
  const lost = draft !== null && draft.id !== null && editing === undefined;
  const changedElsewhere =
    draft !== null && editing !== undefined && draft.base !== editing.updatedAt;

  if (lost) {
    // Adjusted while rendering (not in an effect): close the form and say why.
    setDraft(null);
    setNotice('That note was deleted, so your edit was closed.');
  }
  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  const send = async (command: { type: string } & Record<string, unknown>) => {
    if (!client) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await client.command(command);
    setBusy(false);
    if (!result.ok) setError(friendlyError(result.error));
    return result.ok;
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const tags = parseTags(draft.tags);
    const problem =
      tagProblem(tags) ??
      (draft.title.trim() === '' && draft.body.trim() === ''
        ? 'Give the note a title or some text'
        : null);
    if (problem) {
      setError(problem);
      return;
    }
    const fields = { title: draft.title.trim(), body: draft.body, tags };
    const ok =
      draft.id === null
        ? await send({
            type: 'note.create',
            characterId: me,
            kind: draft.kind,
            ...fields,
            shareable: draft.kind === 'journal' ? draft.shareable : true,
          })
        : await send({
            type: 'note.edit',
            noteId: draft.id,
            characterId: me,
            ...fields,
            ...(draft.kind === 'journal' ? { shareable: draft.shareable } : {}),
          });
    if (ok) {
      setNotice(draft.id === null ? 'Note saved.' : 'Changes saved.');
      if (draft.id !== null) setOpenId(draft.id);
      setDraft(null);
      heading.current?.focus({ preventScroll: true });
    }
  };

  const edit = (note: PlayerNote) => {
    setError(null);
    setConfirmDelete(null);
    setDraft({
      id: note.id,
      kind: note.kind,
      title: note.title,
      body: note.body,
      tags: note.tags.join(', '),
      shareable: note.shareable,
      base: note.updatedAt,
    });
  };

  return (
    <section className="window notes-window" aria-labelledby="notes-heading" data-testid="notes">
      <div className="notes-head">
        <h2 id="notes-heading" ref={heading} tabIndex={-1}>
          Notes
        </h2>
        {client && draft === null && (
          <button
            type="button"
            data-testid="note-new"
            onClick={() => {
              setError(null);
              setDraft(emptyDraft());
            }}
          >
            New note
          </button>
        )}
      </div>
      {draft !== null && (
        <form className="note-form" onSubmit={save} data-testid="note-form" aria-label="Note">
          {draft.id === null ? (
            <fieldset className="note-kind">
              <legend>Where</legend>
              <label className="check">
                <input
                  type="radio"
                  name="note-kind"
                  checked={draft.kind === 'journal'}
                  onChange={() => setDraft({ ...draft, kind: 'journal' })}
                />{' '}
                My journal
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="note-kind"
                  checked={draft.kind === 'party'}
                  onChange={() => setDraft({ ...draft, kind: 'party', shareable: true })}
                />{' '}
                Party notes (the whole party and the GM)
              </label>
            </fieldset>
          ) : (
            <p className="muted">
              Editing {draft.kind === 'journal' ? 'a journal entry' : 'a party note'}
            </p>
          )}
          <label>
            Title
            <input
              type="text"
              autoFocus
              value={draft.title}
              maxLength={MAX_TITLE}
              data-testid="note-title"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            Text
            <textarea
              rows={6}
              value={draft.body}
              maxLength={MAX_BODY}
              data-testid="note-body"
              aria-describedby="note-md-hint"
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </label>
          <p className="muted note-hint" id="note-md-hint">
            Markdown: **bold**, *italic*, # heading, - list, &gt; quote
          </p>
          <label>
            Tags
            <input
              type="text"
              value={draft.tags}
              placeholder="npc:Casper, region:forest"
              data-testid="note-tags"
              aria-describedby="note-tags-hint"
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
            />
          </label>
          <p className="muted note-hint" id="note-tags-hint">
            Separate tags with commas.
          </p>
          {draft.kind === 'journal' && (
            <label className="check note-share">
              <input
                type="checkbox"
                checked={draft.shareable}
                data-testid="note-shareable"
                onChange={(e) => setDraft({ ...draft, shareable: e.target.checked })}
              />{' '}
              Let the GM read this entry
            </label>
          )}
          {changedElsewhere && (
            <p className="warn" role="status" data-testid="note-changed">
              This note changed since you opened it. Saving replaces those changes.
            </p>
          )}
          <div className="note-actions">
            <button type="submit" disabled={busy} data-testid="note-save">
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="err" role="alert" data-testid="notes-error">
          {error}
        </p>
      )}
      <p className="notes-notice" role="status" data-testid="notes-notice">
        {notice}
      </p>
      <div className="history-tools">
        <select
          aria-label="Show notes"
          value={filter}
          data-testid="notes-filter"
          onChange={(e) => setFilter(e.target.value as NoteFilter)}
        >
          {NOTE_FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Search notes"
          placeholder="Search notes…"
          value={query}
          data-testid="notes-search"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {tag !== null && (
        <p className="notes-tag-filter">
          Tagged <span className="note-tag">{tag}</span>{' '}
          <button type="button" data-testid="notes-clear-tag" onClick={() => setTag(null)}>
            Show all tags
          </button>
        </p>
      )}
      {view.notes.length === 0 ? (
        <p className="muted">
          No notes yet. Your journal is private unless you share an entry with the GM.
        </p>
      ) : rows.length === 0 ? (
        <p className="muted" data-testid="notes-empty">
          No notes match.
        </p>
      ) : (
        <ul className="notes-list" data-testid="notes-list">
          {rows.map((note) => {
            const open = openId === note.id;
            const own = isOwnNote(note, me);
            return (
              <li key={note.id} className={`note note-${note.kind}`} data-testid="note">
                <button
                  type="button"
                  className="note-summary"
                  aria-expanded={open}
                  onClick={() => {
                    setConfirmDelete(null);
                    setOpenId(open ? null : note.id);
                  }}
                >
                  <span className="note-title" data-testid="note-heading">
                    {noteTitle(note)}
                  </span>
                  <span className="note-meta muted">
                    <span data-testid="note-label">{noteLabel(note, me, names)}</span>
                    {' · '}
                    {editedLabel(note.updatedAt)}
                  </span>
                </button>
                {open && (
                  <div className="note-open">
                    <Markdown source={note.body} />
                    {note.bodyCut && (
                      <p className="muted" data-testid="note-loading">
                        Loading the rest of the note…
                      </p>
                    )}
                    {note.tags.length > 0 && (
                      <div className="note-tags" aria-label="Tags">
                        {note.tags.map((t) => (
                          <button
                            key={t}
                            type="button"
                            className="note-tag"
                            data-testid="note-tag"
                            aria-label={`Show notes tagged ${t}`}
                            onClick={() => setTag(t)}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                    {client && own && draft === null && (
                      <div className="note-actions">
                        <button
                          type="button"
                          disabled={busy || note.bodyCut === true}
                          data-testid="note-edit"
                          onClick={() => edit(note)}
                        >
                          Edit
                        </button>
                        {note.kind === 'journal' && (
                          <button
                            type="button"
                            disabled={busy}
                            data-testid="note-share"
                            onClick={() =>
                              void send({
                                type: 'note.edit',
                                noteId: note.id,
                                characterId: me,
                                shareable: !note.shareable,
                              }).then((ok) => {
                                if (ok) {
                                  setNotice(
                                    note.shareable
                                      ? 'The entry is private again.'
                                      : 'The GM can now read this entry.',
                                  );
                                }
                              })
                            }
                          >
                            {note.shareable ? 'Make private' : 'Share with the GM'}
                          </button>
                        )}
                        {confirmDelete === note.id ? (
                          <button
                            type="button"
                            className="danger"
                            disabled={busy}
                            data-testid="note-delete-confirm"
                            onClick={() =>
                              void send({
                                type: 'note.delete',
                                noteId: note.id,
                                characterId: me,
                              }).then((ok) => {
                                setConfirmDelete(null);
                                if (ok) {
                                  setNotice('Note deleted.');
                                  heading.current?.focus({ preventScroll: true });
                                }
                              })
                            }
                          >
                            Delete for good
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            data-testid="note-delete"
                            onClick={() => setConfirmDelete(note.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Renders the safe Markdown subset as React elements (never as HTML). */
function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  if (blocks.length === 0) return null;
  return (
    <div className="note-body" data-testid="note-body-view">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading': {
            const Tag = b.level === 1 ? 'h3' : b.level === 2 ? 'h4' : 'h5';
            return (
              <Tag key={i}>
                <Inlines parts={b.inlines} />
              </Tag>
            );
          }
          case 'list': {
            const List = b.ordered ? 'ol' : 'ul';
            return (
              <List key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Inlines parts={item} />
                  </li>
                ))}
              </List>
            );
          }
          case 'quote':
            return (
              <blockquote key={i}>
                <Lines lines={b.lines} />
              </blockquote>
            );
          case 'paragraph':
            return (
              <p key={i}>
                <Lines lines={b.lines} />
              </p>
            );
        }
      })}
    </div>
  );
}

function Lines({ lines }: { lines: Inline[][] }) {
  return lines.map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      <Inlines parts={line} />
    </span>
  ));
}

function Inlines({ parts }: { parts: Inline[] }) {
  return parts.map((p, i) =>
    p.kind === 'strong' ? (
      <strong key={i}>{p.text}</strong>
    ) : p.kind === 'em' ? (
      <em key={i}>{p.text}</em>
    ) : p.kind === 'code' ? (
      <code key={i}>{p.text}</code>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}
