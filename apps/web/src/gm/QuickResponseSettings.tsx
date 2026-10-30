import { useEffect, useState } from 'react';
import { keyForSlot, moveSlot, type QuickSlot } from './quickModel';

/**
 * Quick-response settings (MD.1, DESIGN §11): rename the five buttons,
 * rewrite the instruction behind each, and change their order; Reset brings
 * back the defaults. Saved on this laptop, GM-only.
 */
export function QuickResponseSettings({ gmKey }: { gmKey: string }) {
  const [slots, setSlots] = useState<QuickSlot[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/gm/ai/quick', { headers: { 'x-gm-key': gmKey } })
      .then((r) => (r.ok ? (r.json() as Promise<{ slots: QuickSlot[] }>) : null))
      .then((d) => {
        if (live && d) setSlots(d.slots);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [gmKey]);

  const send = async (method: 'PUT' | 'DELETE', done: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/gm/ai/quick/settings', {
        method,
        headers: {
          'x-gm-key': gmKey,
          ...(method === 'PUT' ? { 'content-type': 'application/json' } : {}),
        },
        ...(method === 'PUT' ? { body: JSON.stringify({ slots }) } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { slots?: QuickSlot[]; error?: string };
      if (!res.ok || !data.slots) {
        setMessage(data.error ?? 'Could not save the quick responses');
        return;
      }
      setSlots(data.slots);
      setMessage(done);
    } catch {
      setMessage('Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  if (!slots) return null;
  const edit = (i: number, patch: Partial<QuickSlot>) =>
    setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <form
      className="quick-settings"
      aria-labelledby="quick-settings-heading"
      onSubmit={(e) => {
        e.preventDefault();
        void send('PUT', 'Quick responses saved: the buttons use them now');
      }}
    >
      <h3 id="quick-settings-heading">Quick responses (keys 1–5)</h3>
      <ol>
        {slots.map((s, i) => (
          <li key={s.id} data-testid="quick-setting">
            <label>
              Button {keyForSlot(i + 1)} name
              <input
                value={s.label}
                maxLength={40}
                onChange={(e) => edit(i, { label: e.target.value })}
              />
            </label>
            <label>
              Button {keyForSlot(i + 1)} instruction
              <textarea
                rows={2}
                maxLength={600}
                value={s.instruction}
                onChange={(e) => edit(i, { instruction: e.target.value })}
              />
            </label>
            <button
              type="button"
              disabled={i === 0}
              aria-label={`Move ${s.label} up`}
              onClick={() => setSlots(moveSlot(slots, i, -1))}
            >
              ↑
            </button>{' '}
            <button
              type="button"
              disabled={i === slots.length - 1}
              aria-label={`Move ${s.label} down`}
              onClick={() => setSlots(moveSlot(slots, i, 1))}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <button type="submit" disabled={busy}>
        Save quick responses
      </button>{' '}
      <button
        type="button"
        disabled={busy}
        onClick={() => void send('DELETE', 'Quick responses reset to the defaults')}
      >
        Reset
      </button>
      {message && (
        <p role="status" className="muted">
          {message}
        </p>
      )}
    </form>
  );
}
