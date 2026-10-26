import { useEffect, useState, type FormEvent } from 'react';
import { shouldPollSpend, spendLine, useLiveSpend } from './spend';

interface CoDmStatus {
  hasKey: boolean;
  canSave: boolean;
  saveBlocked: 'no-desktop' | 'no-encryption' | null;
  models: { fast: string; strong: string };
  spend: { calls: number; inputTokens: number; outputTokens: number; dollars: number };
}

/**
 * Co-DM settings (MC.1, DESIGN §11): the GM's own Anthropic API key (saved
 * encrypted on this laptop; never shown again once saved), the fast and
 * strong models, a connection test and the session's spend. GM-only: every
 * call goes to /api/gm/ai with the GM key, and the key never comes back.
 */
export function CoDmSettings({ gmKey }: { gmKey: string }) {
  const [status, setStatus] = useState<CoDmStatus | null>(null);
  const [key, setKey] = useState('');
  const [fast, setFast] = useState('');
  const [strong, setStrong] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const spend = useLiveSpend(gmKey, shouldPollSpend(status), status?.spend ?? null);

  const call = async (method: string, url: string, body?: unknown): Promise<unknown> => {
    const res = await fetch(url, {
      method,
      headers: {
        'x-gm-key': gmKey,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? 'The co-DM settings could not be changed');
    return data;
  };
  const show = (s: CoDmStatus) => {
    setStatus(s);
    setFast(s.models.fast);
    setStrong(s.models.strong);
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/gm/ai', { headers: { 'x-gm-key': gmKey } })
      .then((r) => (r.ok ? (r.json() as Promise<CoDmStatus>) : Promise.reject(new Error())))
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setFast(s.models.fast);
        setStrong(s.models.strong);
      })
      .catch(() => {
        if (!cancelled) setMessage('Co-DM settings unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [gmKey]);

  const run = async (what: () => Promise<unknown>, done: (r: unknown) => string | null) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(done(await what()));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const saveKey = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () => call('PUT', '/api/gm/ai/key', { key }),
      (r) => {
        show(r as CoDmStatus);
        setKey('');
        return 'Key saved (encrypted on this laptop)';
      },
    );
  };
  const saveModels = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () => call('PUT', '/api/gm/ai/models', { fast, strong }),
      (r) => {
        show(r as CoDmStatus);
        return 'Models saved';
      },
    );
  };

  return (
    <section className="window" aria-labelledby="codm-settings">
      <h2 id="codm-settings">Co-DM settings</h2>
      {!status && <p className="muted">{message ?? 'Loading…'}</p>}
      {status && (
        <>
          <p data-testid="codm-key-state">
            {status.hasKey
              ? 'API key: saved on this laptop'
              : 'No API key yet: the co-DM needs your Anthropic API key (pay-as-you-go). Everything else works without it.'}
          </p>
          {status.canSave ? (
            <form onSubmit={saveKey}>
              <label>
                {status.hasKey ? 'Replace API key' : 'Anthropic API key'}
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="sk-ant-…"
                />
              </label>
              <button type="submit" disabled={busy || key.trim() === ''}>
                Save key
              </button>
              {status.hasKey && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => call('DELETE', '/api/gm/ai/key'),
                      (r) => {
                        show(r as CoDmStatus);
                        return 'Key removed';
                      },
                    )
                  }
                >
                  Remove key
                </button>
              )}
            </form>
          ) : (
            <p className="muted" data-testid="codm-cannot-save">
              {status.saveBlocked === 'no-encryption'
                ? 'This computer offers no secure storage for the key (on Linux, a keyring such as GNOME Keyring or KWallet), so it cannot be saved. Everything else works without it.'
                : 'This copy cannot store a key safely. Open the desktop app on the GM laptop to add one.'}
            </p>
          )}
          <form onSubmit={saveModels}>
            <label>
              Fast model (suggestions, notes, drafts)
              <input value={fast} onChange={(e) => setFast(e.target.value)} />
            </label>
            <label>
              Strong model (generation)
              <input value={strong} onChange={(e) => setStrong(e.target.value)} />
            </label>
            <button type="submit" disabled={busy}>
              Save models
            </button>
          </form>
          <button
            type="button"
            disabled={busy || !status.hasKey}
            onClick={() =>
              void run(
                () => call('POST', '/api/gm/ai/test'),
                (r) => {
                  const t = r as {
                    ok: boolean;
                    model?: string;
                    error?: string;
                    status: CoDmStatus;
                  };
                  show(t.status);
                  return t.ok ? `Connected (${t.model ?? ''})` : (t.error ?? 'The test failed');
                },
              )
            }
          >
            Test connection
          </button>
          <p data-testid="codm-spend">{spendLine(spend ?? status.spend)}</p>
          {message && (
            <p role="status" className="muted">
              {message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
