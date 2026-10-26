import { useEffect, useState } from 'react';

/** What the server's session-notes routes return (MC.9). */
interface NotesReply {
  readonly session: number | null;
  readonly notes: readonly string[];
  readonly summary: {
    readonly whatHappened: string;
    readonly whoDidWhat: readonly { readonly character: string; readonly did: string }[];
    readonly openThreads: readonly string[];
    readonly npcsMet: readonly string[];
  } | null;
  readonly error?: string;
}

/**
 * MC.9 (DESIGN §11 "Memory"): the co-DM's running notes for the session and,
 * when the GM asks (usually after End session), the summary. Both go into the
 * session log and its export. GM-only routes, behind the GM key.
 */
export function SessionNotes({ gmKey }: { gmKey: string }) {
  const [data, setData] = useState<NotesReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/gm/ai/session-notes', { headers: { 'x-gm-key': gmKey } })
      .then((r) => (r.ok ? (r.json() as Promise<NotesReply>) : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [gmKey]);

  const call = async (url: string, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'x-gm-key': gmKey } });
      const body = (await res.json()) as NotesReply;
      if (!res.ok) {
        setMessage(body.error ?? 'Could not write the session notes');
        return;
      }
      setData(body);
      setMessage(done);
    } catch {
      setMessage('Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  const s = data?.summary ?? null;
  return (
    <details className="codm-notes" data-testid="session-notes">
      <summary>Session notes{data?.session ? ` (session ${data.session})` : ''}</summary>
      <div className="codm-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void call('/api/gm/ai/session-notes', 'Notes updated')}
        >
          Take notes
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void call('/api/gm/ai/session-summary', 'Summary written to the session log')
          }
        >
          Summarise session
        </button>
      </div>
      {message && (
        <p role="status" className="muted" data-testid="session-notes-message">
          {message}
        </p>
      )}
      {s && (
        <div data-testid="session-summary">
          <h3>Summary</h3>
          <p>{s.whatHappened}</p>
          {s.whoDidWhat.length > 0 && (
            <ul aria-label="Who did what">
              {s.whoDidWhat.map((w, i) => (
                <li key={i}>
                  {w.character}: {w.did}
                </li>
              ))}
            </ul>
          )}
          {s.openThreads.length > 0 && (
            <>
              <h4>Open threads</h4>
              <ul>
                {s.openThreads.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {s.npcsMet.length > 0 && (
            <>
              <h4>NPCs met</h4>
              <ul>
                {s.npcsMet.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {data && data.notes.length > 0 && <h4>Running notes</h4>}
      {data && data.notes.length > 0 && (
        <ul aria-label="Running notes" data-testid="session-notes-list">
          {data.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </details>
  );
}
