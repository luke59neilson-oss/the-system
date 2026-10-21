import { randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_API_VERSION } from '@the-system/engine';
import { ConfigError, resolveOptions } from './config';
import { joinInfo } from './join';
import { newGmKey } from './security';
import { createServer } from './server';
import { CampaignStore } from './store';

const SHUTDOWN_TIMEOUT_MS = 5_000;
const here = path.dirname(fileURLToPath(import.meta.url));
// Works from both src/ (tsx) and dist/ (bundle): each sits one level below apps/server.
const defaultWebRoot = path.resolve(here, '../../web/dist');

async function main(): Promise<void> {
  const options = resolveOptions(process.argv.slice(2), process.env, defaultWebRoot);
  const storeOptions = {
    dataDir: path.resolve(options.dataDir),
    now: () => new Date().toISOString(),
  };
  const store = CampaignStore.open('main', storeOptions);
  const gmKey = options.gmKey ?? newGmKey();
  let boundPort: number | null = null;
  const app = await createServer({
    // Re-read interfaces per request so joining a new wifi shows up without a restart.
    joinInfo: () =>
      boundPort === null ? null : joinInfo(options.host, boundPort, networkInterfaces()),
    webRoot: options.webRoot,
    // The demo campaign lives in its own directory (MS.4, D53).
    openCampaign: (id) => CampaignStore.open(id, storeOptions),
    live: { store, gmKey, now: () => new Date().toISOString(), newId: () => randomUUID() },
  });
  await app.listen({ port: options.port, host: options.host });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  console.log(
    `The System server listening on http://${options.host}:${port} (engine API v${ENGINE_API_VERSION})`,
  );
  boundPort = port;
  console.log('Players join at:');
  for (const url of joinInfo(options.host, port, networkInterfaces()).urls) console.log(`  ${url}`);
  if (!options.gmKey) {
    // Local terminal only (never in a join URL or QR). The desktop app injects its own key.
    console.log(`GM key for this run (keep private): ${gmKey}`);
    // The key rides in the URL fragment, which browsers never send to the server.
    console.log(`GM console on this computer: http://localhost:${port}/gm#key=${gmKey}`);
  }

  const shutdown = (): void => {
    // Don't let a client that ignores the close handshake keep the process alive.
    setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS).unref();
    void app.close().then(() => {
      store.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
