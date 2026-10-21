import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_API_VERSION } from '@the-system/engine';
import { ConfigError, resolveOptions } from './config';
import { joinUrls } from './lan';
import { createServer } from './server';

const here = path.dirname(fileURLToPath(import.meta.url));
// Works from both src/ (tsx) and dist/ (bundle): each sits one level below apps/server.
const defaultWebRoot = path.resolve(here, '../../web/dist');

async function main(): Promise<void> {
  const options = resolveOptions(process.argv.slice(2), process.env, defaultWebRoot);
  const app = await createServer({ webRoot: options.webRoot });
  await app.listen({ port: options.port, host: options.host });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  console.log(
    `The System server listening on http://${options.host}:${port} (engine API v${ENGINE_API_VERSION})`,
  );
  console.log('Players join at:');
  for (const url of joinUrls(options.host, port, networkInterfaces())) console.log(`  ${url}`);

  const shutdown = (): void => {
    void app.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
