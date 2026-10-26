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
import type { SpeechModelStatus } from './model';
import { EnrolmentStore, type SpeakerEmbedder } from './speakers';

/** MC.5 (D236): the speech model the GM downloads on first use. */
export interface SpeechModelControl {
  status(): SpeechModelStatus;
  download(): Promise<void>;
}

/** At most 2 s of 16 kHz float audio per request. */
export const AUDIO_BODY_LIMIT = DEFAULT_VAD.sampleRate * 4 * 2;

export interface ListenRouteOptions {
  readonly active: () => { store: CampaignStore; hub: LiveHub } | null;
  /** The recognizer; null when speech-to-text is not installed (the mic stays off). */
  readonly stt: () => SpeechToText | null;
  /** Absent when this server has no downloadable model (tests, the terminal entry). */
  readonly model?: SpeechModelControl;
  /** MC.6: voice embeddings; absent or null → no enrolment and no labels. */
  readonly speakers?: () => SpeakerEmbedder | null;
  readonly now: () => number;
}

export const transcriptsDir = (store: CampaignStore) => path.join(store.dir, 'transcripts');
/** MC.6 (D238): voice enrolments (embeddings only, never audio). */
export const speakersDir = (store: CampaignStore) => path.join(store.dir, 'speakers');

/** At most 15 s of 16 kHz float audio for one voice sample. */
export const ENROL_BODY_LIMIT = DEFAULT_VAD.sampleRate * 4 * 15;
/** A voice sample shorter than this is too short to tell voices apart. */
export const ENROL_MIN_SECONDS = 3;

const readPcm = (raw: unknown): Float32Array | null => {
  if (!Buffer.isBuffer(raw) || raw.length % 4 !== 0) return null;
  const samples = new Float32Array(raw.length / 4);
  for (let i = 0; i < samples.length; i++) samples[i] = raw.readFloatLE(i * 4);
  return samples;
};

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

  const speakerOptions = (store: CampaignStore) => {
    const embedder = options.speakers?.() ?? null;
    if (!embedder) return {};
    const enrolments = new EnrolmentStore(speakersDir(store));
    return { speakers: { embedder, enrolments: () => enrolments.list() } };
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
      model: options.model?.status() ?? null,
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
      return reply.code(503).send({
        error: options.model
          ? 'Download the speech model first'
          : 'Speech-to-text is not installed on this laptop',
      });
    }
    const lines = heard.get(a.store.id) ?? [];
    heard.set(a.store.id, lines);
    const listener = new Listener({
      dir: transcriptsDir(a.store),
      session: sessionNumber(a.store),
      stt,
      now: options.now,
      onLine: (line) => lines.push(line),
      ...speakerOptions(a.store),
      onError: (err) => app.log.warn({ err }, 'speech-to-text failed on a segment'),
    });
    current = { listener, store: a.store, hub: a.hub };
    a.hub.setListening(true);
    return { on: true };
  });

  // Starts the one-time model download; the GM panel polls the status above.
  app.post('/api/gm/listen/model', (_request, reply) => {
    if (!options.model) {
      return reply.code(404).send({ error: 'This server cannot download a speech model' });
    }
    void options.model.download();
    return { model: options.model.status() };
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

  // MC.6: voice enrolment. The panel lists names only; embeddings stay here.
  app.get('/api/gm/listen/speakers', (_request, reply) => {
    const a = options.active();
    if (!a) return reply.code(404).send({ error: 'No campaign open' });
    return {
      available: (options.speakers?.() ?? null) !== null,
      enrolments: new EnrolmentStore(speakersDir(a.store))
        .list()
        .map(({ characterId, name, enrolledAt }) => ({ characterId, name, enrolledAt })),
    };
  });

  app.post<{ Params: { characterId: string } }>(
    '/api/gm/listen/speakers/:characterId',
    { bodyLimit: ENROL_BODY_LIMIT },
    async (request, reply) => {
      const a = options.active();
      if (!a) return reply.code(404).send({ error: 'No campaign open' });
      const embedder = options.speakers?.() ?? null;
      if (!embedder) {
        return reply.code(503).send({ error: 'Speaker labels are not installed on this laptop' });
      }
      const characters = a.store.campaign.state?.characters ?? {};
      const id = request.params.characterId;
      const character = Object.hasOwn(characters, id) ? characters[id] : undefined;
      if (!character) return reply.code(404).send({ error: 'No such character' });
      const samples = readPcm(request.body);
      if (!samples) return reply.code(400).send({ error: 'Send 32-bit float samples' });
      if (samples.length < DEFAULT_VAD.sampleRate * ENROL_MIN_SECONDS) {
        return reply
          .code(400)
          .send({ error: `Record at least ${ENROL_MIN_SECONDS} seconds of speech` });
      }
      let embedding: number[] | null;
      try {
        embedding = await embedder.embed(samples, DEFAULT_VAD.sampleRate);
      } catch (err) {
        app.log.warn({ err }, 'voice enrolment failed');
        embedding = null;
      }
      if (!embedding || embedding.length === 0) {
        return reply.code(422).send({ error: 'Could not hear a voice in that sample; try again' });
      }
      const enrolledAt = new Date(options.now()).toISOString();
      new EnrolmentStore(speakersDir(a.store)).save({
        characterId: character.id,
        name: character.name,
        embedding,
        enrolledAt,
      });
      return { characterId: character.id, name: character.name, enrolledAt };
    },
  );

  app.delete<{ Params: { characterId: string } }>(
    '/api/gm/listen/speakers/:characterId',
    (request, reply) => {
      const a = options.active();
      if (!a) return reply.code(404).send({ error: 'No campaign open' });
      const removed = new EnrolmentStore(speakersDir(a.store)).remove(request.params.characterId);
      if (!removed) return reply.code(404).send({ error: 'No voice sample for that character' });
      return { removed: true };
    },
  );

  app.addHook('onClose', async () => {
    await stop();
  });
}
