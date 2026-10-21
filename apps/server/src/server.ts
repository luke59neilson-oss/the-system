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

  // Client-side routes fall back to the app shell; unknown API paths stay 404.
  app.setNotFoundHandler((request, reply) => {
    const isPage = request.method === 'GET' && !path.extname(request.url.split('?')[0] ?? '');
    if (isPage && !request.url.startsWith('/api/')) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  return app;
}
