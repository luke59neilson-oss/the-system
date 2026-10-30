import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { IncomingContent } from './ContentImport';
import { LOADING_TEXT } from './loadingScreen';
import { PrepareAhead } from './PrepareAhead';
import type { CampaignState } from '@the-system/engine';
import type { LiveClient } from '../live';
import { LoreView } from './LoreView';
import { QuickResponses, type KeptLore, type PickedLine } from './QuickResponses';
import { isTypingTarget, keyForSlot, slotForKey } from './quickModel';
import { SessionNotes } from './SessionNotes';
import { spendLine, useLiveSpend, type Spend } from './spend';

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
  picked = null,
  client,
  state,
}: {
  gmKey: string;
  /** MD.3: Keep saves lore as a GM note; the Lore view lists it. */
  client?: LiveClient;
  state?: CampaignState;
  /** MD.1: the transcript line the GM last clicked, to point the quick responses at. */
  picked?: PickedLine | null;
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
  const [seedSpend, setSeedSpend] = useState<Spend | null>(null);
  const [ready, setReady] = useState(false);
  const spend = useLiveSpend(gmKey, ready, seedSpend);
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
      if (cancelled) return;
      if (blocked !== null) setMessage(blocked);
      setReady(blocked === null);
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
        setSeedSpend({ calls: s.calls, dollars: s.dollars });
        setReady(true);
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
      <QuickResponses
        gmKey={gmKey}
        picked={picked}
        onSpend={(s) => {
          setSeedSpend(s);
          setReady(true);
        }}
        {...(client
          ? {
              onKeep: async (lore: KeptLore) => {
                const r = await client.command({
                  type: 'note.create',
                  characterId: null,
                  kind: 'gm',
                  title: lore.title,
                  body: lore.body,
                  tags: lore.tags,
                });
                return r.ok ? null : r.error;
              },
            }
          : {})}
      />
      {client && state && <LoreView client={client} state={state} />}
      <Suggestions
        gmKey={gmKey}
        onUse={(chip) => {
          setKind(chip.kind);
          setPrompt(chip.request);
          setMessage(`Ready to generate: ${chip.title}. Press Generate.`);
        }}
      />
      <PrepareAhead
        gmKey={gmKey}
        onReview={(text, name) => onGenerated({ text, name, generated: true })}
      />
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
      {spend && <p data-testid="codm-panel-spend">{spendLine(spend)}</p>}
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

/** A co-DM suggestion chip (MC.8, D244); GM-only. */
export interface Chip {
  readonly id: string;
  readonly type: 'generate' | 'complication' | 'callback';
  readonly kind: Kind;
  readonly title: string;
  readonly request: string;
  readonly quote: string;
}

const CHIP_LABEL: Record<Chip['type'], string> = {
  generate: 'Generate',
  complication: 'Complication',
  callback: 'Callback',
};
/**
 * How often the panel asks; the server decides whether a call is due (new
 * talk and the interval, or 30 s after a new player question: MD.2, D258).
 */
const SUGGEST_TICK_MS = 5_000;
const INTERVALS = [60, 90, 120, 300] as const;
/** The co-DM's row is slots 6–10 of the quick-response keys (MD.2). */
const FIRST_PICK = 6;

interface Row {
  readonly slots: (Chip | null)[];
  readonly more: Chip[];
}
const EMPTY_ROW: Row = { slots: [null, null, null, null, null], more: [] };
const rowOf = (data: { slots?: (Chip | null)[]; more?: Chip[] }): Row | null =>
  Array.isArray(data.slots) ? { slots: data.slots, more: data.more ?? [] } : null;

/**
 * MC.8 + MD.2 (DESIGN §11 "Suggestions", "Slots 6–10"): the fast model reads
 * the recent transcript and offers chips, each with the quote behind it. They
 * sit in a fixed row of five (keys 6–9 and 0): a new chip fills only an
 * empty or dismissed slot, so a chip never moves; extras wait under "More".
 * Use (or the key) fills in the generate request above; Dismiss removes the
 * chip for good. The laptop paces the calls and counts them in the spend
 * counter.
 */
function Suggestions({ gmKey, onUse }: { gmKey: string; onUse: (chip: Chip) => void }) {
  const [row, setRow] = useState<Row>(EMPTY_ROW);
  const [intervalS, setIntervalS] = useState<number>(90);
  const [note, setNote] = useState<string | null>(null);
  const interval = useRef(intervalS);
  useEffect(() => {
    interval.current = intervalS;
  }, [intervalS]);

  const ask = useCallback(
    async (manual: boolean) => {
      const res = await fetch('/api/gm/ai/suggestions', {
        method: 'POST',
        headers: { 'x-gm-key': gmKey, 'content-type': 'application/json' },
        body: JSON.stringify({ manual, intervalS: interval.current }),
      }).catch(() => null);
      if (!res) return;
      const data = (await res.json().catch(() => ({}))) as {
        slots?: (Chip | null)[];
        more?: Chip[];
        called?: boolean;
        error?: string;
      };
      const next = rowOf(data);
      if (next) setRow(next);
      if (manual) {
        setNote(
          !res.ok
            ? (data.error ?? 'No suggestions right now')
            : data.called
              ? null
              : 'Nothing new heard yet, or asked too recently',
        );
      }
    },
    [gmKey],
  );

  useEffect(() => {
    let live = true;
    void fetch('/api/gm/ai/suggestions', { headers: { 'x-gm-key': gmKey } })
      .then(async (res) => {
        if (!res.ok || !live) return;
        const next = rowOf((await res.json()) as { slots?: (Chip | null)[]; more?: Chip[] });
        if (live && next) setRow(next);
      })
      .catch(() => undefined);
    const timer = setInterval(() => void ask(false), SUGGEST_TICK_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [gmKey, ask]);

  const dismiss = async (id: string) => {
    const res = await fetch(`/api/gm/ai/suggestions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-gm-key': gmKey },
    }).catch(() => null);
    if (!res?.ok) return;
    const next = rowOf((await res.json()) as { slots?: (Chip | null)[]; more?: Chip[] });
    if (next) setRow(next);
  };

  const pick = useCallback(
    (chip: Chip) => {
      setNote(null);
      onUse(chip);
    },
    [onUse],
  );

  // Keys 6–9 and 0 use the chip in that slot, except while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e.target as HTMLElement | null, e)) return;
      const slot = slotForKey(e.key);
      if (slot === null || slot < FIRST_PICK) return;
      e.preventDefault();
      const chip = row.slots[slot - FIRST_PICK] ?? null;
      if (chip) pick(chip);
      else setNote(`Slot ${keyForSlot(slot)} is empty: the co-DM fills it from the table talk`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [row, pick]);

  const chipBody = (c: Chip) => (
    <>
      <blockquote>“{c.quote}”</blockquote>
      <button
        type="button"
        className="pick-dismiss"
        aria-label={`Dismiss ${c.title}`}
        title="Dismiss for good"
        onClick={() => void dismiss(c.id)}
      >
        ✕
      </button>
    </>
  );

  return (
    <div className="suggestions" data-testid="suggestions">
      <h3>Co-DM picks (GM only)</h3>
      <p>
        <label>
          Every{' '}
          <select value={intervalS} onChange={(e) => setIntervalS(Number(e.target.value))}>
            {INTERVALS.map((s) => (
              <option key={s} value={s}>
                {s < 120 ? `${s} s` : `${s / 60} min`}
              </option>
            ))}
          </select>
        </label>{' '}
        <button type="button" onClick={() => void ask(true)}>
          Suggest now
        </button>
      </p>
      {note && <p role="status">{note}</p>}
      <ol className="chips pick-row" aria-label="Co-DM picks">
        {row.slots.map((c, i) => {
          const key = keyForSlot(FIRST_PICK + i);
          return c ? (
            <li key={`slot-${i}`} data-testid="chip" data-slot={key}>
              <button type="button" aria-keyshortcuts={key} onClick={() => pick(c)}>
                <kbd>{key}</kbd> {CHIP_LABEL[c.type]}: {c.title}
              </button>
              {chipBody(c)}
            </li>
          ) : (
            <li key={`slot-${i}`} className="pick-empty" data-testid="pick-empty" data-slot={key}>
              <kbd>{key}</kbd> <span className="muted">empty</span>
            </li>
          );
        })}
      </ol>
      {row.slots.every((c) => c === null) && (
        <p className="muted">No suggestions yet: they come from what the table says.</p>
      )}
      {row.more.length > 0 && (
        <details className="pick-more" data-testid="pick-more">
          <summary>More ({row.more.length})</summary>
          <ul className="chips">
            {row.more.map((c) => (
              <li key={c.id} data-testid="chip">
                <button type="button" onClick={() => pick(c)}>
                  {CHIP_LABEL[c.type]}: {c.title}
                </button>
                {chipBody(c)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
