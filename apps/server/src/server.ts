import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  CHANGE_LOG_CATEGORIES,
  buildDemoEvents,
  changeLogPage,
  portraitUrl,
  updateChangeLog,
  type ChangeLogCache,
  type ChangeLogQuery,
  type DomainEvent,
  previewContent,
} from '@the-system/engine';
import { LiveHub, type HubOptions } from './hub';
import { registerListenRoutes } from './speech/routes';
import type { SpeakerEmbedder } from './speech/speakers';
import type { SpeechToText } from './speech/stt';
import type { SpeechModelControl } from './speech/routes';
import type { JoinInfo } from './join';
import {
  PORTRAIT_MAX_BYTES,
  PORTRAIT_TYPES,
  PortraitError,
  portraitFile,
  portraitType,
  savePortrait,
} from './portraits';
import { helloMessage } from './protocol';
import { SessionLogWriter, sessionReport, type SessionLogOptions } from './sessionLog';
import { authPath, gmKeyMatches, isAllowedHost, isAllowedOrigin } from './security';
import type { CampaignStore } from './store';
import { registerCoDmRoutes, type CoDm } from './ai/coDm';
import { registerPracticeDraftRoutes } from './ai/practiceRoutes';
import { registerSuggestionRoutes } from './ai/suggestionRoutes';
import { z } from 'zod';
import { AiError } from './ai/client';
import {
  GENERATE_KINDS,
  GENERATE_PROMPT_MAX,
  GENERATE_TIMEOUT_MS,
  buildGenerateRequest,
  extractJson,
} from './ai/generate';

export interface CreateServerOptions {
  webRoot: string;
  /** Fastify request logging; tests pass a stream to capture the log (MC.1 key canary). */
  logger?: boolean | { stream: { write(line: string): void } };
  /** The open campaign and hub settings; without it the WebSocket only says hello. */
  live?: { store: CampaignStore } & HubOptions;
  /** Extra origins allowed to open the WebSocket (e.g. the Vite dev server). */
  allowedOrigins?: readonly string[];
  /** Extra Host names accepted besides localhost, IP literals and *.local. */
  allowedHosts?: readonly string[];
  /** Join URLs and QR for the GM screen (GM-only route; null until listening). */
  joinInfo?: () => JoinInfo | null;
  /**
   * Opens another campaign by id (the demo, MS.4). Without it the server stays
   * on `live.store` and the campaign switch route answers 404.
   */
  openCampaign?: (id: string) => CampaignStore;
  /**
   * Running session log autosave (M2.4) for every campaign this server opens;
   * the last write happens when the server closes. Off when omitted.
   */
  sessionLog?: Omit<SessionLogOptions, 'onError'>;
  /** Co-DM settings and AI client (MC.1); its routes are GM-only. Off when omitted. */
  coDm?: CoDm;
  /** How long a co-DM generation may take before the GM is told to retry (MC.2). */
  generateTimeoutMs?: number;
  /**
   * MC.5: on-laptop speech-to-text for the co-DM's listening. Null (or
   * omitted) when none is installed: the listen routes say so.
   */
  speech?: () => SpeechToText | null;
  /** MC.5: the downloadable speech model behind `speech` (D236). */
  speechModel?: SpeechModelControl;
  /** MC.6: voice embeddings for speaker labels; absent or null → no labels. */
  speakers?: () => SpeakerEmbedder | null;
  /** Wall clock for transcript times (injectable for tests). */
  now?: () => number;
}

/** The demo campaign's id (D53): its own directory, never the real campaign's. */
export const DEMO_CAMPAIGN_ID = 'demo';

/** /api paths anyone on the LAN may read; every other /api path needs the GM key. */
export const PUBLIC_API = new Set(['/api/characters']);

/** Builds the Fastify app. Does not listen; callers decide host and port. */
export async function createServer(options: CreateServerOptions): Promise<FastifyInstance> {
  const logger = options.logger ?? false;
  const app = Fastify({
    logger: typeof logger === 'boolean' ? logger : { level: 'info', stream: logger.stream },
  });
  const webRoot = path.resolve(options.webRoot);

  if (!existsSync(path.join(webRoot, 'index.html'))) {
    throw new Error(`Web build not found at ${webRoot}. Run "npm run build" first.`);
  }

  await app.register(fastifyWebsocket, { options: { maxPayload: 1024 * 1024 } });
  await app.register(fastifyStatic, { root: webRoot, index: ['index.html'] });

  // The active campaign. Switching (real ↔ demo) closes every socket; clients
  // reconnect and join the new campaign's hub, so no frame ever mixes the two.
  const realId = options.live?.store.id ?? null;
  const logWriters: SessionLogWriter[] = [];
  /** One hub (and session log writer) per campaign for the server's life. */
  const openLive = (store: CampaignStore, live: { store: CampaignStore } & HubOptions) => {
    const writer = options.sessionLog
      ? new SessionLogWriter(store, {
          ...options.sessionLog,
          onError: (error) => app.log.error(error),
        })
      : null;
    if (writer) logWriters.push(writer);
    const hub = new LiveHub(store, {
      ...live,
      afterAppend: (s, events) => sessionEnded(s, events, writer),
    });
    return { store, hub };
  };
  /**
   * Session end (M4.3): back up the campaign and write the session report.
   * The end itself is already saved; a failure here is reported to the GM
   * who ended it and logged, never undone.
   */
  const sessionEnded = (
    store: CampaignStore,
    events: readonly DomainEvent[],
    writer: SessionLogWriter | null,
  ): string | null => {
    const ended = events.find((e) => e.type === 'session.ended');
    if (!ended) {
      // An undo of a session's start or end changes what its file must say: rewrite it now.
      const undo = events.find((e) => e.type === 'event.undone');
      const target = undo && store.campaign.events.find((e) => e.id === undo.payload.eventId);
      if (target && (target.type === 'session.started' || target.type === 'session.ended')) {
        try {
          writer?.flush();
        } catch (error) {
          app.log.error(error);
          return 'The change was saved, but the session log could not be rewritten. See the server log.';
        }
      }
      return null;
    }
    const problems: string[] = [];
    const number =
      store.campaign.state?.sessions.find((x) => x.id === ended.payload.sessionId)?.number ?? 0;
    try {
      store.backup(`session-${number}-end`);
    } catch (error) {
      app.log.error(error);
      problems.push('the backup');
    }
    try {
      writer?.flush();
    } catch (error) {
      app.log.error(error);
      problems.push('the session report');
    }
    return problems.length
      ? `Session ended, but ${problems.join(' and ')} could not be saved. See the server log.`
      : null;
  };
  let active = options.live ? openLive(options.live.store, options.live) : null;
  const opened = new Map<string, { store: CampaignStore; hub: LiveHub }>();
  if (active && options.live) opened.set(options.live.store.id, active);
  const sockets = new Set<{
    close: (code: number, reason: string) => void;
    terminate: () => void;
  }>();

  // Only /ws may be upgraded, and only from this server's own pages (or a
  // listed origin); refuse anything else before the handshake.
  app.addHook('onRequest', async (request, reply) => {
    if (!isAllowedHost(request.headers.host, options.allowedHosts)) {
      return reply.code(421).send({ error: 'Unknown host' });
    }
    // Authorize on a normalized path (decoded, dot-segments resolved) AND the
    // matched route, so encodings like /%61pi cannot slip past the router.
    const normalized = authPath(request.url);
    if (normalized === null) return reply.code(400).send({ error: 'Bad request path' });
    const route = (request.routeOptions.url ?? '').toLowerCase();
    const isUpgrade = (request.headers.upgrade ?? '').toLowerCase() === 'websocket';
    if (isUpgrade && (request.url.split('?')[0] ?? '') !== WS_PATH) {
      return reply.code(404).send({ error: 'Not found' });
    }
    if (
      isUpgrade &&
      !isAllowedOrigin(request.headers.origin, request.headers.host, options.allowedOrigins)
    ) {
      return reply.code(403).send({ error: 'Origin not allowed' });
    }
    // GM HTTP routes deny by default: every /api path not listed public needs the key.
    const isApi = (p: string) => p === '/api' || p.startsWith('/api/');
    const isPublic = PUBLIC_API.has(normalized) && (route === '' || PUBLIC_API.has(route));
    if ((isApi(normalized) || isApi(route)) && !isPublic) {
      const key = options.live?.gmKey ?? '';
      if (!gmKeyMatches(key, request.headers['x-gm-key'])) {
        return reply.code(403).send({ error: 'GM key required' });
      }
    }
    return undefined;
  });

  app.get('/health', () => ({ status: 'ok' }));
  if (options.coDm) {
    registerCoDmRoutes(app, options.coDm);
    // MC.7: practice drafts from the transcript, for the GM's review.
    registerPracticeDraftRoutes(app, { active: () => active, client: options.coDm.client });
    // MC.8: suggestion chips from the recent transcript (counted in the spend counter).
    registerSuggestionRoutes(app, {
      active: () => active,
      client: options.coDm.client,
      now: options.now ?? Date.now,
    });
  }
  registerListenRoutes(app, {
    active: () => active,
    stt: options.speech ?? (() => null),
    ...(options.speechModel ? { model: options.speechModel } : {}),
    ...(options.speakers ? { speakers: options.speakers } : {}),
    now: options.now ?? Date.now,
  });

  // Portrait uploads (M4.4) arrive as raw image bytes; the onRequest hook has
  // already refused anyone without the GM key before the body is read.
  app.addContentTypeParser(
    Object.values(PORTRAIT_TYPES),
    { parseAs: 'buffer', bodyLimit: PORTRAIT_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );
  app.post('/api/gm/portraits', (request, reply) => {
    if (!active) return reply.code(404).send({ error: 'No campaign open' });
    if (!Buffer.isBuffer(request.body)) {
      return reply.code(415).send({ error: 'Send a PNG, JPEG or WebP image' });
    }
    try {
      return { portrait: savePortrait(active.store.dir, request.body) };
    } catch (error) {
      if (error instanceof PortraitError) return reply.code(400).send({ error: error.message });
      app.log.error(error);
      return reply.code(500).send({ error: 'Could not save the portrait' });
    }
  });
  // Stored portraits are public like the join list that shows them: names are
  // content hashes, files never change, and only image types are ever stored.
  app.get('/portraits/:file', (request, reply) => {
    const { file } = request.params as { file: string };
    const found = active ? portraitFile(active.store.dir, file) : null;
    if (!found) return reply.code(404).send({ error: 'Not found' });
    return reply
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'")
      .type(portraitType(file))
      .send(readFileSync(found));
  });

  app.get(WS_PATH, { websocket: true }, (socket) => {
    if (!active) {
      socket.send(JSON.stringify(helloMessage()));
      return;
    }
    sockets.add(socket);
    const connection = active.hub.connect((message) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    });
    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      const raw = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      try {
        connection.receive(raw.toString('utf8'));
      } catch (error) {
        app.log.error(error);
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'error', error: 'Server error' }));
        }
      }
    });
    socket.on('close', () => {
      sockets.delete(socket);
      connection.close();
    });
  });

  // Which campaign is open, and switching between the real one and the demo.
  app.get('/api/gm/campaign', (_request, reply) => {
    if (!active || realId === null) return reply.code(404).send({ error: 'No campaign open' });
    return { id: active.store.id, demo: active.store.id === DEMO_CAMPAIGN_ID };
  });
  app.post('/api/gm/campaign', (request, reply) => {
    const live = options.live;
    if (!active || !live || realId === null || !options.openCampaign) {
      return reply.code(404).send({ error: 'Campaign switching is not available' });
    }
    const body = request.body as { demo?: unknown } | null;
    if (typeof body?.demo !== 'boolean') {
      return reply.code(400).send({ error: 'Send { "demo": true } or { "demo": false }' });
    }
    const id = body.demo ? DEMO_CAMPAIGN_ID : realId;
    if (id === active.store.id) return { id, demo: body.demo };
    let next = opened.get(id);
    if (!next) {
      let store: CampaignStore;
      try {
        store = options.openCampaign(id);
      } catch (error) {
        app.log.error(error);
        // Details (paths, host names) stay in the server log.
        return reply.code(409).send({ error: 'Could not open that campaign' });
      }
      // A fresh demo directory is seeded once (one write); later loads keep what the GM did.
      if (body.demo && store.campaign.events.length === 0) {
        try {
          store.appendAll(buildDemoEvents({ now: live.now, newId: live.newId }));
        } catch (error) {
          store.close();
          app.log.error(error);
          return reply.code(500).send({ error: 'Could not build the demo campaign' });
        }
      }
      // One hub per campaign for the server's life, so switching back keeps its
      // in-memory notification history.
      next = openLive(store, live);
      opened.set(id, next);
    }
    active = next;
    for (const socket of [...sockets]) socket.close(1012, 'Campaign changed');
    sockets.clear();
    return { id, demo: body.demo };
  });
  // preClose runs before Fastify waits for connections to end: write the last
  // session logs now, then drop every socket so a sleeping phone that never
  // answers the close handshake cannot hold shutdown past the exit guard.
  app.addHook('preClose', (done) => {
    for (const writer of logWriters) writer.close();
    for (const socket of [...sockets]) {
      try {
        socket.terminate();
      } catch (error) {
        app.log.error(error);
      }
    }
    done();
  });
  app.addHook('onClose', () => {
    // Writers are closed in preClose; closing again is a no-op unless something changed.
    for (const writer of logWriters) writer.close();
    // The caller closes the store it passed in; close the ones opened here.
    for (const [id, { store }] of opened) {
      if (id === realId) continue;
      try {
        store.close();
      } catch (error) {
        app.log.error(error);
      }
    }
  });

  // Join list: the only campaign data any LAN client may read over HTTP.
  app.get('/api/characters', () => {
    const state = active?.store.campaign.state;
    if (!state) return [];
    return state.characterOrder.flatMap((id) => {
      const c = state.characters[id];
      if (!c) return [];
      // Grade metal for the join-list portrait ring (M3.1); public like the grade.
      const theme = state.rules.grades.find((g) => g.id === c.grade)?.theme ?? null;
      return [{ id: c.id, name: c.name, grade: c.grade, theme, portrait: portraitUrl(c.portrait) }];
    });
  });

  // Join URL + QR for the GM screen. GM-gated like every non-public /api path:
  // players already have the URL, and the list reveals the host's interfaces.
  app.get('/api/join', (_request, reply) => {
    const info = options.joinInfo?.() ?? null;
    if (!info) return reply.code(503).send({ error: 'Not listening yet' });
    return info;
  });

  // M4.8: the GM's change log (GM-only: every event, in words, with undo state).
  // QF.13: rows are kept per campaign and extended as events arrive, so a
  // request costs a filter over cached rows and returns one bounded page.
  const changeLogs = new WeakMap<CampaignStore, ChangeLogCache>();
  app.get('/api/gm/changelog', (request, reply) => {
    if (!active) return reply.code(404).send({ error: 'No campaign open' });
    const store = active.store;
    const cache = updateChangeLog(changeLogs.get(store) ?? null, store.campaign);
    changeLogs.set(store, cache);
    return changeLogPage(cache.rows, parseChangeLogQuery(request.query));
  });

  app.get('/api/gm/export', () => {
    if (!active) return { error: 'No campaign open' };
    return active.store.exportCampaign();
  });

  // M9.1: one play session's report (or running log) as markdown or JSON, for
  // the GM's "Copy for Claude" button. GM-only like every /api/gm path: it
  // includes hidden quests and GM reasons. Rebuilt from the event log, so it
  // works for any past session even if the exports folder was cleared.
  app.get('/api/gm/session-report', (request, reply) => {
    const state = active?.store.campaign.state;
    if (!active || !state) return reply.code(404).send({ error: 'No campaign open' });
    const query = request.query as { n?: unknown; format?: unknown };
    const n = typeof query.n === 'string' && /^[1-9]\d{0,5}$/.test(query.n) ? Number(query.n) : NaN;
    const format = query.format ?? 'md';
    if (!Number.isInteger(n) || (format !== 'md' && format !== 'json')) {
      return reply.code(400).send({ error: 'Send ?n=<session number>&format=md|json' });
    }
    const session = state.sessions.find((s) => s.number === n);
    const report = session
      ? sessionReport(
          active.store.campaign,
          session,
          options.live?.now() ?? new Date().toISOString(),
        )
      : null;
    if (!report) return reply.code(404).send({ error: `No session ${n}` });
    reply.header('cache-control', 'no-store');
    return format === 'json'
      ? reply.type('application/json; charset=utf-8').send(report.json)
      : reply.type('text/markdown; charset=utf-8').send(report.markdown);
  });

  // M9.3: import preview. The GM's content file is checked against the open
  // campaign on a scratch copy (nothing changes); the GM screen then sends
  // the approved entries' commands over its own GM connection.
  app.post('/api/gm/content/preview', { bodyLimit: 2 * 1024 * 1024 }, (request, reply) => {
    if (!active?.store.campaign.state) return reply.code(404).send({ error: 'No campaign open' });
    let n = 0;
    const now = options.live?.now ?? (() => new Date().toISOString());
    // The body is the file (its text or its JSON), or `{ file, only }` to
    // re-check just the entries the GM ticked (a content file never has a
    // top-level `file` key: unknown keys are errors).
    const body = request.body as unknown;
    const wrapped =
      typeof body === 'object' && body !== null && !Array.isArray(body) && 'file' in body
        ? (body as { file: unknown; only?: unknown })
        : null;
    const only =
      wrapped && Array.isArray(wrapped.only)
        ? new Set(wrapped.only.filter((p): p is string => typeof p === 'string'))
        : undefined;
    return previewContent(
      active.store.campaign,
      wrapped ? wrapped.file : body,
      {
        actor: { role: 'gm' },
        sessionId: active.store.campaign.state.currentSession ?? null,
        now,
        newId: () => `preview-${++n}`,
      },
      only,
    );
  });

  // MC.2: generate on demand. The strong model writes a content file for the
  // GM's request; the reply is previewed exactly like an imported file, so
  // the GM approves, edits or regenerates it in the import window and nothing
  // applies before that. GM-only (under /api/gm/), and the campaign context
  // it sends stays between this server and the API.
  const coDm = options.coDm;
  if (!coDm) {
    app.post('/api/gm/ai/generate', (_request, reply) =>
      reply.code(503).send({ error: 'The co-DM is not available on this server' }),
    );
  } else {
    const generateBody = z.strictObject({
      kind: z.enum(GENERATE_KINDS),
      prompt: z.string().max(GENERATE_PROMPT_MAX).default(''),
    });
    const limitMs = options.generateTimeoutMs ?? GENERATE_TIMEOUT_MS;
    app.post('/api/gm/ai/generate', { bodyLimit: 16 * 1024 }, async (request, reply) => {
      const state = active?.store.campaign.state;
      if (!active || !state) return reply.code(404).send({ error: 'No campaign open' });
      const body = generateBody.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Send { kind, prompt }' });
      // The GM cancelling (or closing the console) stops the API call; so
      // does the time limit, which the GM hears about instead of a spinner.
      const abort = new AbortController();
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) abort.abort();
      });
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(
            new AiError(
              `The co-DM took longer than ${Math.round(limitMs / 1000)} s; try again or ask for something smaller`,
              'network',
            ),
          );
        }, limitMs);
      });
      let file: unknown;
      try {
        const answer = await Promise.race([
          coDm.client.complete({
            ...buildGenerateRequest(body.data.kind, body.data.prompt, state),
            timeoutMs: limitMs,
            signal: abort.signal,
          }),
          timedOut,
        ]);
        file = extractJson(answer.text);
      } catch (e) {
        return reply.code(502).send({
          error: e instanceof AiError ? e.message : 'The co-DM could not generate that',
          status: coDm.status(),
        });
      } finally {
        clearTimeout(timer);
      }
      // The campaign may have been switched or closed while the model worked.
      if (!active?.store.campaign.state) {
        return reply.code(404).send({ error: 'No campaign open', status: coDm.status() });
      }
      let n = 0;
      const campaign = active.store.campaign;
      const preview = previewContent(campaign, file, {
        actor: { role: 'gm' },
        sessionId: campaign.state?.currentSession ?? null,
        now: options.live?.now ?? (() => new Date().toISOString()),
        newId: () => `preview-${++n}`,
      });
      return { file, preview, status: coDm.status() };
    });
  }

  // Browser navigations to client-side routes get the app shell; anything else
  // (missing assets, API, health, WebSocket paths) stays a 404.
  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0] ?? '/';
    const wantsHtml = (request.headers.accept ?? '').includes('text/html');
    const isPageRequest = (request.method === 'GET' || request.method === 'HEAD') && wantsHtml;
    if (isPageRequest && !isReservedPath(pathname)) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  return app;
}

export const WS_PATH = '/ws';

const RESERVED_PREFIXES = ['/api', '/health', '/ws', '/portraits'];

/** Paths owned by the server; never answered with the app shell. */
export function isReservedPath(pathname: string): boolean {
  return RESERVED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Query string → change-log page query; anything malformed falls back to the default. */
export function parseChangeLogQuery(query: unknown): ChangeLogQuery {
  const q = (query && typeof query === 'object' ? query : {}) as Record<string, unknown>;
  const int = (v: unknown) =>
    typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number.parseInt(v, 10) : null;
  const who = q.who === 'gm' || q.who === 'player' ? q.who : 'all';
  const kind = CHANGE_LOG_CATEGORIES.find((c) => c === q.kind) ?? 'all';
  return {
    before: int(q.before),
    limit: int(q.limit),
    who,
    kind,
    text: typeof q.text === 'string' ? q.text.slice(0, 200) : '',
  };
}
