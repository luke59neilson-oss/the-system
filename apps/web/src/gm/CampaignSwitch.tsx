import { useEffect, useState } from 'react';
import { CAMPAIGN_CHANGED } from './campaignsModel';

/**
 * GM menu entry for the demo campaign (ROADMAP MS.4, D53). The demo is a
 * separate campaign on the server; switching drops every connection and the
 * clients rejoin the other campaign, so the two never mix.
 */
export function CampaignSwitch({ gmKey, stateName }: { gmKey: string; stateName: string | null }) {
  const [demo, setDemo] = useState<boolean | null>(null);
  // QF.44: a restored campaign (neither the main one nor the demo) is open.
  const [other, setOther] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // QF.44: Campaigns and backups announces a switch (a restored copy keeps the name).
  const [changed, setChanged] = useState(0);
  useEffect(() => {
    const bump = () => setChanged((n) => n + 1);
    window.addEventListener(CAMPAIGN_CHANGED, bump);
    return () => window.removeEventListener(CAMPAIGN_CHANGED, bump);
  }, []);

  // Re-read after every campaign change (another GM tab may have switched).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/gm/campaign', { headers: { 'x-gm-key': gmKey } })
      .then((r) =>
        r.ok ? (r.json() as Promise<{ id: string; demo: boolean; main?: boolean }>) : null,
      )
      .then((body) => {
        if (!cancelled && body) {
          setDemo(body.demo);
          setOther(!body.demo && body.main === false ? body.id : null);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [gmKey, stateName, changed]);

  const switchTo = async (wantDemo: boolean) => {
    if (
      wantDemo &&
      !window.confirm(
        'Load the demo campaign? Players in your campaign see a “switched campaign” notice until you come back.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/gm/campaign', {
        method: 'POST',
        headers: { 'x-gm-key': gmKey, 'content-type': 'application/json' },
        body: JSON.stringify({ demo: wantDemo }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDemo(((await r.json()) as { demo: boolean }).demo);
      setOther(null);
    } catch {
      setError('Could not switch campaigns');
    } finally {
      setBusy(false);
    }
  };

  if (demo === null) return null;
  return (
    <div className={demo ? 'campaign-switch demo' : 'campaign-switch'}>
      {demo && (
        <strong className="demo-badge" data-testid="demo-badge">
          Demo campaign · nothing here touches your real campaign
        </strong>
      )}
      {other !== null && (
        <strong className="demo-badge" data-testid="restored-badge">
          Restored campaign “{other}”
        </strong>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void switchTo(other !== null ? false : !demo)}
      >
        {demo || other !== null ? 'Back to my campaign' : 'Load demo campaign'}
      </button>
      {error && (
        <span className="err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
