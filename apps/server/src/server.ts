import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { LiveHub, type HubOptions } from './hub';
import type { JoinInfo } from './join';
import { helloMessage } from './protocol';
import { authPath, gmKeyMatches, isAllowedHost, isAllowedOrigin } from './security';
import type { CampaignStore } from './store';

export interface CreateServerOptions {
  webRoot: string;
  logger?: boolean;
  /** The open campaign and hub settings; without it the WebSocket only says hello. */
  live?: { store: CampaignStore } & HubOptions;
  /** Extra origins allowed to open the WebSocket (e.g. the Vite dev server). */
  allowedOrigins?: readonly string[];
  /** Extra Host names accepted besides localhost, IP literals and *.local. */
  allowedHosts?: readonly string[];
  /** Join URLs and QR for the GM screen (GM-only route; null until listening). */
  joinInfo?: () => JoinInfo | null;
}

/** /api paths anyone on the LAN may read; every other /api path needs the GM key. */
export const PUBLIC_API = new Set(['/api/characters']);

/** Builds the Fastify app. Does not listen; callers decide host and port. */
export async function createServer(options: CreateServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const webRoot = path.resolve(options.webRoot);

  if (!existsSync(path.join(webRoot, 'index.html'))) {
    throw new Error(`Web build not found at ${webRoot}. Run "npm run build" first.`);
  }

  await app.register(fastifyWebsocket, { options: { maxPayload: 1024 * 1024 } });
  await app.register(fastifyStatic, { root: webRoot, index: ['index.html'] });

  const hub = options.live ? new LiveHub(options.live.store, options.live) : null;

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

  app.get(WS_PATH, { websocket: true }, (socket) => {
    if (!hub) {
      socket.send(JSON.stringify(helloMessage()));
      return;
    }
    const connection = hub.connect((message) => {
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
    socket.on('close', () => connection.close());
  });

  // Join list: the only campaign data any LAN client may read over HTTP.
  app.get('/api/characters', () => {
    const state = options.live?.store.campaign.state;
    if (!state) return [];
    return state.characterOrder.flatMap((id) => {
      const c = state.characters[id];
      return c ? [{ id: c.id, name: c.name, grade: c.grade }] : [];
    });
  });

  // Join URL + QR for the GM screen. GM-gated like every non-public /api path:
  // players already have the URL, and the list reveals the host's interfaces.
  app.get('/api/join', (_request, reply) => {
    const info = options.joinInfo?.() ?? null;
    if (!info) return reply.code(503).send({ error: 'Not listening yet' });
    return info;
  });

  app.get('/api/gm/export', () => {
    if (!options.live) return { error: 'No campaign open' };
    return options.live.store.exportCampaign();
  });

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

const RESERVED_PREFIXES = ['/api', '/health', '/ws'];

/** Paths owned by the server; never answered with the app shell. */
export function isReservedPath(pathname: string): boolean {
  return RESERVED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
