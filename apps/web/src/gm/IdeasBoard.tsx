import { useState, type FormEvent } from 'react';
import { IDEA_KINDS, type CampaignState, type Idea, type IdeaKind } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import {
  boardIdeas,
  ideaBatches,
  ideaLabel,
  parseTags,
  previewIdeas,
  type IdeaImportPreview,
} from './ideasModel';

interface Draft {
  readonly text: string;
  readonly kind: IdeaKind;
  readonly tags: string;
  readonly source: string;
}
const EMPTY: Draft = { text: '', kind: 'hook', tags: '', source: '' };

/**
 * The GM's story ideas (ROADMAP MW.3, DESIGN §11): add, edit, tag, pin, mark
 * used and search; Import takes the phone page's export file or pasted text
 * and previews it first. GM-only: nothing here reaches a player.
 */
export function IdeasBoard({ client, state }: { client: LiveClient; state: CampaignState }) {
  const [query, setQuery] = useState('');
  const [showUsed, setShowUsed] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pasted, setPasted] = useState('');
  const [preview, setPreview] = useState<IdeaImportPreview | null>(null);

  const shown = boardIdeas(state, query, showUsed);
  const usedCount = state.ideaOrder.filter((id) => state.ideas[id]?.used).length;

  const send = async (command: Parameters<LiveClient['command']>[0], done: string) => {
    setBusy(true);
    const r = await client.command(command);
    setBusy(false);
    setMessage(r.ok ? { ok: true, text: done } : { ok: false, text: friendlyError(r.error) });
    return r.ok;
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const fields = {
      text: draft.text.trim(),
      kind: draft.kind,
      tags: parseTags(draft.tags),
      source: draft.source.trim(),
    };
    const ok = editing
      ? await send({ type: 'idea.edit', ideaId: editing, ...fields }, 'Idea saved')
      : await send({ type: 'idea.add', ...fields }, 'Idea added');
    if (ok) {
      setDraft(EMPTY);
      setEditing(null);
    }
  };

  const startEdit = (idea: Idea) => {
    setEditing(idea.id);
    setMessage(null);
    setDraft({
      text: idea.text,
      kind: idea.kind,
      tags: idea.tags.join(', '),
      source: idea.source,
    });
  };

  const check = (text: string) => {
    setMessage(null);
    setPreview(previewIdeas(text, state));
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    check(await file.text());
  };

  const runImport = async () => {
    if (!preview?.ok || preview.fresh.length === 0) return;
    setBusy(true);
    let added = 0;
    for (const ideas of ideaBatches(preview.fresh)) {
      const r = await client.command({ type: 'idea.import', ideas });
      if (!r.ok) {
        setBusy(false);
        setMessage({
          ok: false,
          text: `${added > 0 ? `Imported ${added}, then stopped: ` : ''}${friendlyError(r.error)}`,
        });
        setPreview(null);
        return;
      }
      added += ideas.length;
    }
    setBusy(false);
    setMessage({ ok: true, text: `Imported ${added} idea${added === 1 ? '' : 's'}` });
    setPreview(null);
    setPasted('');
  };

  return (
    <section className="window ideas-board" aria-labelledby="ideas-heading">
      <h2 id="ideas-heading">Ideas</h2>
      <p className="muted">
        Your story ideas (GM only). The co-DM may weave in a few unused ones that fit, and says when
        it does.
      </p>

      <form onSubmit={(e) => void save(e)} aria-label={editing ? 'Edit idea' : 'Add an idea'}>
        <label>
          Idea
          <textarea
            rows={2}
            maxLength={5000}
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          />
        </label>
        <div className="library-tools">
          <label>
            Kind
            <select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as IdeaKind })}
            >
              {IDEA_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tags (commas between)
            <input
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
            />
          </label>
          <label>
            Inspired by
            <input
              maxLength={500}
              value={draft.source}
              onChange={(e) => setDraft({ ...draft, source: e.target.value })}
            />
          </label>
        </div>
        <button type="submit" disabled={busy || draft.text.trim() === ''}>
          {editing ? 'Save idea' : 'Add idea'}
        </button>{' '}
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setDraft(EMPTY);
            }}
          >
            Cancel
          </button>
        )}
      </form>

      <details>
        <summary>Import ideas</summary>
        <label>
          Export file from your ideas page (.json)
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <label>
          Or paste text (one idea per paragraph)
          <textarea rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} />
        </label>
        <button type="button" disabled={busy || pasted.trim() === ''} onClick={() => check(pasted)}>
          Preview pasted text
        </button>
        {preview && !preview.ok && (
          <p className="err" role="alert">
            {preview.error}. Nothing was imported.
          </p>
        )}
        {preview?.ok && (
          <div data-testid="ideas-preview">
            <p>
              {preview.fresh.length} new
              {preview.skipped > 0 ? `, ${preview.skipped} already on the board (skipped)` : ''}.
            </p>
            <ul>
              {preview.fresh.slice(0, 20).map((idea) => (
                <li key={idea.id}>
                  <span className="muted">{idea.kind}</span> {ideaLabel(idea)}
                </li>
              ))}
              {preview.fresh.length > 20 && (
                <li className="muted">and {preview.fresh.length - 20} more</li>
              )}
            </ul>
            <button
              type="button"
              disabled={busy || preview.fresh.length === 0}
              onClick={() => void runImport()}
            >
              Import {preview.fresh.length}
            </button>{' '}
            <button type="button" onClick={() => setPreview(null)}>
              Cancel
            </button>
          </div>
        )}
      </details>

      {message && (
        <p className={message.ok ? 'ok' : 'err'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}

      <div className="library-tools">
        <label>
          Search ideas
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={showUsed}
            onChange={(e) => setShowUsed(e.target.checked)}
          />{' '}
          Show used ({usedCount})
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="muted">
          {state.ideaOrder.length === 0 ? 'No ideas yet.' : 'No ideas match.'}
        </p>
      ) : (
        <ul className="ideas-list" aria-label="Ideas">
          {shown.map((idea) => (
            <li key={idea.id} data-testid="idea-row">
              <p className="idea-text">
                {idea.pinned ? <strong>Pinned: </strong> : null}
                {idea.text}
              </p>
              <p className="muted">
                {idea.kind}
                {idea.tags.length > 0 ? ` · ${idea.tags.join(', ')}` : ''}
                {idea.source ? ` · ${idea.source}` : ''}
                {idea.used ? ' · used' : ''}
              </p>
              <button type="button" disabled={busy} onClick={() => startEdit(idea)}>
                Edit
              </button>{' '}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void send(
                    { type: 'idea.edit', ideaId: idea.id, pinned: !idea.pinned },
                    idea.pinned ? 'Unpinned' : 'Pinned',
                  )
                }
              >
                {idea.pinned ? 'Unpin' : 'Pin'}
              </button>{' '}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void send(
                    { type: 'idea.edit', ideaId: idea.id, used: !idea.used },
                    idea.used ? 'Marked unused' : 'Marked used',
                  )
                }
              >
                {idea.used ? 'Mark unused' : 'Mark used'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
