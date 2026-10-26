import { useEffect, useRef, useState } from 'react';

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

interface Capture {
  stop: () => void;
}

/**
 * Co-DM listening (MC.5, DESIGN §11): a mic toggle with a clear indicator and
 * the live, GM-only transcript. Audio goes from this window to the GM-only
 * listen route in memory; the laptop transcribes it and keeps only text.
 * While it is on, players' screens say "[The System is listening]".
 */
export function ListenPanel({ gmKey }: { gmKey: string }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const capture = useRef<Capture | null>(null);
  const headers = { 'x-gm-key': gmKey };

  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/gm/listen', { headers: { 'x-gm-key': gmKey } });
        if (!res.ok || !live) return;
        const data = (await res.json()) as { on: boolean; available: boolean; lines: Line[] };
        if (!live) return;
        setAvailable(data.available);
        setLines(data.lines);
        if (!data.on && capture.current === null) setOn(false);
      } catch {
        // Offline for a moment: the next poll tries again.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [gmKey]);
  useEffect(() => () => capture.current?.stop(), []);

  const setListening = (want: boolean) =>
    fetch('/api/gm/listen', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ on: want }),
    });

  const start = async () => {
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
        }).catch(() => undefined);
      });
      setOn(true);
    } catch {
      await setListening(false).catch(() => undefined);
      setMessage('No microphone: allow the mic for this window and try again');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    capture.current?.stop();
    capture.current = null;
    setOn(false);
    await setListening(false).catch(() => undefined);
    setBusy(false);
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
      {available === false && (
        <p className="muted">
          Speech-to-text is not installed on this laptop, so the mic stays off.
        </p>
      )}
      <button
        type="button"
        aria-pressed={on}
        disabled={busy || (available === false && !on)}
        onClick={() => void (on ? stop() : start())}
      >
        {on ? 'Stop listening' : 'Start listening'}
      </button>
      {message && (
        <p role="status" data-testid="listen-message">
          {message}
        </p>
      )}
      <h3>Transcript (GM only)</h3>
      {lines.length === 0 ? (
        <p className="muted">Nothing heard yet.</p>
      ) : (
        <ol className="transcript" data-testid="transcript">
          {lines.map((l, i) => (
            <li key={i}>
              <time dateTime={l.at}>{l.at.slice(11, 19)}</time> {l.speaker ? `${l.speaker}: ` : ''}
              {l.text}
            </li>
          ))}
        </ol>
      )}
    </section>
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
