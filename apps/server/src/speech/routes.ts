// MC.5 (DESIGN §11 "Listening"): the GM-only listening routes. Every path is
// under /api/gm/, which the server's onRequest hook keeps behind the GM key.
// The GM window sends mono 16 kHz float PCM (little-endian Float32) while the
// mic is on; it is chunked and transcribed in memory and only text is kept,
// in `<campaign dir>/transcripts/session-<NN>.jsonl`.
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CampaignStore } from '../store';
import type { LiveHub } from '../hub';
import type { SpeechToText } from './stt';
import { Listener, type TranscriptLine } from './transcript';
import { DEFAULT_VAD } from './vad';

/** At most 2 s of 16 kHz float audio per request. */
export const AUDIO_BODY_LIMIT = DEFAULT_VAD.sampleRate * 4 * 2;

export interface ListenRouteOptions {
  readonly active: () => { store: CampaignStore; hub: LiveHub } | null;
  /** The recognizer; null when speech-to-text is not installed (the mic stays off). */
  readonly stt: () => SpeechToText | null;
  readonly now: () => number;
}

export const transcriptsDir = (store: CampaignStore) => path.join(store.dir, 'transcripts');

/** The running session's number, or 0 outside a session. */
function sessionNumber(store: CampaignStore): number {
  const state = store.campaign.state;
  if (!state || state.currentSession === null) return 0;
  return state.sessions.find((s) => s.id === state.currentSession)?.number ?? 0;
}

export function registerListenRoutes(app: FastifyInstance, options: ListenRouteOptions): void {
  let current: { listener: Listener; store: CampaignStore; hub: LiveHub } | null = null;
  // Lines heard this server run, per campaign, for the GM's live panel.
  const heard = new Map<string, TranscriptLine[]>();

  const stop = async () => {
    const was = current;
    current = null;
    if (!was) return;
    was.hub.setListening(false);
    await was.listener.stop();
  };

  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: AUDIO_BODY_LIMIT },
    (_request, body, done) => done(null, body),
  );

  app.get('/api/gm/listen', () => {
    const a = options.active();
    return {
      on: current !== null && a !== null && current.store === a.store,
      available: options.stt() !== null,
      lines: a ? (heard.get(a.store.id) ?? []) : [],
    };
  });

  app.post('/api/gm/listen', async (request, reply) => {
    const body = z.strictObject({ on: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Send { on }' });
    const a = options.active();
    if (!a) return reply.code(404).send({ error: 'No campaign open' });
    if (!body.data.on || (current && current.store !== a.store)) await stop();
    if (!body.data.on) return { on: false };
    if (current) return { on: true };
    const stt = options.stt();
    if (!stt) {
      return reply.code(503).send({ error: 'Speech-to-text is not installed on this laptop' });
    }
    const lines = heard.get(a.store.id) ?? [];
    heard.set(a.store.id, lines);
    const listener = new Listener({
      dir: transcriptsDir(a.store),
      session: sessionNumber(a.store),
      stt,
      now: options.now,
      onLine: (line) => lines.push(line),
      onError: (err) => app.log.warn({ err }, 'speech-to-text failed on a segment'),
    });
    current = { listener, store: a.store, hub: a.hub };
    a.hub.setListening(true);
    return { on: true };
  });

  app.post('/api/gm/listen/audio', async (request, reply) => {
    const a = options.active();
    if (!current || !a || current.store !== a.store) {
      return reply.code(409).send({ error: 'The co-DM is not listening' });
    }
    const raw = request.body;
    if (!Buffer.isBuffer(raw) || raw.length % 4 !== 0) {
      return reply.code(400).send({ error: 'Send 32-bit float samples' });
    }
    // Copy into an aligned buffer; the bytes are dropped once chunked.
    const samples = new Float32Array(raw.length / 4);
    for (let i = 0; i < samples.length; i++) samples[i] = raw.readFloatLE(i * 4);
    void current.listener.push(samples);
    return { ok: true };
  });

  app.addHook('onClose', async () => {
    await stop();
  });
}
