import { useEffect, useState } from 'react';

interface JoinInfo {
  url: string;
  qrSvg: string;
  options: { url: string; qrSvg: string }[];
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
    </section>
  );
}
