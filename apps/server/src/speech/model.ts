// MC.5 (DESIGN §11 "Listening", D236): the speech model is downloaded on
// first use into the user folder (never shipped in the installer), checked
// against a pinned SHA-256, and only the files the recognizer needs are kept.
// Everything that touches the network or the native engine is injectable, so
// the unit tests run offline on a tiny synthetic archive.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import tar from 'tar-stream';
import bz2 from 'unbzip2-stream';
import type { SpeakerEmbedder } from './speakers';
import type { SpeechToText } from './stt';
import { sherpaSpeechToText, type WhisperModelFiles } from './sherpa';

export interface SpeechModelSpec {
  /** Folder name under the models directory. */
  readonly name: string;
  readonly url: string;
  readonly sha256: string;
  /** Download size in bytes (for the progress bar). */
  readonly bytes: number;
  /** Archive member base names to keep, by role. */
  readonly files: WhisperModelFiles;
}

/**
 * Whisper tiny.en (int8), sherpa-onnx's export on GitHub releases. English
 * only, about 118 MB to download and 104 MB on disk.
 */
export const WHISPER_TINY_EN: SpeechModelSpec = {
  name: 'whisper-tiny.en',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2',
  sha256: '2bd6cf965c8bb3e068ef9fa2191387ee63a9dfa2a4e37582a8109641c20005dd',
  bytes: 118_071_777,
  files: {
    encoder: 'tiny.en-encoder.int8.onnx',
    decoder: 'tiny.en-decoder.int8.onnx',
    tokens: 'tiny.en-tokens.txt',
  },
};

/** MC.6 (D238): the speaker-embedding model, one .onnx file, fetched after Whisper. */
export interface SpeakerModelSpec {
  /** Folder name under the models directory. */
  readonly name: string;
  readonly url: string;
  readonly sha256: string;
  readonly bytes: number;
  /** The file's name in that folder. */
  readonly file: string;
}

/**
 * WeSpeaker CAM++ trained on VoxCeleb (English), sherpa-onnx's export on
 * GitHub releases: 29 MB, 512-number voice embeddings.
 */
export const WESPEAKER_EN_CAMPP: SpeakerModelSpec = {
  name: 'speaker-wespeaker-en-campp',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_CAM++.onnx',
  sha256: 'c46fad10b5f81e1aa4a60c162714208577093655076c5450f8c469e522ec54ef',
  bytes: 29_292_684,
  file: 'wespeaker_en_voxceleb_CAM++.onnx',
};

export type SpeakerModelStatus =
  | { readonly state: 'missing' | 'downloading' | 'loading' | 'ready' }
  | { readonly state: 'failed'; readonly error: string };

export type SpeechModelStatus =
  | { readonly state: 'missing'; readonly bytes: number }
  | { readonly state: 'downloading'; readonly received: number; readonly bytes: number }
  | { readonly state: 'loading' }
  | { readonly state: 'ready' }
  | {
      readonly state: 'failed';
      readonly error: string;
      readonly bytes: number;
      /** True when the files were on disk and only loading the engine failed. */
      readonly loadFailed?: boolean;
    };

/** A download that receives nothing for this long is abandoned (MC.5 review). */
export const DOWNLOAD_IDLE_MS = 60_000;

export interface SpeechModelOptions {
  /** The models folder (the desktop app passes `<userData>/models`). */
  readonly dir: string;
  readonly spec?: SpeechModelSpec;
  readonly fetch?: typeof fetch;
  readonly load?: (files: WhisperModelFiles) => Promise<SpeechToText>;
  readonly idleMs?: number;
  /** MC.6: the speaker model to fetch after Whisper; none (no labels) when omitted. */
  readonly speaker?: SpeakerModelSpec;
  readonly loadSpeaker?: (file: string) => Promise<SpeakerEmbedder>;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The model's files on disk, when every one is there. */
export function installedFiles(dir: string, spec: SpeechModelSpec): WhisperModelFiles | null {
  const folder = path.join(dir, spec.name);
  const files: WhisperModelFiles = {
    encoder: path.join(folder, spec.files.encoder),
    decoder: path.join(folder, spec.files.decoder),
    tokens: path.join(folder, spec.files.tokens),
  };
  return Object.values(files).every((f) => existsSync(f)) ? files : null;
}

/** Extracts the named members of a .tar.bz2 into `to`, flattening paths. */
export async function extractMembers(
  archive: string,
  to: string,
  keep: readonly string[],
): Promise<string[]> {
  await mkdir(to, { recursive: true });
  const wanted = new Set(keep);
  const written: string[] = [];
  const extract = tar.extract();
  extract.on('entry', (header, stream, next) => {
    const base = header.name.split('/').pop() ?? '';
    if (header.type !== 'file' || !wanted.has(base)) {
      stream.on('end', next);
      stream.resume();
      return;
    }
    const out = createWriteStream(path.join(to, base));
    stream.pipe(out);
    out.on('finish', () => {
      written.push(base);
      next();
    });
    out.on('error', next);
  });
  await pipeline(createReadStream(archive), bz2(), extract);
  return written;
}

/**
 * The on-laptop speech model: missing until the GM downloads it, then
 * loaded once and shared by every listening session.
 */
export class SpeechModel {
  private readonly spec: SpeechModelSpec;
  private readonly fetchImpl: typeof fetch;
  private readonly load: (files: WhisperModelFiles) => Promise<SpeechToText>;
  private current: SpeechModelStatus;
  private engine: SpeechToText | null = null;
  private busy: Promise<void> | null = null;
  private loading = false;
  private speakerEngine: SpeakerEmbedder | null = null;
  private speakerState: SpeakerModelStatus = { state: 'missing' };
  private speakerBusy: Promise<void> | null = null;

  constructor(private readonly options: SpeechModelOptions) {
    this.spec = options.spec ?? WHISPER_TINY_EN;
    this.fetchImpl = options.fetch ?? fetch;
    this.load = options.load ?? ((files) => sherpaSpeechToText(files));
    this.current = { state: 'missing', bytes: this.spec.bytes };
  }

  status(): SpeechModelStatus {
    return this.current;
  }

  stt(): SpeechToText | null {
    return this.engine;
  }

  /** MC.6: voice embeddings, once the speaker model is loaded. */
  speakers(): SpeakerEmbedder | null {
    return this.speakerEngine;
  }

  /** MC.6: the speaker model's state; null when this server has none. */
  speakerStatus(): SpeakerModelStatus | null {
    return this.options.speaker ? this.speakerState : null;
  }

  /** Loads an already downloaded model (at startup); no network. */
  init(): Promise<void> {
    const speaker = this.prepareSpeaker(false);
    const files = installedFiles(this.options.dir, this.spec);
    if (!files || this.busy) return Promise.all([this.busy, speaker]).then(() => undefined);
    return Promise.all([this.run(() => this.loadFiles(files)), speaker]).then(() => undefined);
  }

  /** Downloads (if needed) and loads the model; one run at a time. */
  download(): Promise<void> {
    // Whisper is ready (an MC.5 install): fetch only the speaker model.
    if (this.engine) return this.prepareSpeaker(true);
    if (this.busy) return this.busy;
    // Set before any await, so the request that started it reports it.
    this.current = installedFiles(this.options.dir, this.spec)
      ? { state: 'loading' }
      : { state: 'downloading', received: 0, bytes: this.spec.bytes };
    return this.run(() => this.fetchAndLoad());
  }

  private run(task: () => Promise<void>): Promise<void> {
    this.loading = false;
    this.busy = task()
      .catch((err: unknown) => {
        this.current = {
          state: 'failed',
          error: message(err),
          bytes: this.spec.bytes,
          ...(this.loading ? { loadFailed: true } : {}),
        };
      })
      .finally(() => {
        this.busy = null;
      });
    return this.busy;
  }

  private async loadFiles(files: WhisperModelFiles): Promise<void> {
    this.current = { state: 'loading' };
    this.loading = true;
    this.engine = await this.load(files);
    this.loading = false;
    this.current = { state: 'ready' };
  }

  private async fetchAndLoad(): Promise<void> {
    const { dir } = this.options;
    const spec = this.spec;
    const ready = installedFiles(dir, spec);
    if (ready) return this.loadFiles(ready);
    await mkdir(dir, { recursive: true });
    const part = path.join(dir, `${spec.name}.tar.bz2.part`);
    const staging = path.join(dir, `${spec.name}.staging`);
    try {
      this.current = { state: 'downloading', received: 0, bytes: spec.bytes };
      // A stalled connection is aborted, so the GM can try again.
      const abort = new AbortController();
      const idleMs = this.options.idleMs ?? DOWNLOAD_IDLE_MS;
      let idle = setTimeout(() => abort.abort(), idleMs);
      const touch = () => {
        clearTimeout(idle);
        idle = setTimeout(() => abort.abort(), idleMs);
      };
      const response = await this.fetchImpl(spec.url, { signal: abort.signal }).catch(
        (err: unknown) => {
          clearTimeout(idle);
          throw abort.signal.aborted ? new Error('The download stalled; try again') : err;
        },
      );
      if (!response.ok || !response.body) {
        clearTimeout(idle);
        throw new Error(`The download failed (HTTP ${response.status})`);
      }
      const hash = createHash('sha256');
      let received = 0;
      const count = new Transform({
        transform: (chunk: Buffer, _enc, done) => {
          touch();
          received += chunk.length;
          if (received > spec.bytes) {
            done(new Error('The download was larger than the model; try again'));
            return;
          }
          hash.update(chunk);
          this.current = { state: 'downloading', received, bytes: spec.bytes };
          done(null, chunk);
        },
      });
      try {
        await pipeline(
          Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
          count,
          createWriteStream(part),
          { signal: abort.signal },
        );
      } catch (err) {
        throw abort.signal.aborted ? new Error('The download stalled; try again') : err;
      } finally {
        clearTimeout(idle);
      }
      if (hash.digest('hex') !== spec.sha256) {
        throw new Error('The downloaded model did not match its checksum; try again');
      }
      this.current = { state: 'loading' };
      await rm(staging, { recursive: true, force: true });
      const keep = Object.values(spec.files);
      const written = await extractMembers(part, staging, keep);
      const missing = keep.filter((f) => !written.includes(f));
      if (missing.length > 0) throw new Error(`The model archive lacks ${missing.join(', ')}`);
      await rm(path.join(dir, spec.name), { recursive: true, force: true });
      await rename(staging, path.join(dir, spec.name));
    } finally {
      await rm(part, { force: true });
      await rm(staging, { recursive: true, force: true });
    }
    const files = installedFiles(dir, spec);
    if (!files) throw new Error('The model files are missing after the download');
    await this.loadFiles(files);
    // Speaker labels are extra: their failure never stops listening.
    await this.prepareSpeaker(true);
  }

  /**
   * MC.6: loads the speaker model, downloading it first when `network` is
   * set; never throws (a failure is reported in `speakerStatus`).
   */
  private prepareSpeaker(network: boolean): Promise<void> {
    const spec = this.options.speaker;
    if (!spec || this.speakerEngine) return Promise.resolve();
    if (this.speakerBusy) return this.speakerBusy;
    const file = path.join(this.options.dir, spec.name, spec.file);
    if (!network && !existsSync(file)) return Promise.resolve();
    const load = this.options.loadSpeaker;
    if (!load) return Promise.resolve();
    this.speakerBusy = (async () => {
      if (!existsSync(file)) {
        this.speakerState = { state: 'downloading' };
        await mkdir(path.dirname(file), { recursive: true });
        await downloadVerified(this.fetchImpl, spec, file, this.options.idleMs ?? DOWNLOAD_IDLE_MS);
      }
      this.speakerState = { state: 'loading' };
      this.speakerEngine = await load(file);
      this.speakerState = { state: 'ready' };
    })()
      .catch((err: unknown) => {
        this.speakerState = { state: 'failed', error: message(err) };
      })
      .finally(() => {
        this.speakerBusy = null;
      });
    return this.speakerBusy;
  }
}

/** Downloads one file to `dest` (via `.part`) and checks its size and SHA-256. */
export async function downloadVerified(
  fetchImpl: typeof fetch,
  spec: { readonly url: string; readonly sha256: string; readonly bytes: number },
  dest: string,
  idleMs: number,
): Promise<void> {
  const part = `${dest}.part`;
  const abort = new AbortController();
  let idle = setTimeout(() => abort.abort(), idleMs);
  const stalled = () => new Error('The download stalled; try again');
  try {
    const response = await fetchImpl(spec.url, { signal: abort.signal }).catch((err: unknown) => {
      throw abort.signal.aborted ? stalled() : err;
    });
    if (!response.ok || !response.body) {
      throw new Error(`The download failed (HTTP ${response.status})`);
    }
    const hash = createHash('sha256');
    let received = 0;
    const count = new Transform({
      transform: (chunk: Buffer, _enc, done) => {
        clearTimeout(idle);
        idle = setTimeout(() => abort.abort(), idleMs);
        received += chunk.length;
        if (received > spec.bytes) {
          done(new Error('The download was larger than the model; try again'));
          return;
        }
        hash.update(chunk);
        done(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      count,
      createWriteStream(part),
      { signal: abort.signal },
    ).catch((err: unknown) => {
      throw abort.signal.aborted ? stalled() : err;
    });
    if (hash.digest('hex') !== spec.sha256) {
      throw new Error('The downloaded model did not match its checksum; try again');
    }
    await rename(part, dest);
  } finally {
    clearTimeout(idle);
    await rm(part, { force: true });
  }
}
