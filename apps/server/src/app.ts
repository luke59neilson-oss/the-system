import { randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { joinInfo, type JoinInfo } from './join';
import { newGmKey } from './security';
import { createServer } from './server';
import { exportsDirFor } from './sessionLog';
import { CampaignStore } from './store';
import { migrateOnLoad } from './migrate';
import { CoDm, type CoDmOptions } from './ai/coDm';
import type { SpeechToText } from './speech/stt';
import { SpeechModel } from './speech/model';
import { sherpaSpeechToText } from './speech/sherpa';
import type { SecretCipher } from './ai/keyStore';

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
  /**
   * MC.1: encryption for the co-DM's API key (Electron safeStorage in the
   * desktop app). Without it the co-DM settings work but no key can be saved.
   */
  aiCipher?: SecretCipher | null | undefined;
  /** MC.1: the co-DM's AI client; the live Anthropic client when omitted. */
  aiClient?: CoDmOptions['makeClient'] | undefined;
  /** MC.5: on-laptop speech-to-text; listening is unavailable when omitted. */
  speech?: (() => SpeechToText | null) | undefined;
  /**
   * MC.5 (D236): where the speech model is downloaded on first use (the
   * desktop app passes `<userData>/models`). Ignored when `speech` is set.
   */
  speechModelsDir?: string | undefined;
  /** MC.5: a ready-made speech model (tests); wins over `speechModelsDir`. */
  speechModel?: SpeechModel | undefined;
  /** MC.5: loads the sherpa-onnx package (the packaged app's copy sits in resources). */
  speechLoad?: (() => Promise<unknown>) | undefined;
}

/**
 * How long close() waits for the listener before backing up and closing the
 * campaign anyway; under the desktop's 5 s quit guard.
 */
export const CLOSE_GRACE_MS = 3_000;

export interface RunningApp {
  port: number;
  gmKey: string;
  /** True when the key was generated here (callers may print it locally). */
  generatedKey: boolean;
  /** Current join URLs and QR codes (interfaces re-read per call). */
  join: () => JoinInfo;
  /** Folder the running session logs are written to (M2.4). */
  exportsDir: string;
  /**
   * Backs the campaign up now under the `backupOnClose` label, without
   * closing it; a no-op when that option is off, the campaign is empty, or
   * nothing was appended since the last such backup (M10.A review: the
   * desktop calls it when the quit question opens, because an installer's
   * forced kill can follow the polite close before anyone answers).
   */
  backup: () => void;
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
    // MC.5: the live recognizer, once its model is downloaded and loaded.
    const speechModel =
      options.speechModel ??
      (options.speech === undefined && options.speechModelsDir !== undefined
        ? new SpeechModel({
            dir: options.speechModelsDir,
            ...(options.speechLoad === undefined
              ? {}
              : { load: (files) => sherpaSpeechToText(files, options.speechLoad) }),
          })
        : null);
    void speechModel?.init();
    const app = await createServer({
      ...(options.speech === undefined ? {} : { speech: options.speech }),
      ...(speechModel ? { speech: () => speechModel.stt(), speechModel } : {}),
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
      // The key and model settings live in their own folder, never in a campaign.
      coDm: new CoDm({
        dir: path.join(storeOptions.dataDir, 'co-dm'),
        cipher: options.aiCipher ?? null,
        ...(options.aiClient === undefined ? {} : { makeClient: options.aiClient }),
        sessionId: () => store.campaign.state?.currentSession ?? null,
      }),
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
    // Event count at the last backup this app made, so asking to quit and
    // then quitting leaves one copy, not two.
    let backedUpAt = -1;
    const backup = () => {
      const count = store.campaign.events.length;
      if (options.backupOnClose === undefined || count === 0 || count === backedUpAt) return;
      try {
        store.backup(options.backupOnClose);
        backedUpAt = count;
      } catch (error) {
        // A failed copy must never stop the campaign closing cleanly.
        console.error('The System: backup failed:', error);
      }
    };
    return {
      port,
      gmKey,
      exportsDir,
      generatedKey: options.gmKey === undefined,
      join: () => joinInfo(options.host, port, networkInterfaces()),
      backup: () => {
        if (closing === null) backup();
      },
      close: () => {
        // A listener that never finishes closing must not cost the backup or
        // the campaign close: give it CLOSE_GRACE_MS, then carry on (M10.1 review).
        closing ??= Promise.race([
          app.close(),
          new Promise<void>((resolve) => setTimeout(resolve, CLOSE_GRACE_MS).unref()),
        ]).finally(() => {
          // The listener is closed (or the grace ran out): take the last copy.
          backup();
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
