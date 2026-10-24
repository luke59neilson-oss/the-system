import { useEffect, useRef, useState } from 'react';

interface JoinInfo {
  url: string;
  qrSvg: string;
  options: { url: string; qrSvg: string }[];
  /** The server computer's OS (M10.1): picks the firewall steps below. */
  platform?: string;
}

const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * Join URL and QR for the players (MS.5, from GM-only `/api/join`). Shows the
 * most likely home-network address big, with every other address selectable.
 * The QR is an image (never inline markup) and never carries the GM key.
 */
export function JoinPanel({ gmKey }: { gmKey: string }) {
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/join', { headers: { 'x-gm-key': gmKey } })
      .then((r) => (r.ok ? (r.json() as Promise<JoinInfo>) : Promise.reject(new Error())))
      .then((body) => {
        if (!cancelled) setInfo(body);
      })
      .catch(() => {
        if (!cancelled) setError('Join address unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [gmKey]);
  const option = info?.options[chosen] ?? (info ? { url: info.url, qrSvg: info.qrSvg } : null);
  return (
    <section className="window join" aria-labelledby="join">
      <h2 id="join">Players join</h2>
      {error && <p className="muted">{error}</p>}
      {!error && !option && <p className="muted">Finding this computer’s address…</p>}
      {option && (
        <div className="join-body">
          <img className="join-qr" src={svgSrc(option.qrSvg)} alt={`QR code for ${option.url}`} />
          <div>
            <p className="join-url" data-testid="join-url">
              {option.url}
            </p>
            <p className="muted">Phones and laptops on this wifi: scan or type the address.</p>
            {info && info.options.length > 1 && (
              <label>
                Other addresses
                <select value={chosen} onChange={(e) => setChosen(Number(e.target.value))}>
                  {info.options.map((o, i) => (
                    <option key={o.url} value={i}>
                      {o.url}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}
      {info && <ConnectHelp platform={info.platform} />}
      <GmLink gmKey={gmKey} />
    </section>
  );
}

/** Firewall steps per OS (M10.1). Plain words; the GM reads them at the table. */
function firewallSteps(platform: string | undefined): { name: string; steps: string[] } {
  if (platform === 'win32') {
    return {
      name: 'Windows Firewall',
      steps: [
        'Set this wifi to Private: Settings → Network & internet → Wi-Fi → your network → Network profile type → Private.',
        'Allow The System through the firewall: open Start, type “Allow an app through Windows Firewall”, press Change settings, and tick The System under Private.',
        'If Windows asked when The System first started and you pressed Cancel, the steps above fix that too.',
      ],
    };
  }
  if (platform === 'darwin') {
    return {
      name: 'the macOS firewall',
      steps: [
        'If macOS asked whether The System may accept incoming connections, choose Allow.',
        'Otherwise open System Settings → Network → Firewall → Options and set The System to allow incoming connections.',
      ],
    };
  }
  return {
    name: 'the firewall',
    steps: [
      'If this computer runs a firewall (for example ufw), allow incoming connections on the port in the address above.',
    ],
  };
}

/**
 * "Players can't connect?" (M10.1): the usual causes, the firewall for this
 * computer's OS first. Folded away until the GM needs it.
 */
export function ConnectHelp({ platform }: { platform: string | undefined }) {
  const firewall = firewallSteps(platform);
  return (
    <details className="connect-help" data-testid="connect-help">
      <summary>Players can’t connect? Check {firewall.name}</summary>
      <ol>
        {firewall.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
        <li>Players must be on the same wifi as this computer, not a guest network.</li>
        <li>Type the address exactly, with http:// and the port, or try another address above.</li>
      </ol>
    </details>
  );
}

/**
 * The GM console's own link for another browser on this computer (MS.A).
 * The desktop app never prints its key, so this is how Luke opens the console
 * in Chrome or Safari next to the app window. Shown only on the GM screen,
 * folded away, with a reminder that it unlocks the console.
 */
export function GmLink({ gmKey }: { gmKey: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const link = `${window.location.origin}/gm#key=${encodeURIComponent(gmKey)}`;
  return (
    <details className="gm-link">
      <summary>Open the GM console in another browser on this computer</summary>
      <p className="muted">
        This link unlocks the GM console. Keep it on this computer; never send it to players.
      </p>
      <div className="gm-link-row">
        <input
          ref={inputRef}
          readOnly
          aria-label="GM link"
          value={link}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          onClick={() => {
            // Missing outside a secure context (a LAN-IP origin): select the text instead.
            if (!('clipboard' in navigator)) return void inputRef.current?.select();
            navigator.clipboard.writeText(link).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </details>
  );
}
