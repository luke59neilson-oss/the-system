import { randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { joinInfo, type JoinInfo } from './join';
import { newGmKey } from './security';
import { createServer } from './server';
import { CampaignStore } from './store';

/**
 * Starts the whole server: opens the real campaign, builds the app and
 * listens. Shared by the terminal entry (main.ts) and the desktop wrapper
 * (MS.5), which injects its own GM key and the OS app-data folder.
 */
export interface StartOptions {
  port: number;
  host: string;
  webRoot: string;
  dataDir: string;
  /** Generated when omitted. */
  gmKey?: string | undefined;
}

export interface RunningApp {
  port: number;
  gmKey: string;
  /** True when the key was generated here (callers may print it locally). */
  generatedKey: boolean;
  /** Current join URLs and QR codes (interfaces re-read per call). */
  join: () => JoinInfo;
  /** Closes the listener and every open campaign. */
  close: () => Promise<void>;
}

export async function startApp(options: StartOptions): Promise<RunningApp> {
  const storeOptions = {
    dataDir: path.resolve(options.dataDir),
    now: () => new Date().toISOString(),
  };
  const store = CampaignStore.open('main', storeOptions);
  const gmKey = options.gmKey ?? newGmKey();
  let boundPort: number | null = null;
  try {
    const app = await createServer({
      // Re-read interfaces per request so joining a new wifi shows up without a restart.
      joinInfo: () =>
        boundPort === null ? null : joinInfo(options.host, boundPort, networkInterfaces()),
      webRoot: options.webRoot,
      // The demo campaign lives in its own directory (MS.4, D53).
      openCampaign: (id) => CampaignStore.open(id, storeOptions),
      live: { store, gmKey, now: () => new Date().toISOString(), newId: () => randomUUID() },
    });
    try {
      await app.listen({ port: options.port, host: options.host });
    } catch (error) {
      await app.close();
      throw error;
    }
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : options.port;
    boundPort = port;
    let closing: Promise<void> | null = null;
    return {
      port,
      gmKey,
      generatedKey: options.gmKey === undefined,
      join: () => joinInfo(options.host, port, networkInterfaces()),
      close: () => {
        closing ??= app.close().finally(() => store.close());
        return closing;
      },
    };
  } catch (error) {
    store.close();
    throw error;
  }
}
