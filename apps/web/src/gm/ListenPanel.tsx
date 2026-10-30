import { useEffect, useRef, useState } from 'react';
import {
  ENROL_SECONDS,
  READ_AFTER_STOP_MS,
  firstReadDue,
  joinBlocks,
  listenPollNeeded,
  voiceRows,
  type ModelStatus,
  type VoiceEnrolment,
} from './listenModel';

/** MC.5: the server's VAD and recognizer take mono 16 kHz float PCM. */
const RATE = 16_000;
/** Audio is sent about once a second (the server caps a request at 2 s). */
const SEND_SAMPLES = RATE;
const POLL_MS = 2000;

interface Line {
  at: string;
  text: string;
  speaker?: string;
}

const megabytes = (bytes: number) => Math.max(1, Math.round(bytes / 1_000_000));

interface Capture {
  stop: () => void;
}

/**
 * Co-DM listening (MC.5, DESIGN §11): a mic toggle with a clear indicator and
 * the live, GM-only transcript. Audio goes from this window to the GM-only
 * listen route in memory; the laptop transcribes it and keeps only text.
 * While it is on, players' screens say "[The System is listening]".
 */
export function ListenPanel({
  gmKey,
  characters = [],
  onPickLine,
}: {
  gmKey: string;
  /** MD.1: clicking a line points the quick responses at it. */
  onPickLine?: (text: string) => void;
  /** MC.6: the party, for voice enrolment. */
  characters?: readonly { id: string; name: string }[];
}) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // MC.6: a voice sample is being recorded, so the mic is busy (D241).
  const [enrolling, setEnrolling] = useState(false);
  const capture = useRef<Capture | null>(null);
  const starting = useRef(false);
  // Bumped by every Start, so a poll read before it never stops the new mic.
  const starts = useRef(0);
  const headers = { 'x-gm-key': gmKey };
  // QF.31 (D239): the interval ticks always, but asks the laptop only while
  // `listenPollNeeded` says so; `capturing` is read from the ref at the tick.
  const pollState = useRef({ on: false, model: null as ModelStatus | null, loaded: false });
  useEffect(() => {
    pollState.current = { on, model, loaded: available !== null };
  }, [available, on, model]);
  // The current poll, for the one read after Stop (null once unmounted).
  const pollNow = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let live = true;
    let misses = 0;
    let tick = 0;
    const poll = async () => {
      const startsAtRead = starts.current;
      try {
        const res = await fetch('/api/gm/listen', { headers: { 'x-gm-key': gmKey } });
        if (!res.ok) misses += 1;
        if (!res.ok || !live) return;
        const data = (await res.json()) as {
          on: boolean;
          available: boolean;
          model: ModelStatus | null;
          lines: Line[];
        };
        if (!live) return;
        if (starts.current !== startsAtRead || starting.current) return;
        setAvailable(data.available);
        setModel(data.model);
        setLines(data.lines);
        // The server is the truth: it stopped (campaign switched, restart),
        // so stop sending; it still listens with no mic here (a reload), so
        // turn it off rather than leave players' mark up (MC.5 review).
        if (!data.on && capture.current !== null) {
          capture.current.stop();
          capture.current = null;
          setMessage('Listening stopped on the laptop; press Start listening again');
        }
        if (!data.on) setOn(false);
        if (data.on && capture.current === null && !starting.current) {
          void fetch('/api/gm/listen', {
            method: 'POST',
            headers: { 'x-gm-key': gmKey, 'content-type': 'application/json' },
            body: JSON.stringify({ on: false }),
          }).catch(() => undefined);
        }
      } catch {
        // Offline for a moment: the next poll tries again.
        misses += 1;
      }
    };
    pollNow.current = poll;
    void poll();
    const timer = setInterval(() => {
      tick += 1;
      const state = { ...pollState.current, capturing: capture.current !== null };
      if (!listenPollNeeded(state)) return;
      if (!state.loaded && !firstReadDue(misses, tick)) return;
      void poll();
    }, POLL_MS);
    return () => {
      live = false;
      pollNow.current = null;
      clearInterval(timer);
    };
  }, [gmKey]);
  useEffect(
    () => () => {
      if (!capture.current) return;
      capture.current.stop();
      capture.current = null;
      // Leaving the panel turns listening off, so players' mark goes too.
      void fetch('/api/gm/listen', {
        method: 'POST',
        headers: { 'x-gm-key': gmKey, 'content-type': 'application/json' },
        body: JSON.stringify({ on: false }),
        keepalive: true,
      }).catch(() => undefined);
    },
    [gmKey],
  );

  const setListening = (want: boolean) =>
    fetch('/api/gm/listen', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ on: want }),
    });

  const start = async () => {
    starting.current = true;
    starts.current += 1;
    setBusy(true);
    setMessage(null);
    try {
      const res = await setListening(true);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(data.error ?? 'Could not start listening');
        return;
      }
      capture.current = await startCapture((samples) => {
        void fetch('/api/gm/listen/audio', {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/octet-stream' },
          body: samples.buffer as ArrayBuffer,
        })
          .then((res) => {
            // 409: the laptop is no longer listening; the next poll stops the mic.
            if (res.status === 409) setMessage('The laptop stopped listening');
          })
          .catch(() => undefined);
      });
      setOn(true);
    } catch {
      await setListening(false).catch(() => undefined);
      setMessage('No microphone: allow the mic for this window and try again');
    } finally {
      starting.current = false;
      setBusy(false);
    }
  };

  const download = async () => {
    setMessage(null);
    const res = await fetch('/api/gm/listen/model', { method: 'POST', headers }).catch(() => null);
    if (!res?.ok) {
      setMessage('Could not start the download');
      return;
    }
    const data = (await res.json()) as { model: ModelStatus };
    setModel(data.model);
  };

  const stop = async () => {
    setBusy(true);
    capture.current?.stop();
    capture.current = null;
    setOn(false);
    await setListening(false).catch(() => undefined);
    setBusy(false);
    // QF.31: polling ends with the mic, so read once more after the laptop
    // has transcribed the last thing said before Stop.
    setTimeout(() => void pollNow.current?.(), READ_AFTER_STOP_MS);
  };

  return (
    <section className="window" aria-labelledby="listen-heading">
      <h2 id="listen-heading">Listening</h2>
      <p
        className={on ? 'listen-indicator listen-on' : 'listen-indicator'}
        data-testid="listen-indicator"
      >
        {on ? '● Mic on: the System is listening' : 'Mic off'}
      </p>
      {available === false && model === null && (
        <p className="muted">
          Speech-to-text is not installed on this laptop, so the mic stays off.
        </p>
      )}
      {available === false && model !== null && (
        <SpeechModelRow model={model} onDownload={() => void download()} />
      )}
      <button
        type="button"
        aria-pressed={on}
        disabled={busy || (enrolling && !on) || (available === false && !on)}
        title={enrolling && !on ? 'Wait for the voice sample to finish' : undefined}
        onClick={() => void (on ? stop() : start())}
      >
        {on ? 'Stop listening' : 'Start listening'}
      </button>
      {message && (
        <p role="status" data-testid="listen-message">
          {message}
        </p>
      )}
      <Voices
        gmKey={gmKey}
        characters={characters}
        listening={on}
        speechReady={available === true}
        onRecording={setEnrolling}
      />
      <h3>Transcript (GM only)</h3>
      {lines.length === 0 ? (
        <p className="muted">Nothing heard yet.</p>
      ) : (
        <ol className="transcript" data-testid="transcript">
          {lines.map((l, i) => (
            <li key={i}>
              <time dateTime={l.at}>
                {new Date(l.at).toLocaleTimeString([], { hour12: false })}
              </time>{' '}
              {onPickLine ? (
                <button
                  type="button"
                  className="line-pick"
                  title="Point the quick responses at this line"
                  onClick={() => onPickLine(l.text)}
                >
                  {l.speaker ? `${l.speaker}: ` : ''}
                  {l.text}
                </button>
              ) : (
                <>
                  {l.speaker ? `${l.speaker}: ` : ''}
                  {l.text}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

type SpeakerModel =
  { state: 'missing' | 'downloading' | 'loading' | 'ready' } | { state: 'failed'; error: string };

/**
 * MC.6 (DESIGN §11 "Who said what"): each player records a short voice
 * sample on this laptop's mic; transcript lines then carry their name when
 * the voice match is confident. Only a voice embedding is kept, never audio.
 */
function Voices({
  gmKey,
  characters,
  listening,
  speechReady,
  onRecording,
}: {
  gmKey: string;
  characters: readonly { id: string; name: string }[];
  listening: boolean;
  speechReady: boolean;
  onRecording: (recording: boolean) => void;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [model, setModel] = useState<SpeakerModel | null>(null);
  const [enrolments, setEnrolments] = useState<VoiceEnrolment[]>([]);
  const [recording, setRecording] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  // The laptop could not read the saved voices (a damaged file; D241).
  const [failed, setFailed] = useState<string | null>(null);
  const headers = { 'x-gm-key': gmKey };
  useEffect(() => onRecording(recording !== null), [recording, onRecording]);

  useEffect(() => {
    let live = true;
    void fetch('/api/gm/listen/speakers', { headers: { 'x-gm-key': gmKey } })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 500) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (live) setFailed(data.error ?? 'Could not read the saved voice samples');
          return;
        }
        if (!res.ok) return;
        setFailed(null);
        const data = (await res.json()) as {
          available: boolean;
          model: SpeakerModel | null;
          enrolments: VoiceEnrolment[];
        };
        if (!live) return;
        setAvailable(data.available);
        setModel(data.model);
        setEnrolments(data.enrolments);
        // The voice model loads a moment after the speech model: look again.
        if (
          !data.available &&
          (data.model?.state === 'downloading' || data.model?.state === 'loading')
        ) {
          setTimeout(() => live && setReloads((n) => n + 1), 2000);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [gmKey, speechReady, reloads]);

  const enrol = async (characterId: string, name: string) => {
    setMessage(null);
    setRecording(characterId);
    const blocks: Float32Array[] = [];
    let capture: Capture | null = null;
    try {
      capture = await startCapture((b) => blocks.push(b));
      await new Promise((r) => setTimeout(r, ENROL_SECONDS * 1000 + 600));
    } catch {
      setMessage('No microphone: allow the mic for this window and try again');
      setRecording(null);
      return;
    } finally {
      capture?.stop();
    }
    const sample = joinBlocks(blocks, ENROL_SECONDS * RATE);
    const res = await fetch(`/api/gm/listen/speakers/${encodeURIComponent(characterId)}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/octet-stream' },
      body: sample.slice().buffer,
    }).catch(() => null);
    setRecording(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      setMessage(data?.error ?? 'Could not save the voice sample');
      return;
    }
    setMessage(`Voice sample saved for ${name}`);
    setReloads((n) => n + 1);
  };

  const remove = async (characterId: string, name: string) => {
    setMessage(null);
    const res = await fetch(`/api/gm/listen/speakers/${encodeURIComponent(characterId)}`, {
      method: 'DELETE',
      headers,
    }).catch(() => null);
    setMessage(res?.ok ? `Voice sample deleted for ${name}` : 'Could not delete the voice sample');
    setReloads((n) => n + 1);
  };

  const download = async () => {
    setMessage(null);
    const res = await fetch('/api/gm/listen/model', { method: 'POST', headers }).catch(() => null);
    if (!res?.ok) setMessage('Could not start the download');
    setReloads((n) => n + 1);
  };

  if (failed !== null) {
    return (
      <div className="voices" data-testid="voices">
        <h3>Voices (GM only)</h3>
        <p role="alert">{failed}</p>
      </div>
    );
  }
  if (available === null) return null;
  const rows = voiceRows(characters, enrolments);
  return (
    <div className="voices" data-testid="voices">
      <h3>Voices (GM only)</h3>
      {!available ? (
        <>
          <p className="muted">
            {model === null
              ? 'Speaker labels are not installed on this laptop.'
              : model.state === 'downloading' || model.state === 'loading'
                ? 'Getting the voice model ready…'
                : model.state === 'failed'
                  ? `The voice model failed: ${model.error}`
                  : 'Speaker labels need a voice model (29 MB) on this laptop.'}
          </p>
          {model !== null &&
            speechReady &&
            (model.state === 'missing' || model.state === 'failed') && (
              <button type="button" onClick={() => void download()}>
                {model.state === 'failed' ? 'Try again' : 'Download voice model'}
              </button>
            )}
        </>
      ) : (
        <>
          <p className="muted">
            Each player reads aloud for {ENROL_SECONDS} seconds; their lines get a name when the
            voice match is confident. Only a voice print is kept, never the recording.
          </p>
          {rows.length === 0 ? (
            <p className="muted">No characters yet.</p>
          ) : (
            <ul className="voice-list">
              {rows.map((r) => (
                <li key={r.characterId}>
                  <span>{r.name}</span>{' '}
                  <span className="muted" data-testid={`voice-${r.characterId}`}>
                    {recording === r.characterId
                      ? `● Recording: ${r.name}, speak now…`
                      : r.enrolledAt
                        ? 'Voice enrolled'
                        : 'No voice sample'}
                  </span>{' '}
                  <button
                    type="button"
                    disabled={recording !== null || listening}
                    title={listening ? 'Stop listening to record a voice sample' : undefined}
                    onClick={() => void enrol(r.characterId, r.name)}
                  >
                    {r.enrolledAt ? `Re-record ${r.name}` : `Enrol ${r.name}`}
                  </button>
                  {r.enrolledAt && (
                    <button
                      type="button"
                      disabled={recording !== null}
                      onClick={() => void remove(r.characterId, r.name)}
                    >
                      {`Delete ${r.name}'s voice`}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {message && (
        <p role="status" data-testid="voices-message">
          {message}
        </p>
      )}
    </div>
  );
}

/** Opens the mic and hands on ~1 s blocks of mono 16 kHz float samples. */
async function startCapture(send: (samples: Float32Array) => void): Promise<Capture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const ctx = new AudioContext({ sampleRate: RATE });
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is enough for 16 kHz mono and needs no worklet file.
  const node = ctx.createScriptProcessor(4096, 1, 1);
  let block = new Float32Array(SEND_SAMPLES);
  let filled = 0;
  node.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    let at = 0;
    while (at < input.length) {
      const n = Math.min(input.length - at, SEND_SAMPLES - filled);
      block.set(input.subarray(at, at + n), filled);
      filled += n;
      at += n;
      if (filled === SEND_SAMPLES) {
        send(block);
        block = new Float32Array(SEND_SAMPLES);
        filled = 0;
      }
    }
  };
  source.connect(node);
  node.connect(ctx.destination);
  return {
    stop: () => {
      node.disconnect();
      source.disconnect();
      for (const t of stream.getTracks()) t.stop();
      void ctx.close();
    },
  };
}

/** The one-time speech model download (MC.5, D236): offer, progress, failure. */
function SpeechModelRow({ model, onDownload }: { model: ModelStatus; onDownload: () => void }) {
  if (model.state === 'downloading') {
    const pct = Math.floor((model.received / Math.max(model.bytes, 1)) * 100);
    return (
      <p data-testid="speech-model">
        Downloading the speech model… {megabytes(model.received)} of {megabytes(model.bytes)} MB (
        {pct}%) <progress max={model.bytes} value={model.received} aria-label="Download" />
      </p>
    );
  }
  if (model.state === 'loading' || model.state === 'ready') {
    return <p data-testid="speech-model">Loading the speech model…</p>;
  }
  return (
    <div data-testid="speech-model">
      <p className="muted">
        Listening needs a speech model on this laptop (English, downloaded once into your user
        folder; speech is transcribed here and never leaves the laptop).
      </p>
      {model.state === 'failed' && (
        <p role="alert">
          {model.loadFailed ? 'The speech engine could not start' : 'The download failed'}:{' '}
          {model.error}
        </p>
      )}
      <button type="button" onClick={onDownload}>
        {model.state !== 'failed'
          ? `Download speech model (about ${megabytes(model.bytes)} MB)`
          : model.loadFailed
            ? 'Try loading it again'
            : `Try the download again (about ${megabytes(model.bytes)} MB)`}
      </button>
    </div>
  );
}
