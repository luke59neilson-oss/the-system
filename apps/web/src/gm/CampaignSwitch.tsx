import { useEffect, useState } from 'react';

/**
 * GM menu entry for the demo campaign (ROADMAP MS.4, D53). The demo is a
 * separate campaign on the server; switching drops every connection and the
 * clients rejoin the other campaign, so the two never mix.
 */
export function CampaignSwitch({ gmKey, stateName }: { gmKey: string; stateName: string | null }) {
  const [demo, setDemo] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-read after every campaign change (another GM tab may have switched).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/gm/campaign', { headers: { 'x-gm-key': gmKey } })
      .then((r) => (r.ok ? (r.json() as Promise<{ demo: boolean }>) : null))
      .then((body) => {
        if (!cancelled && body) setDemo(body.demo);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [gmKey, stateName]);

  const switchTo = async (wantDemo: boolean) => {
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
      <button type="button" disabled={busy} onClick={() => void switchTo(!demo)}>
        {demo ? 'Back to my campaign' : 'Load demo campaign'}
      </button>
      {error && (
        <span className="err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
