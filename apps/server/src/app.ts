import { randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { joinInfo, type JoinInfo } from './join';
import { newGmKey } from './security';
import { createServer } from './server';
import { exportsDirFor } from './sessionLog';
import { CampaignStore } from './store';
import { migrateOnLoad } from './migrate';

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
  /** Stable id of this computer for campaign locks (see StoreOptions.machineId). */
  machineId?: string | undefined;
  /** Session log autosave interval (M2.4); 5 minutes when omitted. */
  sessionLogIntervalMs?: number | undefined;
  /**
   * M10.1: when set, closing backs up the real campaign (never the demo) to
   * `backups/<stamp>-<label>/` first, if it has any events. The desktop app
   * passes "quit".
   */
  backupOnClose?: string | undefined;
  /** OS shown in the join help (M10.1); `process.platform` when omitted. */
  platform?: string | undefined;
}

export interface RunningApp {
  port: number;
  gmKey: string;
  /** True when the key was generated here (callers may print it locally). */
  generatedKey: boolean;
  /** Current join URLs and QR codes (interfaces re-read per call). */
  join: () => JoinInfo;
  /** Folder the running session logs are written to (M2.4). */
  exportsDir: string;
  /** Closes the listener and every open campaign (writing the session logs once more). */
  close: () => Promise<void>;
}

export async function startApp(options: StartOptions): Promise<RunningApp> {
  const storeOptions = {
    dataDir: path.resolve(options.dataDir),
    now: () => new Date().toISOString(),
    ...(options.machineId === undefined ? {} : { machineId: options.machineId }),
  };
  // Stored campaigns pick up rules migrations as they load (MR.3).
  const open = (id: string) =>
    migrateOnLoad(CampaignStore.open(id, storeOptions), storeOptions.now, () => randomUUID());
  const store = open('main');
  const exportsDir = exportsDirFor(storeOptions.dataDir);
  const gmKey = options.gmKey ?? newGmKey();
  const platform = options.platform ?? process.platform;
  // QF.18: the port comes from the live socket, not from a variable set after
  // listen() resolves, so a request that arrives in between (a GM console
  // reconnecting the moment a restarted server accepts) never gets a 503.
  let listening: { address(): unknown } | null = null;
  const livePort = (): number | null => {
    const address = listening?.address();
    return typeof address === 'object' && address !== null && 'port' in address
      ? Number((address as { port: unknown }).port)
      : null;
  };
  try {
    const app = await createServer({
      // Re-read interfaces per request so joining a new wifi shows up without a restart.
      joinInfo: () => {
        const port = livePort();
        return port === null
          ? null
          : { ...joinInfo(options.host, port, networkInterfaces()), platform };
      },
      webRoot: options.webRoot,
      // The demo campaign lives in its own directory (MS.4, D53).
      openCampaign: open,
      sessionLog: {
        exportsDir,
        now: storeOptions.now,
        ...(options.sessionLogIntervalMs === undefined
          ? {}
          : { intervalMs: options.sessionLogIntervalMs }),
      },
      live: { store, gmKey, now: () => new Date().toISOString(), newId: () => randomUUID() },
    });
    listening = app.server;
    try {
      await app.listen({ port: options.port, host: options.host });
    } catch (error) {
      await app.close();
      throw error;
    }
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : options.port;
    let closing: Promise<void> | null = null;
    return {
      port,
      gmKey,
      exportsDir,
      generatedKey: options.gmKey === undefined,
      join: () => joinInfo(options.host, port, networkInterfaces()),
      close: () => {
        closing ??= app.close().finally(() => {
          // After the listener is closed nothing else can append: the copy is final.
          if (options.backupOnClose !== undefined && store.campaign.events.length > 0) {
            try {
              store.backup(options.backupOnClose);
            } catch (error) {
              // A failed copy must never stop the campaign closing cleanly.
              console.error('The System: backup on close failed:', error);
            }
          }
          store.close();
        });
        return closing;
      },
    };
  } catch (error) {
    store.close();
    throw error;
  }
}
