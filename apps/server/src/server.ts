import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  CHANGE_LOG_CATEGORIES,
  buildDemoEvents,
  campaignEvolutionOptions,
  changeLogPage,
  portraitUrl,
  undoPreview,
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
import { StoreError, type BackupInfo, type CampaignStore, type CampaignSummary } from './store';
import { registerCoDmRoutes, type CoDm } from './ai/coDm';
import { draftsDir, registerPracticeDraftRoutes } from './ai/practiceRoutes';
import { registerNotesRoutes } from './ai/notesRoutes';
import { evolutionReference } from './reference/evolutions';
import { registerReferenceRoutes } from './reference/routes';
import { NotesStore } from './ai/sessionNotes';
import { registerSuggestionRoutes } from './ai/suggestionRoutes';
import { campaignQuickSettings, registerQuickRoutes } from './ai/quickRoutes';
import { registerPrepareRoutes } from './ai/prepareRoutes';
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
  logger?: boolean | { stream: { write(line: string): void }; level?: string; file?: string };
  /**
   * Hub settings and the campaign open at start; without `store` the server
   * starts on the Campaigns home (ML.1) and the GM opens one. Without `live`
   * the WebSocket only says hello.
   */
  live?: { store?: CampaignStore } & HubOptions;
  /**
   * ML.1: opens this campaign (through `openCampaign`) before listening, as
   * if the GM had opened it on the home (the e2e suite's servers use 'main').
   */
  openAtStart?: string;
  /**
   * ML.1: closes a campaign the GM closed or is deleting. When given, the
   * caller owns every store `openCampaign` returns and closes the rest itself;
   * otherwise the server closes the ones it opened when it closes.
   */
  releaseCampaign?: (store: CampaignStore) => void;
  /** ML.1: told whenever the open campaign changes (null: back on the home). */
  onActiveChange?: (store: CampaignStore | null) => void;
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
   * QF.44: the campaigns on disk, their backups and Restore (a backup or an
   * export imported as a new campaign beside the others). Off when omitted.
   */
  campaigns?: CampaignLibrary;
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
  /**
   * QF.53: bytes a socket may have queued before per-command views stop for
   * it (a sleeping phone); one whole view follows when it drains.
   */
  wsBacklogBytes?: number;
  /** QF.53: ping interval; a socket that misses 2 pongs in a row is dropped. 0 turns it off. */
  wsHeartbeatMs?: number;
}

/** QF.53 defaults: a few whole GM states of headroom; pings every 20 s. */
export const WS_BACKLOG_BYTES = 2 * 1024 * 1024;
export const WS_HEARTBEAT_MS = 20_000;
/** QF.53: pings a socket may leave unanswered before it is dropped. */
export const WS_MISSED_PONGS = 2;

/** What Restore reads (QF.44): one of the open campaign's backups, or an export file. */
export type RestoreSource = { backup: string; from: string } | { export: unknown };

export interface CampaignLibrary {
  /** Campaign ids with a folder in the data dir. */
  list(): string[];
  /** One campaign's backups, newest first. */
  backups(id: string): BackupInfo[];
  /** Imports the source as a new campaign (never overwriting one); returns what it holds. */
  restore(source: RestoreSource): { id: string; events: number; portraits: number };
  /** ML.1: moves a closed campaign to the Deleted list (files kept). */
  remove?(id: string): void;
  /** ML.1: the Deleted list. */
  deleted?(): { readonly id: string; readonly name?: string }[];
  /** ML.1: puts a deleted campaign back. */
  undelete?(id: string): void;
  /** ML.1: the Campaigns home's rows (name, characters, last opened). */
  summaries?(): CampaignSummary[];
}

/** The largest export file Restore accepts (portraits are 2 MB each at most). */
export const RESTORE_MAX_BYTES = 256 * 1024 * 1024;

/** The demo campaign's id (D53): its own directory, never the real campaign's. */
export const DEMO_CAMPAIGN_ID = 'demo';

/** /api paths anyone on the LAN may read; every other /api path needs the GM key. */
export const PUBLIC_API = new Set(['/api/characters']);

/** ML.1: what phones read while no campaign is open (DESIGN §9a). */
export const WAITING_FOR_CAMPAIGN = 'Waiting for the GM to open a campaign';

/**
 * ML.1: a new campaign's folder id from its name ("The Tutorial" →
 * "the-tutorial"), made unique among `taken` with -2, -3…
 */
export function campaignIdFor(name: string, taken: readonly string[]): string {
  const base =
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 56)
      .replace(/-+$/u, '') || 'campaign';
  const safe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|demo)$/u.test(base) ? `${base}-campaign` : base;
  if (!taken.includes(safe)) return safe;
  for (let n = 2; ; n++) {
    const id = `${safe}-${n}`;
    if (!taken.includes(id)) return id;
  }
}

/** Builds the Fastify app. Does not listen; callers decide host and port. */
export async function createServer(options: CreateServerOptions): Promise<FastifyInstance> {
  const logger = options.logger ?? false;
  const app = Fastify({
    logger:
      typeof logger === 'boolean'
        ? logger
        : { level: logger.level ?? 'info', stream: logger.stream },
  });
  // QF.43: where "see the server log" points the GM.
  const seeLog =
    typeof logger === 'object' && logger.file ? `See ${logger.file}.` : 'See the server log.';
  const webRoot = path.resolve(options.webRoot);

  if (!existsSync(path.join(webRoot, 'index.html'))) {
    throw new Error(`Web build not found at ${webRoot}. Run "npm run build" first.`);
  }

  await app.register(fastifyWebsocket, { options: { maxPayload: 1024 * 1024 } });
  await app.register(fastifyStatic, { root: webRoot, index: ['index.html'] });

  // The active campaign. Switching (real ↔ demo) closes every socket; clients
  // reconnect and join the new campaign's hub, so no frame ever mixes the two.
  // ML.1: "my campaign" for the demo toggle is the first non-demo campaign
  // opened in this server's life (the one open at start, if any).
  let realId: string | null =
    options.live?.store?.id ??
    (options.openAtStart !== DEMO_CAMPAIGN_ID ? options.openAtStart : null) ??
    null;
  const logWriters: SessionLogWriter[] = [];
  /** One hub (and session log writer) per campaign for the server's life. */
  const openLive = (store: CampaignStore, live: { store?: CampaignStore } & HubOptions) => {
    const writer = options.sessionLog
      ? new SessionLogWriter(store, {
          ...options.sessionLog,
          onError: (error) => app.log.error(error),
          notesFor: (n) => new NotesStore(draftsDir(store)).read(n),
        })
      : null;
    if (writer) logWriters.push(writer);
    const hub = new LiveHub(store, {
      ...live,
      afterAppend: (s, events) => sessionEnded(s, events, writer),
    });
    return { store, hub, writer };
  };
  /**
   * Session end (M4.3): back up the campaign and write the session report.
   * The end itself is already saved; a failure here is reported to the GM
   * who ended it and logged, never undone. QF.54: the backup and the report
   * each run in a later turn of the event loop, so phones get the end at
   * once and no single step blocks the table for long.
   */
  const sessionEnded = (
    store: CampaignStore,
    events: readonly DomainEvent[],
    writer: SessionLogWriter | null,
  ): string | null | Promise<string | null> => {
    const ended = events.find((e) => e.type === 'session.ended');
    if (events.some((e) => e.type === 'session.started')) writer?.sessionStarted();
    if (!ended) {
      // An undo of a session's start or end changes what its file must say: rewrite it now.
      const undo = events.find((e) => e.type === 'event.undone');
      const target = undo && store.campaign.events.find((e) => e.id === undo.payload.eventId);
      if (target && (target.type === 'session.started' || target.type === 'session.ended')) {
        try {
          writer?.flush();
        } catch (error) {
          app.log.error(error);
          return `The change was saved, but the session log could not be rewritten. ${seeLog}`;
        }
      }
      return null;
    }
    const number =
      store.campaign.state?.sessions.find((x) => x.id === ended.payload.sessionId)?.number ?? 0;
    return (async () => {
      const problems: string[] = [];
      await nextTurn();
      try {
        store.backup(`session-${number}-end`);
      } catch (error) {
        app.log.error(error);
        problems.push('the backup');
      }
      await nextTurn();
      try {
        writer?.flush();
      } catch (error) {
        app.log.error(error);
        problems.push('the session report');
      }
      return problems.length
        ? `Session ended, but ${problems.join(' and ')} could not be saved. ${seeLog}`
        : null;
    })();
  };
  type Opened = ReturnType<typeof openLive>;
  const callerStore = options.live?.store ?? null;
  let active: Opened | null =
    options.live && callerStore ? openLive(callerStore, options.live) : null;
  const opened = new Map<string, Opened>();
  if (active && callerStore) opened.set(callerStore.id, active);
  const sockets = new Set<{
    close: (code: number, reason: string) => void;
    terminate: () => void;
    ping: () => void;
  }>();
  // QF.53: a socket that stops answering pings (a phone that slept or left
  // the wifi without closing) is dropped, so nothing queues for it forever.
  const missedPongs = new WeakMap<object, number>();
  const heartbeatMs = options.wsHeartbeatMs ?? WS_HEARTBEAT_MS;
  const heartbeat =
    heartbeatMs > 0
      ? setInterval(() => {
          for (const socket of [...sockets]) {
            const missed = missedPongs.get(socket) ?? 0;
            if (missed >= WS_MISSED_PONGS) {
              sockets.delete(socket);
              socket.terminate();
              continue;
            }
            missedPongs.set(socket, missed + 1);
            try {
              socket.ping();
            } catch {
              // A socket mid-close: the next tick drops it.
            }
          }
        }, heartbeatMs)
      : null;
  heartbeat?.unref();
  const backlogBytes = options.wsBacklogBytes ?? WS_BACKLOG_BYTES;

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
  // MU.6: the Primal Hunter reference lists, GM-only.
  registerReferenceRoutes(app);
  if (options.coDm) {
    registerCoDmRoutes(app, options.coDm);
    // MC.7: practice drafts from the transcript, for the GM's review.
    registerPracticeDraftRoutes(app, { active: () => active, client: options.coDm.client });
    // MC.9: running session notes and the end-of-session summary.
    registerNotesRoutes(app, {
      active: () => active,
      client: options.coDm.client,
      flush: (store) => {
        for (const w of logWriters) if (w.store === store) w.flushNow();
      },
    });
    // MC.8: suggestion chips from the recent transcript (counted in the spend counter).
    const suggestCoDm = options.coDm;
    registerSuggestionRoutes(app, {
      active: () => active,
      client: options.coDm.client,
      now: options.now ?? Date.now,
      hasKey: () => suggestCoDm.status().hasKey,
    });
    // MD.1: quick responses (GM-only, streamed, counted in the spend counter).
    const quickCoDm = options.coDm;
    registerQuickRoutes(app, {
      active: () => active,
      client: quickCoDm.client,
      dir: quickCoDm.dir,
      spend: () => quickCoDm.status().spend,
    });
    // MC.10: prepare ahead (off by default; both calls counted in the spend counter).
    registerPrepareRoutes(app, {
      active: () => active,
      client: options.coDm.client,
      now: options.now ?? Date.now,
      ...(options.generateTimeoutMs !== undefined ? { timeoutMs: options.generateTimeoutMs } : {}),
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
      // ML.1: no campaign open: the phone waits and rejoins when one opens.
      socket.send(JSON.stringify(helloMessage(undefined, options.live !== undefined)));
      if (options.live) {
        sockets.add(socket);
        socket.on('pong', () => missedPongs.set(socket, 0));
        socket.on('close', () => sockets.delete(socket));
      }
      return;
    }
    sockets.add(socket);
    socket.on('pong', () => missedPongs.set(socket, 0));
    const backlogged = () => socket.bufferedAmount > backlogBytes;
    const connection = active.hub.connect(
      (message, serialized) => {
        if (socket.readyState !== socket.OPEN) return;
        // QF.53: each write that leaves the queue may end a backlog.
        socket.send(serialized ?? JSON.stringify(message), () => {
          if (!backlogged()) connection.resume();
        });
      },
      { backlogged },
    );
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

  /** Drops every socket so clients rejoin whatever is open now (or wait on the home). */
  const dropSockets = () => {
    for (const socket of [...sockets]) socket.close(1012, 'Campaign changed');
    sockets.clear();
  };
  const setActive = (next: Opened | null) => {
    active = next;
    // ML.4: a campaign takes its own quick-response setup the first time it opens.
    if (next && options.coDm) campaignQuickSettings(next.store, options.coDm.dir);
    options.onActiveChange?.(next?.store ?? null);
    dropSockets();
  };
  /** Closes a campaign this server opened (its log writer too) so its lock is free. */
  const release = (entry: Opened) => {
    opened.delete(entry.store.id);
    if (entry.writer) {
      entry.writer.close();
      logWriters.splice(logWriters.indexOf(entry.writer), 1);
    }
    if (entry.store === callerStore) return;
    if (options.releaseCampaign) options.releaseCampaign(entry.store);
    else entry.store.close();
  };
  type OpenResult = { ok: true; entry: Opened } | { ok: false; code: number; error: string };
  /** Opens (or returns the already open) campaign `id`; seeds the demo once. */
  const openById = (id: string): OpenResult => {
    const live = options.live;
    const found = opened.get(id);
    if (found) return { ok: true, entry: found };
    if (!live || !options.openCampaign) {
      return { ok: false, code: 404, error: 'Campaign switching is not available' };
    }
    let store: CampaignStore;
    try {
      store = options.openCampaign(id);
    } catch (error) {
      app.log.error(error);
      // Details (paths, host names) stay in the server log.
      return { ok: false, code: 409, error: 'Could not open that campaign' };
    }
    // A fresh demo directory is seeded once (one write); later loads keep what the GM did.
    if (id === DEMO_CAMPAIGN_ID && store.campaign.events.length === 0) {
      try {
        store.appendAll(buildDemoEvents({ now: live.now, newId: live.newId }));
      } catch (error) {
        if (options.releaseCampaign) options.releaseCampaign(store);
        else store.close();
        app.log.error(error);
        return { ok: false, code: 500, error: 'Could not build the demo campaign' };
      }
    }
    // One hub per campaign while it stays open, so switching back keeps its
    // in-memory notification history.
    const entry = openLive(store, live);
    opened.set(id, entry);
    if (id !== DEMO_CAMPAIGN_ID) realId ??= id;
    return { ok: true, entry };
  };
  if (options.openAtStart !== undefined && active === null) {
    const first = openById(options.openAtStart);
    if (!first.ok)
      throw new Error(`Could not open campaign "${options.openAtStart}": ${first.error}`);
    active = first.entry;
    options.onActiveChange?.(active.store);
  }

  // Which campaign is open (id null: the Campaigns home, ML.1), and switching.
  app.get('/api/gm/campaign', () => {
    if (!active) return { id: null, demo: false, main: false };
    const id = active.store.id;
    return { id, demo: id === DEMO_CAMPAIGN_ID, main: id === realId };
  });
  /** ML.1: a campaign's home row, live for the ones open in this server. */
  const summaryOf = (id: string): CampaignSummary => {
    const live = opened.get(id)?.store.campaign.state;
    const kept = options.campaigns?.summaries?.().find((x) => x.id === id) ?? {
      id,
      name: null,
      characters: [],
      lastOpened: null,
    };
    if (!live) return kept;
    return {
      ...kept,
      name: live.name,
      characters: live.characterOrder.flatMap((c) => {
        const name = live.characters[c]?.name;
        return name === undefined ? [] : [name];
      }),
    };
  };
  // QF.44 / ML.1: every campaign on disk, for the Campaigns home and backups.
  app.get('/api/gm/campaigns', () => {
    const ids = (options.campaigns?.list() ?? (callerStore ? [callerStore.id] : [])).filter(
      (id) => id !== DEMO_CAMPAIGN_ID,
    );
    const kept = new Map((options.campaigns?.summaries?.() ?? []).map((x) => [x.id, x]));
    return {
      active: active?.store.id ?? null,
      main: realId,
      campaigns: ids,
      home: ids.map((id) =>
        opened.has(id)
          ? summaryOf(id)
          : (kept.get(id) ?? { id, name: null, characters: [], lastOpened: null }),
      ),
    };
  });
  // ML.1: New campaign: a folder named after it, opened at once (the console
  // then sends campaign.create with the name and the default libraries).
  app.post('/api/gm/campaigns', (request, reply) => {
    const body = request.body as { name?: unknown } | null;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (name === '' || name.length > 200) {
      return reply.code(400).send({ error: 'Give the campaign a name (up to 200 characters)' });
    }
    if (!options.campaigns || !options.openCampaign) {
      return reply.code(404).send({ error: 'New campaigns are not available' });
    }
    const taken = [
      ...options.campaigns.list(),
      ...(options.campaigns.deleted?.() ?? []).map((d) => d.id),
    ];
    const id = campaignIdFor(name, taken);
    const result = openById(id);
    if (!result.ok) return reply.code(result.code).send({ error: result.error });
    setActive(result.entry);
    return { id, name, demo: false, main: id === realId };
  });
  // ML.1: Close goes back to the Campaigns home; phones wait for the next one.
  app.post('/api/gm/campaign/close', () => {
    if (!active) return { id: null };
    const closing = active;
    setActive(null);
    release(closing);
    return { id: null };
  });
  // ML.1: Delete moves a campaign to the Deleted list; never the open one.
  app.post('/api/gm/campaigns/:id/delete', (request, reply) => {
    const { id } = request.params as { id: string };
    const library = options.campaigns;
    if (!library?.remove) return reply.code(404).send({ error: 'Delete is not available' });
    if (active?.store.id === id) {
      return reply.code(409).send({ error: 'Close the campaign before deleting it' });
    }
    if (!library.list().includes(id))
      return reply.code(404).send({ error: 'No campaign with that id' });
    // ML.1 review: the server checks the typed name too, not only the home.
    const typed = (request.body as { name?: unknown } | null)?.name;
    const row = opened.has(id)
      ? summaryOf(id)
      : options.campaigns?.summaries?.().find((x) => x.id === id);
    if (typeof typed !== 'string' || typed.trim() !== (row?.name ?? id)) {
      return reply.code(400).send({ error: 'Type the campaign’s name to delete it' });
    }
    // Opened earlier in this server's life but not open now: let go of it first.
    const idle = opened.get(id);
    if (idle) release(idle);
    try {
      library.remove(id);
    } catch (error) {
      app.log.error(error);
      return reply.code(409).send({ error: 'Could not delete that campaign; is it open?' });
    }
    return { deleted: id };
  });
  app.get('/api/gm/campaigns/deleted', () => ({ deleted: options.campaigns?.deleted?.() ?? [] }));
  app.post('/api/gm/campaigns/:id/undelete', (request, reply) => {
    const { id } = request.params as { id: string };
    const library = options.campaigns;
    if (!library?.undelete || !library.deleted) {
      return reply.code(404).send({ error: 'Restore is not available' });
    }
    if (!library.deleted().some((d) => d.id === id)) {
      return reply.code(404).send({ error: 'No deleted campaign with that id' });
    }
    try {
      library.undelete(id);
    } catch (error) {
      app.log.error(error);
      return reply.code(409).send({ error: 'Could not restore that campaign' });
    }
    return { restored: id };
  });
  app.post('/api/gm/campaign', (request, reply) => {
    if (!options.live || !options.openCampaign) {
      return reply.code(404).send({ error: 'Campaign switching is not available' });
    }
    const body = request.body as { demo?: unknown; id?: unknown } | null;
    let id: string;
    if (typeof body?.id === 'string') {
      // QF.44 / ML.1: any campaign folder on disk, by its listed id.
      const known = options.campaigns?.list() ?? (callerStore ? [callerStore.id] : []);
      if (!known.includes(body.id) && !opened.has(body.id)) {
        return reply.code(404).send({ error: 'No campaign with that id' });
      }
      id = body.id;
    } else if (typeof body?.demo === 'boolean') {
      if (!body.demo && realId === null) {
        return reply.code(409).send({ error: 'No campaign to go back to; open one from the home' });
      }
      id = body.demo ? DEMO_CAMPAIGN_ID : (realId as string);
    } else {
      return reply
        .code(400)
        .send({ error: 'Send { "demo": true }, { "demo": false } or { "id": "<campaign>" }' });
    }
    if (id === active?.store.id) {
      return { id, demo: id === DEMO_CAMPAIGN_ID, main: id === realId };
    }
    const result = openById(id);
    if (!result.ok) return reply.code(result.code).send({ error: result.error });
    setActive(result.entry);
    return { id, demo: id === DEMO_CAMPAIGN_ID, main: id === realId };
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
    if (heartbeat) clearInterval(heartbeat);
    // Writers are closed in preClose; closing again is a no-op unless something changed.
    for (const writer of logWriters) writer.close();
    // The caller closes the store it passed in, and every store when it
    // owns them (`releaseCampaign`); otherwise close the ones opened here.
    if (options.releaseCampaign) return;
    for (const { store } of opened.values()) {
      if (store === callerStore) continue;
      try {
        store.close();
      } catch (error) {
        app.log.error(error);
      }
    }
  });

  // Join list: the only campaign data any LAN client may read over HTTP.
  app.get('/api/characters', (_request, reply) => {
    // ML.1: phones say "Waiting for the GM to open a campaign" (DESIGN §9a).
    if (!active && options.live) {
      // 200, not an error status: phones ask every few seconds while they wait.
      return reply.send({ waiting: true, error: WAITING_FOR_CAMPAIGN });
    }
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

  // ME.4 (DESIGN §4): the Evolutions tab's reference table: the books'
  // options and the campaign's own earlier ones. GM-only (under /api/gm/).
  app.get('/api/gm/evolution-reference', () => ({
    books: evolutionReference(),
    campaign: active ? campaignEvolutionOptions(active.store.campaign) : [],
  }));

  // QF.40: what an undo would change in each character's levels, for the
  // change log's confirm (a dry run on the campaign value; nothing is saved).
  app.get('/api/gm/changelog/undo-preview', (request, reply) => {
    if (!active) return reply.code(404).send({ error: 'No campaign open' });
    const id = (request.query as { id?: unknown }).id;
    if (typeof id !== 'string' || id === '' || id.length > 200) {
      return reply.code(400).send({ error: 'Send ?id=<event id>' });
    }
    return undoPreview(active.store.campaign, id, options.live?.now() ?? new Date().toISOString());
  });

  app.get('/api/gm/export', (_request, reply) => {
    if (!active) return reply.code(404).send({ error: 'No campaign open' });
    return active.store.exportCampaign();
  });

  // QF.44: Back up now, the backups list and Restore (Library & settings).
  app.post('/api/gm/backup', (_request, reply) => {
    if (!active) return reply.code(404).send({ error: 'No campaign open' });
    const store = active.store;
    try {
      const folder = store.backup('manual');
      return { name: path.basename(folder), events: store.campaign.events.length };
    } catch (error) {
      if (error instanceof StoreError && /already exists/.test(error.message)) {
        return reply.code(409).send({ error: 'A backup was made this moment; try again.' });
      }
      app.log.error(error);
      return reply.code(500).send({ error: `The backup could not be written. ${seeLog}` });
    }
  });
  app.get('/api/gm/backups', (request, reply) => {
    // ML.1: the Campaigns home asks for any listed campaign's backups.
    const asked = (request.query as { campaign?: unknown }).campaign;
    const id =
      typeof asked === 'string' && options.campaigns?.list().includes(asked)
        ? asked
        : active?.store.id;
    if (id === undefined) return reply.code(404).send({ error: 'No campaign open' });
    return { campaign: id, backups: options.campaigns?.backups(id) ?? [] };
  });
  app.post('/api/gm/restore', { bodyLimit: RESTORE_MAX_BYTES }, (request, reply) => {
    const library = options.campaigns;
    if (!library) return reply.code(404).send({ error: 'Restore is not available' });
    const body = request.body as { backup?: unknown; export?: unknown; from?: unknown } | null;
    // ML.1: on the Campaigns home a backup names its campaign (`from`).
    const from =
      typeof body?.from === 'string' && library.list().includes(body.from)
        ? body.from
        : active?.store.id;
    let source: RestoreSource;
    if (typeof body?.backup === 'string' && body.backup.length <= 200) {
      if (from === undefined) return reply.code(404).send({ error: 'No campaign open' });
      source = { backup: body.backup, from };
    } else if (body !== null && typeof body === 'object' && 'export' in body) {
      source = { export: body.export };
    } else {
      return reply.code(400).send({ error: 'Send { "backup": "<name>" } or { "export": <file> }' });
    }
    try {
      return library.restore(source);
    } catch (error) {
      if (error instanceof StoreError) {
        // The store's messages name what is wrong with the file, never a path.
        return reply.code(422).send({ error: `Nothing was restored: ${error.message}.` });
      }
      app.log.error(error);
      return reply.code(500).send({ error: `Nothing was restored. ${seeLog}` });
    }
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

/** QF.54: resolves in a later turn of the event loop (after pending I/O). */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
