import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { IncomingContent } from './ContentImport';
import { LOADING_TEXT } from './loadingScreen';
import { SessionNotes } from './SessionNotes';

/** The kinds the server's generate route takes (MC.2, DESIGN §11). */
const KINDS = [
  ['shop', 'Shop'],
  ['npc', 'NPC'],
  ['place', 'Place'],
  ['encounter', 'Encounter'],
  ['item', 'Item'],
  ['questHook', 'Quest hook'],
] as const;
type Kind = (typeof KINDS)[number][0];

/**
 * Co-DM: generate on demand (MC.2). The GM picks a kind and says what the
 * table needs; the strong model writes a content file and it opens in the
 * Import window to approve. The GM can edit the JSON and preview the edit,
 * or regenerate. GM-only: the request goes to /api/gm/ai/generate with the
 * GM key, and nothing reaches players until the GM applies it.
 *
 * MC.4: the GM can show players a pinned System loading screen while it
 * generates, and have it cleared when the generated content is approved.
 */
export function CoDmPanel({
  gmKey,
  onGenerated,
  onLoading,
  onLoadingFailed,
}: {
  gmKey: string;
  onGenerated: (content: Omit<IncomingContent, 'seq'>) => void;
  /** MC.4: send the loading screen (pinned broadcast) as a generation starts. */
  onLoading?: (text: string | null, clearOnApprove: boolean) => void;
  /** MC.4 review: the generation failed or was cancelled, so the loading screen comes down. */
  onLoadingFailed?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState(LOADING_TEXT);
  const [clearOnApprove, setClearOnApprove] = useState(true);
  const [kind, setKind] = useState<Kind>('shop');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [spend, setSpend] = useState<string | null>(null);
  // The generation as it came back, to tell whether the GM has edited it.
  const [original, setOriginal] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Leaving the console stops a generation in flight (and its API call).
  useEffect(() => () => abort.current?.abort(), []);

  const label = KINDS.find(([k]) => k === kind)?.[1] ?? kind;

  // QF.30 (DESIGN §11): without a key the panel says what it needs up front.
  useEffect(() => {
    let cancelled = false;
    void whyNotReady(gmKey).then((blocked) => {
      if (!cancelled && blocked !== null) setMessage(blocked);
    });
    return () => {
      cancelled = true;
    };
  }, [gmKey]);

  const generate = async (e?: FormEvent) => {
    e?.preventDefault();
    if (
      draft !== null &&
      draft !== original &&
      !window.confirm('Generate again? Your edits to the last generation will be lost.')
    ) {
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    // QF.30: a generation that cannot run sends players no loading screen.
    const blocked = await whyNotReady(gmKey);
    if (blocked !== null || controller.signal.aborted) {
      if (abort.current === controller) abort.current = null;
      setBusy(false);
      setMessage(blocked ?? 'Cancelled: nothing was generated');
      return;
    }
    setMessage(`[The System is constructing: ${label}…]`);
    const showing = loading && loadingText.trim() !== '' && onLoading !== undefined;
    // A generation without a screen tells the console too, so approving it
    // does not take down an earlier generation's screen (round 2, Low).
    onLoading?.(showing ? loadingText : null, clearOnApprove);
    try {
      const res = await fetch('/api/gm/ai/generate', {
        method: 'POST',
        headers: { 'x-gm-key': gmKey, 'content-type': 'application/json' },
        body: JSON.stringify({ kind, prompt }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        file?: unknown;
        preview?: PreviewSummary;
        status?: { spend: { dollars: number; calls: number } };
      };
      if (data.status) {
        const s = data.status.spend;
        setSpend(
          `This session: $${s.dollars.toFixed(3)} · ${s.calls} call${s.calls === 1 ? '' : 's'}`,
        );
      }
      if (!res.ok || data.file === undefined) {
        if (showing) onLoadingFailed?.();
        setMessage(data.error ?? 'The co-DM could not generate that');
        return;
      }
      const text = JSON.stringify(data.file, null, 2);
      setDraft(text);
      setOriginal(text);
      onGenerated({ text, name: `co-DM ${label.toLowerCase()}`, generated: true });
      setMessage(readiness(label, data.preview));
    } catch {
      if (showing) onLoadingFailed?.();
      setMessage(
        controller.signal.aborted
          ? 'Cancelled: nothing was generated'
          : 'Could not reach the server',
      );
    } finally {
      if (abort.current === controller) abort.current = null;
      setBusy(false);
    }
  };

  return (
    <section className="window" aria-labelledby="codm-heading">
      <h2 id="codm-heading">Co-DM</h2>
      <form onSubmit={(e) => void generate(e)}>
        <label>
          Generate
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map(([k, name]) => (
              <option key={k} value={k}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          What the table needs
          <textarea
            rows={3}
            maxLength={2000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="An herbalist in the Crown camp, cheap but shady"
          />
        </label>
        {onLoading && (
          <fieldset className="codm-loading">
            <legend>Loading screen</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={loading}
                onChange={(e) => setLoading(e.target.checked)}
              />{' '}
              Show players a loading screen while the co-DM works
            </label>
            {loading && (
              <>
                <label>
                  Loading text
                  <input
                    value={loadingText}
                    maxLength={200}
                    onChange={(e) => setLoadingText(e.target.value)}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={clearOnApprove}
                    onChange={(e) => setClearOnApprove(e.target.checked)}
                  />{' '}
                  Clear it when I approve the content
                </label>
              </>
            )}
          </fieldset>
        )}
        <div className="codm-actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Generating…' : 'Generate'}
          </button>
          {busy && (
            <button type="button" onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          )}
          {draft !== null && !busy && (
            <button type="button" onClick={() => void generate()}>
              Regenerate
            </button>
          )}
        </div>
      </form>
      {message && (
        <p role="status" className="muted" data-testid="codm-message">
          {message}
        </p>
      )}
      {spend && <p data-testid="codm-panel-spend">{spend}</p>}
      {draft !== null && (
        <details>
          <summary>Edit the generated content</summary>
          <label>
            Content (JSON)
            <textarea
              rows={12}
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onGenerated({
                text: draft,
                name: `co-DM ${label.toLowerCase()} (edited)`,
                generated: true,
              })
            }
          >
            Preview my edits
          </button>
        </details>
      )}
      <SessionNotes gmKey={gmKey} />
    </section>
  );
}

/** The parts of the server's import preview the panel reads. */
interface PreviewSummary {
  readonly ok: boolean;
  readonly errors?: readonly unknown[];
  readonly entries?: readonly { readonly error: string | null }[];
}

/** What the panel says once a generation is back: ready only if it can apply. */
export function readiness(label: string, preview: PreviewSummary | undefined): string {
  if (!preview?.ok) return `${label} broke the rules: see the problems in Import content`;
  const entries = preview.entries ?? [];
  const blocked = entries.filter((e) => e.error !== null).length + (preview.errors?.length ?? 0);
  if (entries.length === 0) return `${label} came back empty: try Regenerate`;
  if (blocked > 0) {
    return `${label} ready, but ${blocked} entr${blocked === 1 ? 'y' : 'ies'} cannot apply: check Import content`;
  }
  return `${label} ready: check it in Import content`;
}

/** The message to show instead of generating, or null when the co-DM can run (QF.30). */
const NO_KEY_MESSAGE =
  'No API key is set: the co-DM needs your Anthropic API key. Add it in Co-DM settings.';
async function whyNotReady(gmKey: string): Promise<string | null> {
  try {
    const res = await fetch('/api/gm/ai', { headers: { 'x-gm-key': gmKey } });
    if (res.status === 404) return 'The co-DM is not available on this server';
    if (!res.ok) return 'Could not check the co-DM settings';
    const status = (await res.json()) as { hasKey?: boolean };
    return status.hasKey === true ? null : NO_KEY_MESSAGE;
  } catch {
    return 'Could not reach the server';
  }
}
