import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import {
  CAMPAIGN_CHANGED,
  RESTORE_MAX_BYTES,
  backupLabel,
  count,
  exportFileName,
} from './campaignsModel';

interface BackupInfo {
  name: string;
  events: number;
  portraits: number;
}
interface Restored {
  id: string;
  events: number;
  portraits: number;
}
interface CampaignList {
  active: string;
  main: string;
  campaigns: string[];
}

/**
 * QF.44 (DESIGN §9a "campaigns and backups"): Back up now, Download campaign
 * (the export file, portraits included) and Restore. A restore is imported as
 * a new campaign beside the others and never overwrites one; the GM opens it
 * from here. GM-only: every call carries the GM key.
 */
export function CampaignBackups({
  gmKey,
  campaignName,
  refreshKey,
}: {
  gmKey: string;
  campaignName: string | null;
  /** Changes when a backup may have been added (a session ended, the campaign changed). */
  refreshKey: string;
}) {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [list, setList] = useState<CampaignList | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<Restored | null>(null);
  const [busy, setBusy] = useState(false);

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

  // Bumped after a backup, restore or switch so the lists re-read.
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);
  useEffect(() => {
    let live = true;
    Promise.all([
      call<{ backups: BackupInfo[] }>('GET', '/api/gm/backups'),
      call<CampaignList>('GET', '/api/gm/campaigns'),
    ])
      .then(([b, c]) => {
        if (!live) return;
        setBackups(b.backups);
        setList(c);
      })
      .catch(() => {
        if (live) setBackups(null);
      });
    return () => {
      live = false;
    };
  }, [call, refreshKey, tick]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const backUp = () =>
    run(async () => {
      const r = await call<{ name: string; events: number }>('POST', '/api/gm/backup');
      setStatus(`Backed up ${count(r.events, 'event')} (${backupLabel(r.name)}).`);
      reload();
    });

  const download = () =>
    run(async () => {
      const data = await call<{ events: unknown[]; portraits?: Record<string, string> }>(
        'GET',
        '/api/gm/export',
      );
      const file = exportFileName(campaignName, new Date().toISOString());
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const portraits = Object.keys(data.portraits ?? {}).length;
      setStatus(
        `Downloaded ${file}: ${count(data.events.length, 'event')}, ${count(portraits, 'portrait')}.`,
      );
    });

  const restore = (body: unknown) =>
    run(async () => {
      setRestored(null);
      const r = await call<Restored>('POST', '/api/gm/restore', body);
      setRestored(r);
      reload();
    });

  const restoreFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void run(async () => {
      setRestored(null);
      if (file.size > RESTORE_MAX_BYTES) {
        throw new Error(
          `Nothing was restored: ${file.name} is larger than ${RESTORE_MAX_BYTES / (1024 * 1024)} MB, too big for a campaign file.`,
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error(`Nothing was restored: ${file.name} is not a campaign export file.`);
      }
      const r = await call<Restored>('POST', '/api/gm/restore', { export: parsed });
      setRestored(r);
      reload();
    });
  };

  const open = (id: string) => {
    if (
      !window.confirm(
        `Open campaign “${id}”? Players are sent back to the join screen and pick their character in it.`,
      )
    ) {
      return;
    }
    void run(async () => {
      if (id === list?.main) await call('POST', '/api/gm/campaign', { demo: false });
      else await call('POST', '/api/gm/campaign', { id });
      setRestored(null);
      setStatus(`Opened campaign “${id}”.`);
      // The header's campaign switch re-reads which campaign is open.
      window.dispatchEvent(new Event(CAMPAIGN_CHANGED));
      reload();
    });
  };

  return (
    <section className="window campaign-backups" aria-labelledby="campaign-backups">
      <h2 id="campaign-backups">Campaigns and backups</h2>
      <p className="muted">
        The campaign is saved on every change and backed up at every session end and every quit.
        Restore never overwrites anything: it adds the copy as a new campaign beside this one. A
        downloaded file holds the event log and portraits; backups also keep the co-DM&apos;s notes
        and the transcripts.
      </p>
      <div className="row">
        <button type="button" disabled={busy} onClick={() => void backUp()}>
          Back up now
        </button>
        <button type="button" disabled={busy} onClick={() => void download()}>
          Download campaign
        </button>
      </div>
      {status && (
        <p className="ok" role="status" data-testid="backups-status">
          {status}
        </p>
      )}
      {error && (
        <p className="err" role="alert" data-testid="backups-error">
          {error}
        </p>
      )}
      {restored && (
        <div className="restored" data-testid="restored">
          <p role="status">
            Restored as campaign “{restored.id}”: {count(restored.events, 'event')},{' '}
            {count(restored.portraits, 'portrait')}. Nothing was overwritten.
          </p>
          <button type="button" disabled={busy} onClick={() => open(restored.id)}>
            Open restored campaign
          </button>
        </div>
      )}

      <h3>Restore</h3>
      <label className="file-pick">
        Restore from a downloaded file
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          data-testid="restore-file"
          onChange={restoreFile}
        />
      </label>
      {backups === null ? (
        <p className="muted">Backups unavailable.</p>
      ) : backups.length === 0 ? (
        <p className="muted">No backups of this campaign yet.</p>
      ) : (
        <>
          {list && list.active !== list.main && (
            <p className="muted" data-testid="backups-of">
              These are the backups of “{list.active}”. For your main campaign&apos;s backups, go
              back to it first.
            </p>
          )}
          <ul className="backup-list" aria-label="Backups of this campaign">
            {backups.map((b) => (
              <li key={b.name} data-testid="backup-row">
                <span>
                  {backupLabel(b.name)} · {count(b.events, 'event')}
                  {b.portraits > 0 ? ` · ${count(b.portraits, 'portrait')}` : ''}
                </span>
                <button
                  type="button"
                  disabled={busy || b.events === 0}
                  aria-label={`Restore ${backupLabel(b.name)}`}
                  onClick={() => void restore({ backup: b.name })}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {list && list.campaigns.length > 1 && (
        <>
          <h3>Campaigns on this laptop</h3>
          <ul className="campaign-list" aria-label="Campaigns on this laptop">
            {list.campaigns.map((id) => (
              <li key={id} data-testid="campaign-row">
                <span>
                  {id}
                  {id === list.main ? ' (opens when the app starts)' : ''}
                </span>
                {id === list.active ? (
                  <strong>Open now</strong>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Open ${id}`}
                    onClick={() => open(id)}
                  >
                    Open
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
