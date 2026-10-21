import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { helloMessage } from './protocol';

export interface CreateServerOptions {
  webRoot: string;
  logger?: boolean;
}

/** Builds the Fastify app. Does not listen; callers decide host and port. */
export async function createServer(options: CreateServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const webRoot = path.resolve(options.webRoot);

  if (!existsSync(path.join(webRoot, 'index.html'))) {
    throw new Error(`Web build not found at ${webRoot}. Run "npm run build" first.`);
  }

  await app.register(fastifyWebsocket, { options: { maxPayload: 1024 * 1024 } });
  await app.register(fastifyStatic, { root: webRoot, index: ['index.html'] });

  // Only /ws may be upgraded; refuse other upgrades before the handshake.
  // (M2.2 adds the Origin check here.)
  app.addHook('onRequest', async (request, reply) => {
    const isUpgrade = (request.headers.upgrade ?? '').toLowerCase() === 'websocket';
    if (isUpgrade && (request.url.split('?')[0] ?? '') !== WS_PATH) {
      await reply.code(404).send({ error: 'Not found' });
    }
  });

  app.get('/health', () => ({ status: 'ok' }));

  app.get(WS_PATH, { websocket: true }, (socket) => {
    socket.send(JSON.stringify(helloMessage()));
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
