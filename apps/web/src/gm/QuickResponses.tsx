import { useCallback, useEffect, useRef, useState } from 'react';
import {
  foldQuick,
  isTypingTarget,
  keyForSlot,
  slotForKey,
  splitLines,
  streamingPreview,
  type QuickAnswerView,
  type QuickEvent,
  type QuickSlot,
} from './quickModel';

/** A transcript line the GM clicked (bumped each click so the same line re-picks). */
export interface PickedLine {
  readonly text: string;
  readonly n: number;
}

interface QuickScene {
  slots: QuickSlot[];
  target: { text: string; speaker: string | null } | null;
  npc: string | null;
  npcs: { id: string; name: string }[];
}

/** How often the row rereads the newest question and the NPC in the scene. */
const SCENE_POLL_MS = 4000;

/**
 * Quick responses (MD.1, DESIGN §11): five fixed buttons, keys 1–5, that
 * answer the newest player question or attempt with one line the GM can say
 * plus 2–3 beats, streamed as the fast model writes it. Clicking a
 * transcript line points the buttons at it; with listening off the GM types
 * the line. Richer re-asks the strong model. GM-only: the answer comes back
 * on the GM's own request and is never sent to players.
 */
export function QuickResponses({
  gmKey,
  picked,
  onSpend,
}: {
  gmKey: string;
  picked: PickedLine | null;
  onSpend: (spend: { calls: number; dollars: number }) => void;
}) {
  const [scene, setScene] = useState<QuickScene | null>(null);
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState('');
  // The clicked line stays the target until the GM types or asks for the newest.
  const [clearedN, setClearedN] = useState<number | null>(null);
  const chosen = picked && picked.n !== clearedN ? picked : null;
  const [npcChoice, setNpcChoice] = useState<string>('auto');
  const [answer, setAnswer] = useState<QuickAnswerView | null>(null);
  const [last, setLast] = useState<{ slot: number; target: string | undefined } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    let live = true;
    const read = async () => {
      const [q, l] = await Promise.all([
        fetch('/api/gm/ai/quick', { headers: { 'x-gm-key': gmKey } }).catch(() => null),
        fetch('/api/gm/listen', { headers: { 'x-gm-key': gmKey } }).catch(() => null),
      ]);
      if (!live) return;
      if (q?.ok) setScene((await q.json()) as QuickScene);
      if (l?.ok) setListening(((await l.json()) as { on?: boolean }).on === true);
    };
    void read();
    const timer = setInterval(() => void read(), SCENE_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [gmKey]);

  // Clicked line, then the typed line (listening off), then the newest question.
  const typedLine = !listening && typed.trim() !== '' ? typed.trim() : null;
  const target = chosen?.text ?? typedLine ?? scene?.target?.text ?? null;
  const targetFrom = chosen ? 'clicked' : typedLine ? 'typed' : 'newest';
  const autoNpc = scene?.npcs.find((n) => n.id === scene.npc)?.name ?? null;

  const press = useCallback(
    async (slot: number, richer = false, again?: string) => {
      const line = again ?? chosen?.text ?? typedLine ?? undefined;
      if (line === undefined && !scene?.target) {
        setNote('Nothing to answer yet: click a transcript line or type one');
        return;
      }
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setNote(null);
      setLast({ slot, target: line });
      try {
        const res = await fetch('/api/gm/ai/quick', {
          method: 'POST',
          headers: { 'x-gm-key': gmKey, 'content-type': 'application/json' },
          body: JSON.stringify({
            slot,
            ...(line !== undefined ? { target: line } : {}),
            ...(npcChoice === 'auto' ? {} : { npc: npcChoice === 'none' ? null : npcChoice }),
            ...(richer ? { richer: true } : {}),
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setNote(data.error ?? 'The co-DM could not answer that');
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { lines, rest } = splitLines(buffer);
          buffer = rest;
          for (const raw of lines) {
            const event = JSON.parse(raw) as QuickEvent;
            if (abort.current !== controller) return;
            setAnswer((v) => foldQuick(v, event));
            if ((event.type === 'done' || event.type === 'error') && event.spend) {
              onSpend(event.spend);
            }
          }
        }
      } catch {
        if (!controller.signal.aborted) setNote('Could not reach the server');
      } finally {
        if (abort.current === controller) abort.current = null;
      }
    },
    [chosen, typedLine, scene, npcChoice, gmKey, onSpend],
  );

  // Keys 1–5 press the buttons, except while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e.target as HTMLElement | null, e)) return;
      const slot = slotForKey(e.key);
      if (slot === null || slot > 5) return;
      e.preventDefault();
      void press(slot);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const slots = scene?.slots ?? [];
  const shown = answer
    ? answer.streaming
      ? streamingPreview(answer.text)
      : { say: answer.say ?? '', beats: answer.beats }
    : null;

  return (
    <div className="quick" data-testid="quick-responses">
      <h3>Quick responses (GM only)</h3>
      <p className="quick-target" data-testid="quick-target">
        {target ? (
          <>
            Answering{' '}
            {targetFrom === 'clicked'
              ? 'the line you picked'
              : targetFrom === 'typed'
                ? 'your line'
                : 'the newest line'}
            : <q>{target}</q>{' '}
            {chosen && (
              <button type="button" onClick={() => setClearedN(picked?.n ?? null)}>
                Use the newest
              </button>
            )}
          </>
        ) : (
          <span className="muted">Nothing to answer yet: click a transcript line or type one.</span>
        )}
      </p>
      {!listening && (
        <label>
          The line to answer
          <input
            value={typed}
            maxLength={1000}
            onChange={(e) => {
              setTyped(e.target.value);
              setClearedN(picked?.n ?? null);
            }}
            placeholder="Can I talk the ferryman down?"
          />
        </label>
      )}
      <label>
        NPC in the scene
        <select value={npcChoice} onChange={(e) => setNpcChoice(e.target.value)}>
          <option value="auto">
            {autoNpc ? `Last named: ${autoNpc}` : 'Last named (none yet)'}
          </option>
          <option value="none">None</option>
          {(scene?.npcs ?? []).map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      <div className="quick-row" role="group" aria-label="Quick responses">
        {slots.map((s, i) => (
          <button
            key={s.id}
            type="button"
            title={s.instruction}
            aria-keyshortcuts={keyForSlot(i + 1)}
            onClick={() => void press(i + 1)}
          >
            <kbd>{keyForSlot(i + 1)}</kbd> {s.label}
          </button>
        ))}
      </div>
      {note && <p role="status">{note}</p>}
      {answer && shown && (
        <div className="quick-answer" data-testid="quick-answer" aria-live="polite">
          <blockquote>“{answer.quote}”</blockquote>
          <p className="muted">
            {answer.slotLabel}
            {answer.npc ? ` · ${answer.npc}` : ''}
            {answer.richer ? ' · richer' : ''}
            {answer.streaming ? ' · writing…' : ''}
          </p>
          {answer.error ? (
            <p role="alert">{answer.error}</p>
          ) : (
            <>
              <p className="quick-say" data-testid="quick-say">
                {shown.say}
              </p>
              {shown.beats.length > 0 && (
                <ul className="quick-beats">
                  {shown.beats.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {!answer.streaming && last && (
            <button
              type="button"
              onClick={() => void press(last.slot, true, last.target ?? answer.quote)}
            >
              Richer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
