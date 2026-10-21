import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

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

  await app.register(fastifyStatic, { root: webRoot, index: ['index.html'] });

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

const RESERVED_PREFIXES = ['/api', '/health', '/ws'];

/** Paths owned by the server; never answered with the app shell. */
export function isReservedPath(pathname: string): boolean {
  return RESERVED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
