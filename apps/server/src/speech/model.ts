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

export type SpeechModelStatus =
  | { readonly state: 'missing'; readonly bytes: number }
  | { readonly state: 'downloading'; readonly received: number; readonly bytes: number }
  | { readonly state: 'loading' }
  | { readonly state: 'ready' }
  | { readonly state: 'failed'; readonly error: string; readonly bytes: number };

export interface SpeechModelOptions {
  /** The models folder (the desktop app passes `<userData>/models`). */
  readonly dir: string;
  readonly spec?: SpeechModelSpec;
  readonly fetch?: typeof fetch;
  readonly load?: (files: WhisperModelFiles) => Promise<SpeechToText>;
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

  /** Loads an already downloaded model (at startup); no network. */
  init(): Promise<void> {
    const files = installedFiles(this.options.dir, this.spec);
    if (!files || this.busy) return this.busy ?? Promise.resolve();
    return this.run(() => this.loadFiles(files));
  }

  /** Downloads (if needed) and loads the model; one run at a time. */
  download(): Promise<void> {
    if (this.engine) return Promise.resolve();
    if (this.busy) return this.busy;
    // Set before any await, so the request that started it reports it.
    this.current = installedFiles(this.options.dir, this.spec)
      ? { state: 'loading' }
      : { state: 'downloading', received: 0, bytes: this.spec.bytes };
    return this.run(() => this.fetchAndLoad());
  }

  private run(task: () => Promise<void>): Promise<void> {
    this.busy = task()
      .catch((err: unknown) => {
        this.current = { state: 'failed', error: message(err), bytes: this.spec.bytes };
      })
      .finally(() => {
        this.busy = null;
      });
    return this.busy;
  }

  private async loadFiles(files: WhisperModelFiles): Promise<void> {
    this.current = { state: 'loading' };
    this.engine = await this.load(files);
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
      const response = await this.fetchImpl(spec.url);
      if (!response.ok || !response.body) {
        throw new Error(`The download failed (HTTP ${response.status})`);
      }
      const hash = createHash('sha256');
      let received = 0;
      const count = new Transform({
        transform: (chunk: Buffer, _enc, done) => {
          received += chunk.length;
          hash.update(chunk);
          this.current = { state: 'downloading', received, bytes: spec.bytes };
          done(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
        count,
        createWriteStream(part),
      );
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
  }
}
