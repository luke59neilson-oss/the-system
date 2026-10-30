import { useState } from 'react';
import type { CampaignState } from '@the-system/engine';
import type { LiveClient } from '../live';
import { LORE_TAG, loreNotes } from './quickModel';

/**
 * MD.3 Lore view (DESIGN §11 "Keep"): the lore the GM has kept, newest first,
 * each with the NPC, place and session it is tagged to, and an editor. Kept
 * lore is a GM note: GM-only, and the co-DM reads it for that NPC or place.
 */
export function LoreView({ client, state }: { client: LiveClient; state: CampaignState }) {
  const notes = loreNotes(Object.values(state.notes));
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    if (!editing) return;
    const body = editing.body.trim();
    if (body === '') {
      setMessage('Lore cannot be empty');
      return;
    }
    const r = await client.command({
      type: 'note.edit',
      noteId: editing.id,
      characterId: null,
      body,
    });
    if (r.ok) {
      setEditing(null);
      setMessage('Lore saved');
    } else setMessage(r.error);
  };

  return (
    <details className="lore-view" data-testid="lore-view">
      <summary>Kept lore ({notes.length})</summary>
      {notes.length === 0 ? (
        <p className="muted">Nothing kept yet: press Keep on a quick response.</p>
      ) : (
        <ul aria-label="Kept lore">
          {notes.map((n) => (
            <li key={n.id} data-testid="lore-note">
              <strong>{n.title}</strong>{' '}
              <span className="muted">
                {n.tags.filter((t) => t.toLowerCase() !== LORE_TAG).join(' · ')}
              </span>
              {editing?.id === n.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                  }}
                >
                  <label>
                    Edit lore
                    <textarea
                      value={editing.body}
                      maxLength={4000}
                      rows={4}
                      onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                    />
                  </label>
                  <button type="submit">Save</button>{' '}
                  <button type="button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <p className="lore-body">{n.body}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setMessage(null);
                      setEditing({ id: n.id, body: n.body });
                    }}
                  >
                    Edit
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
