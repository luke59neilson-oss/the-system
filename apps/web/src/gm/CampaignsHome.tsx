import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  CAMPAIGN_CHANGED,
  RESTORE_MAX_BYTES,
  backupLabel,
  charactersLabel,
  count,
  deleteConfirmed,
  homeName,
  lastOpenedLabel,
  parseHomeRows,
  type HomeRow,
} from './campaignsModel';

/** What the console does once a campaign opened from the home is connected. */
export interface NewCampaign {
  name: string;
  /** Start with the default classes, Human race and their skills (M4.2). */
  defaults: boolean;
}

interface BackupInfo {
  name: string;
  events: number;
}

/**
 * ML.1 (DESIGN §9a "Campaigns home"): the GM app starts here, with nothing
 * open: every campaign (name, last opened, characters) with Open and Delete,
 * New campaign, Restore from a backup or a downloaded file, and the Deleted
 * list (Delete moves a campaign there; its files are kept and Restore puts it
 * back). GM-only: every call carries the GM key.
 */
export function CampaignsHome({
  gmKey,
  onOpened,
}: {
  gmKey: string;
  /** A campaign is open; `created` when it was made here and still needs its name. */
  onOpened: (created: NewCampaign | null) => void;
}) {
  const [rows, setRows] = useState<HomeRow[] | null>(null);
  const [deleted, setDeleted] = useState<{ id: string; name?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [defaults, setDefaults] = useState(true);
  const [deleting, setDeleting] = useState<HomeRow | null>(null);
  const [typed, setTyped] = useState('');
  const [backupsOf, setBackupsOf] = useState<{ id: string; list: BackupInfo[] | null } | null>(
    null,
  );
  const typedRef = useRef<HTMLInputElement>(null);

  const call = useCallback(
    async <T,>(method: string, url: string, body?: unknown): Promise<T> => {
      const res = await fetch(url, {
        method,
        headers: {
          'x-gm-key': gmKey,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `The server answered ${res.status}`);
      return data as T;
    },
    [gmKey],
  );

  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);
  useEffect(() => {
    let live = true;
    Promise.all([
      call<unknown>('GET', '/api/gm/campaigns'),
      call<{ deleted: { id: string; name?: string }[] }>('GET', '/api/gm/campaigns/deleted'),
    ])
      .then(([home, gone]) => {
        if (!live) return;
        setRows(parseHomeRows(home));
        setDeleted(gone.deleted);
      })
      .catch(() => {
        if (live) setError('Could not read the campaigns. Is the app still running?');
      });
    return () => {
      live = false;
    };
  }, [call, tick]);

  useEffect(() => {
    if (deleting) typedRef.current?.focus();
  }, [deleting]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const opened = (created: NewCampaign | null) => {
    window.dispatchEvent(new Event(CAMPAIGN_CHANGED));
    onOpened(created);
  };
  const open = (id: string) =>
    act(async () => {
      await call('POST', '/api/gm/campaign', { id });
      opened(null);
    });
  const create = (e: FormEvent) => {
    e.preventDefault();
    const wanted = name.trim();
    void act(async () => {
      await call('POST', '/api/gm/campaigns', { name: wanted });
      opened({ name: wanted, defaults });
    });
  };
  const confirmDelete = (e: FormEvent) => {
    e.preventDefault();
    const row = deleting;
    if (!row || !deleteConfirmed(typed, row)) return;
    void act(async () => {
      await call('POST', `/api/gm/campaigns/${encodeURIComponent(row.id)}/delete`);
      setDeleting(null);
      setTyped('');
      setStatus(`“${homeName(row)}” moved to Deleted campaigns. Its files are kept.`);
      reload();
    });
  };
  const undelete = (d: { id: string; name?: string }) =>
    act(async () => {
      await call('POST', `/api/gm/campaigns/${encodeURIComponent(d.id)}/undelete`);
      setStatus(`“${d.name ?? d.id}” is back on the list.`);
      reload();
    });
  const showBackups = (id: string) => {
    if (backupsOf?.id === id) return setBackupsOf(null);
    setBackupsOf({ id, list: null });
    call<{ backups: BackupInfo[] }>('GET', `/api/gm/backups?campaign=${encodeURIComponent(id)}`)
      .then((b) => setBackupsOf((cur) => (cur?.id === id ? { id, list: b.backups } : cur)))
      .catch(() => setError('Could not read that campaign’s backups.'));
  };
  const restored = (r: { id: string; events: number }) => {
    setStatus(
      `Restored as campaign “${r.id}” (${count(r.events, 'event')}). Nothing was overwritten.`,
    );
    reload();
  };
  const restoreBackup = (from: string, backup: string) =>
    act(async () => {
      restored(await call('POST', '/api/gm/restore', { backup, from }));
    });
  const restoreFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void act(async () => {
      if (file.size > RESTORE_MAX_BYTES) {
        throw new Error(`Nothing was restored: ${file.name} is too big for a campaign file.`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error(`Nothing was restored: ${file.name} is not a campaign export file.`);
      }
      restored(await call('POST', '/api/gm/restore', { export: parsed }));
    });
  };

  return (
    <section className="window campaigns-home" aria-labelledby="campaigns-home">
      <h2 id="campaigns-home">Campaigns</h2>
      <p className="muted">Open a campaign to run it. Players’ phones wait until one is open.</p>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="ok" role="status">
          {status}
        </p>
      )}
      {rows === null && !error && <p className="muted">Reading your campaigns…</p>}
      {rows?.length === 0 && <p className="muted">No campaigns yet. Start one below.</p>}
      {rows && rows.length > 0 && (
        <ul className="home-list" data-testid="campaign-rows">
          {rows.map((row) => (
            <li key={row.id} data-testid={`campaign-${row.id}`}>
              <div className="home-row">
                <span className="home-name">
                  <strong>{homeName(row)}</strong>
                  <span className="small muted">{lastOpenedLabel(row.lastOpened)}</span>
                  <span className="small">{charactersLabel(row.characters)}</span>
                </span>
                <span className="home-actions">
                  <button type="button" disabled={busy} onClick={() => void open(row.id)}>
                    Open
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    aria-expanded={backupsOf?.id === row.id}
                    onClick={() => showBackups(row.id)}
                  >
                    Backups
                  </button>
                  <button
                    type="button"
                    className="secondary danger"
                    disabled={busy}
                    onClick={() => {
                      setDeleting(row);
                      setTyped('');
                    }}
                  >
                    Delete
                  </button>
                </span>
              </div>
              {deleting?.id === row.id && (
                <form className="home-delete" onSubmit={confirmDelete}>
                  <label>
                    Type “{homeName(row)}” to move it to Deleted campaigns (its files are kept; you
                    can restore it)
                    <input
                      ref={typedRef}
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      data-testid="delete-confirm"
                    />
                  </label>
                  <button type="submit" disabled={busy || !deleteConfirmed(typed, row)}>
                    Delete campaign
                  </button>
                  <button type="button" className="secondary" onClick={() => setDeleting(null)}>
                    Cancel
                  </button>
                </form>
              )}
              {backupsOf?.id === row.id && (
                <div className="home-backups">
                  {backupsOf.list === null && <p className="muted">Reading backups…</p>}
                  {backupsOf.list?.length === 0 && <p className="muted">No backups yet.</p>}
                  {backupsOf.list && backupsOf.list.length > 0 && (
                    <ul>
                      {backupsOf.list.map((b) => (
                        <li key={b.name}>
                          <span>
                            {backupLabel(b.name)} · {count(b.events, 'event')}
                          </span>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => void restoreBackup(row.id, b.name)}
                          >
                            Restore as a new campaign
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form className="home-new" onSubmit={create} aria-labelledby="home-new">
        <h3 id="home-new">New campaign</h3>
        <label>
          Campaign name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={defaults}
            onChange={(e) => setDefaults(e.target.checked)}
          />
          Start with the default classes, Human race and their skills
        </label>
        <button type="submit" disabled={busy || name.trim() === ''}>
          Create campaign
        </button>
      </form>

      <div className="home-restore">
        <h3>Restore</h3>
        <label className="file-button">
          Restore from a downloaded file…
          <input
            type="file"
            accept=".json,application/json"
            onChange={restoreFile}
            disabled={busy}
            data-testid="home-restore-file"
          />
        </label>
        <p className="small muted">
          A backup is restored from its campaign’s Backups. Either way it becomes a new campaign
          beside the others.
        </p>
      </div>

      {deleted.length > 0 && (
        <div className="home-deleted" data-testid="deleted-campaigns">
          <h3>Deleted campaigns</h3>
          <ul>
            {deleted.map((d) => (
              <li key={d.id}>
                <span>{d.name ?? d.id}</span>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void undelete(d)}
                  data-testid={`undelete-${d.id}`}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
