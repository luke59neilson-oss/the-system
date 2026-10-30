import { useState } from 'react';
import type { CampaignState } from '@the-system/engine';
import type { LiveClient } from '../live';
import { LORE_TAG, loreNotes, loreScope, retagLore } from './quickModel';

interface LoreDraft {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly npc: string;
  readonly place: string;
}

/**
 * MD.3 Lore view (DESIGN §11 "Keep"): the lore the GM has kept, newest first,
 * each with the NPC, place and session it is tagged to. The GM edits a note's
 * title, text, NPC and place, or deletes it (review M3). Kept lore is a GM
 * note: GM-only, and the co-DM reads it for that NPC or place.
 */
export function LoreView({ client, state }: { client: LiveClient; state: CampaignState }) {
  const notes = loreNotes(Object.values(state.notes));
  const [editing, setEditing] = useState<LoreDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    if (!editing) return;
    const body = editing.body.trim();
    if (body === '') {
      setMessage('Lore cannot be empty');
      return;
    }
    const note = state.notes[editing.id];
    if (!note) {
      setEditing(null);
      setMessage('That lore was deleted');
      return;
    }
    setBusy(true);
    const r = await client.command({
      type: 'note.edit',
      noteId: editing.id,
      characterId: null,
      title: editing.title.trim() || 'Lore',
      body,
      tags: retagLore(note.tags, editing),
    });
    setBusy(false);
    if (r.ok) {
      setEditing(null);
      setMessage('Lore saved');
    } else setMessage(r.error);
  };

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Delete the kept lore "${title}"? The co-DM stops using it.`)) return;
    setBusy(true);
    const r = await client.command({ type: 'note.delete', noteId: id, characterId: null });
    setBusy(false);
    if (r.ok) {
      if (editing?.id === id) setEditing(null);
      setMessage('Lore deleted');
    } else setMessage(r.error);
  };

  const set = (patch: Partial<LoreDraft>) => setEditing((d) => (d ? { ...d, ...patch } : d));

  return (
    <details className="lore-view" data-testid="lore-view">
      <summary>Kept lore ({notes.length})</summary>
      {notes.length === 0 ? (
        <p className="muted">Nothing kept yet: press Keep on a quick response.</p>
      ) : (
        <ul aria-label="Kept lore">
          {notes.map((n) => (
            <li key={n.id} data-testid="lore-note">
              {editing?.id === n.id ? (
                <form
                  aria-label="Edit kept lore"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                  }}
                >
                  <label>
                    Title
                    <input
                      value={editing.title}
                      maxLength={200}
                      onChange={(e) => set({ title: e.target.value })}
                    />
                  </label>
                  <label>
                    NPC
                    <input
                      value={editing.npc}
                      maxLength={100}
                      placeholder="none"
                      onChange={(e) => set({ npc: e.target.value })}
                    />
                  </label>
                  <label>
                    Place
                    <input
                      value={editing.place}
                      maxLength={100}
                      placeholder="none"
                      onChange={(e) => set({ place: e.target.value })}
                    />
                  </label>
                  <label>
                    Edit lore
                    <textarea
                      value={editing.body}
                      maxLength={4000}
                      rows={4}
                      onChange={(e) => set({ body: e.target.value })}
                    />
                  </label>
                  <button type="submit" disabled={busy}>
                    Save
                  </button>{' '}
                  <button type="button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <strong>{n.title}</strong>{' '}
                  <span className="muted">
                    {n.tags.filter((t) => t.toLowerCase() !== LORE_TAG).join(' · ')}
                  </span>
                  <p className="lore-body">{n.body}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setMessage(null);
                      setEditing({ id: n.id, title: n.title, body: n.body, ...loreScope(n.tags) });
                    }}
                  >
                    Edit
                  </button>{' '}
                  <button type="button" disabled={busy} onClick={() => void remove(n.id, n.title)}>
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
