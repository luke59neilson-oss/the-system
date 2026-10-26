import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_API_VERSION } from '@the-system/engine';
import { startApp } from './app';
import { ConfigError, resolveOptions } from './config';
import {
  E2E_FAKE_AI_ENV,
  E2E_SPEECH_ARCHIVE_ENV,
  e2eFakeFromEnv,
  e2eFakeSpeechModel,
} from './ai/e2eFake';

const SHUTDOWN_TIMEOUT_MS = 5_000;
const here = path.dirname(fileURLToPath(import.meta.url));
// Works from both src/ (tsx) and dist/ (bundle): each sits one level below apps/server.
const defaultWebRoot = path.resolve(here, '../../web/dist');

async function main(): Promise<void> {
  const options = resolveOptions(process.argv.slice(2), process.env, defaultWebRoot);
  // TEST ONLY: the e2e suite's stand-in key cipher and AI client (MC.1).
  const fake = e2eFakeFromEnv(process.env);
  if (fake) console.log(`${E2E_FAKE_AI_ENV}=1: TEST ONLY fake co-DM cipher and AI client`);
  const running = await startApp(
    fake
      ? {
          ...options,
          aiCipher: fake.cipher,
          aiClient: fake.makeClient,
          // MC.5: either a recognizer that is ready, or a model to download first.
          ...(process.env[E2E_SPEECH_ARCHIVE_ENV]
            ? {
                speechModel: e2eFakeSpeechModel(
                  process.env[E2E_SPEECH_ARCHIVE_ENV],
                  options.dataDir,
                ),
              }
            : { speech: () => fake.speech, speakers: () => fake.speakers }),
        }
      : options,
  );
  const { port, gmKey } = running;
  console.log(
    `The System server listening on http://${options.host}:${port} (engine API v${ENGINE_API_VERSION})`,
  );
  console.log(`Session logs are saved in ${running.exportsDir}`);
  console.log('Players join at:');
  for (const url of running.join().urls) console.log(`  ${url}`);
  if (running.generatedKey) {
    // Local terminal only (never in a join URL or QR). The desktop app injects its own key.
    console.log(`GM key for this run (keep private): ${gmKey}`);
    // The key rides in the URL fragment, which browsers never send to the server.
    console.log(`GM console on this computer: http://localhost:${port}/gm#key=${gmKey}`);
  }

  const shutdown = (): void => {
    // Don't let a client that ignores the close handshake keep the process alive.
    setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS).unref();
    void running.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
