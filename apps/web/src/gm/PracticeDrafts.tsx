import { useEffect, useState } from 'react';
import type { CampaignState } from '@the-system/engine';
import { friendlyError } from '../format';
import type { LiveClient } from '../live';
import { draftCommand, draftSession, draftWho, type PracticeDraft } from './practiceDraftsModel';

/**
 * Co-DM practice drafts (MC.7, DESIGN §11): the fast model reads the session
 * transcript and drafts practice entries; each waits for the GM in the
 * Practice window's review queue (MC.7 review M5), beside the player and
 * montage entries to review. Only Confirm changes the campaign (an ordinary
 * GM `practice.log` in the session the line was heard in); Dismiss drops
 * the draft. GM-only.
 */
export function PracticeDrafts({
  client,
  gmKey,
  state,
}: {
  client: LiveClient;
  gmKey: string;
  state: CampaignState;
}) {
  const [drafts, setDrafts] = useState<PracticeDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const headers = { 'x-gm-key': gmKey };

  useEffect(() => {
    let live = true;
    void fetch('/api/gm/ai/practice-drafts', { headers: { 'x-gm-key': gmKey } })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          drafts?: PracticeDraft[];
          error?: string;
        };
        if (!live) return;
        if (res.ok) setDrafts(data.drafts ?? []);
        else if (res.status !== 404) setMessage({ ok: false, text: data.error ?? 'No drafts' });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [gmKey]);

  const draft = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/gm/ai/practice-drafts', { method: 'POST', headers }).catch(
      () => null,
    );
    const data = (await res?.json().catch(() => ({}))) as
      { drafts?: PracticeDraft[]; added?: number; read?: number; error?: string } | undefined;
    setBusy(false);
    if (!res?.ok) {
      setMessage({ ok: false, text: data?.error ?? 'Could not draft practice' });
      return;
    }
    setDrafts(data?.drafts ?? []);
    setMessage({
      ok: true,
      text:
        data?.read === 0
          ? 'No new transcript lines to read'
          : `Read ${data?.read ?? 0} lines: ${data?.added ?? 0} new ${data?.added === 1 ? 'draft' : 'drafts'}`,
    });
  };

  const drop = async (id: string) => {
    const res = await fetch(`/api/gm/ai/practice-drafts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { drafts: PracticeDraft[] };
      setDrafts(data.drafts);
    }
    return res?.ok ?? false;
  };

  const confirm = async (d: PracticeDraft) => {
    setBusy(true);
    const r = await client.command(draftCommand(state, d));
    if (r.ok) await drop(d.id);
    setBusy(false);
    setMessage(
      r.ok
        ? { ok: true, text: `Logged: ${draftWho(state, d)} [${d.skill}]` }
        : { ok: false, text: friendlyError(r.error) },
    );
  };

  const dismiss = async (d: PracticeDraft) => {
    setBusy(true);
    const ok = await drop(d.id);
    setBusy(false);
    setMessage(
      ok ? { ok: true, text: 'Draft dismissed' } : { ok: false, text: 'Could not dismiss' },
    );
  };

  return (
    <div className="practice-drafts" role="group" aria-labelledby="practice-drafts-heading">
      <h3 id="practice-drafts-heading">Co-DM drafts ({drafts.length})</h3>
      <p className="muted">
        Drafted from the transcript. Nothing counts until you confirm it; marks stay one per skill
        per session.
      </p>
      <button type="button" disabled={busy} onClick={() => void draft()}>
        Draft from transcript
      </button>
      {message && (
        <p role="status" className={message.ok ? undefined : 'error'} data-testid="drafts-message">
          {message.text}
        </p>
      )}
      {drafts.length === 0 ? (
        <p className="muted">No drafts waiting.</p>
      ) : (
        <ul className="practice-review" aria-label="Practice drafts">
          {drafts.map((d) => (
            <li key={d.id}>
              <strong>{draftWho(state, d)}</strong> [{d.skill}]: {d.action}{' '}
              <span className="muted">
                ({d.confidence}, {attributionText[d.attributedBy]},{' '}
                {draftSession(state, d) ?? 'no session'},{' '}
                <time dateTime={d.at}>
                  {new Date(d.at).toLocaleTimeString([], { hour12: false })}
                </time>
                )
              </span>
              <blockquote>“{d.quote}”</blockquote>
              <button type="button" disabled={busy} onClick={() => void confirm(d)}>
                Confirm
              </button>{' '}
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void dismiss(d)}
              >
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const attributionText: Record<PracticeDraft['attributedBy'], string> = {
  'gm-named': 'named in the line',
  voice: 'voice match',
  model: "co-DM's guess",
};
