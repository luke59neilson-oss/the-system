import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SpeechModel,
  WESPEAKER_EN_CAMPP,
  WHISPER_TINY_EN,
  extractMembers,
  installedFiles,
  type SpeechModelSpec,
} from '../src/speech/model';
import { registerListenRoutes } from '../src/speech/routes';
import type { SpeakerEmbedder } from '../src/speech/speakers';
import { FixtureSpeechToText } from '../src/speech/stt';
import type { WhisperModelFiles } from '../src/speech/sherpa';

// MC.5 (D236): the first-use model download, offline. The archive is a tiny
// stand-in with the real layout (a folder, the int8 files, files to skip).
const here = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE = path.join(here, 'fixtures', 'speech', 'fake-model.tar.bz2');
const bytes = readFileSync(ARCHIVE);
const spec: SpeechModelSpec = {
  ...WHISPER_TINY_EN,
  url: 'https://example.invalid/fake-model.tar.bz2',
  sha256: 'cd725da26245514fe00b7a975cf6047ff95e47de425231493aa07ad41e05a67d',
  bytes: bytes.length,
};

const dirs: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'the-system-model-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const serve = (body: Buffer, status = 200) => {
  const calls: string[] = [];
  const fetchImpl = ((url: string) => {
    calls.push(url);
    return Promise.resolve(new Response(new Uint8Array(body), { status }));
  }) as typeof fetch;
  return { calls, fetchImpl };
};

const recorder = () => {
  const loaded: WhisperModelFiles[] = [];
  const stt = new FixtureSpeechToText(['hello']);
  return {
    loaded,
    stt,
    load: (files: WhisperModelFiles) => {
      loaded.push(files);
      return Promise.resolve(stt);
    },
  };
};

describe('speech model download (MC.5, D236)', () => {
  it('pins the real model: GitHub releases, int8 files, a checksum', () => {
    expect(WHISPER_TINY_EN.url).toMatch(/^https:\/\/github\.com\/k2-fsa\/sherpa-onnx\/releases\//);
    expect(WHISPER_TINY_EN.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.values(WHISPER_TINY_EN.files).every((f) => /int8|tokens/.test(f))).toBe(true);
  });

  it('extracts only the named members, flattening their folder', async () => {
    const to = path.join(tempDir(), 'out');
    const written = await extractMembers(ARCHIVE, to, [
      'tiny.en-encoder.int8.onnx',
      'tiny.en-tokens.txt',
    ]);
    expect(written.sort()).toEqual(['tiny.en-encoder.int8.onnx', 'tiny.en-tokens.txt']);
    expect(readdirSync(to).sort()).toEqual(['tiny.en-encoder.int8.onnx', 'tiny.en-tokens.txt']);
    expect(readFileSync(path.join(to, 'tiny.en-encoder.int8.onnx'), 'utf8')).toBe('ENC');
  });

  it('starts missing, downloads once, keeps only the model files and loads them', async () => {
    const dir = tempDir();
    const { calls, fetchImpl } = serve(bytes);
    const rec = recorder();
    const model = new SpeechModel({ dir, spec, fetch: fetchImpl, load: rec.load });
    await model.init();
    expect(model.status()).toEqual({ state: 'missing', bytes: bytes.length });
    expect(model.stt()).toBeNull();
    // Two clicks while it runs share one download.
    await Promise.all([model.download(), model.download()]);
    expect(calls).toEqual([spec.url]);
    expect(model.status()).toEqual({ state: 'ready' });
    expect(model.stt()).toBe(rec.stt);
    expect(readdirSync(dir)).toEqual([spec.name]);
    expect(readdirSync(path.join(dir, spec.name)).sort()).toEqual(Object.values(spec.files).sort());
    expect(rec.loaded).toEqual([installedFiles(dir, spec)]);
    // Ready: no second download.
    await model.download();
    expect(calls).toHaveLength(1);
  });

  it('loads a model downloaded earlier at startup, with no network', async () => {
    const dir = tempDir();
    await new SpeechModel({
      dir,
      spec,
      fetch: serve(bytes).fetchImpl,
      load: recorder().load,
    }).download();
    const { calls, fetchImpl } = serve(bytes);
    const rec = recorder();
    const model = new SpeechModel({ dir, spec, fetch: fetchImpl, load: rec.load });
    await model.init();
    expect(model.status()).toEqual({ state: 'ready' });
    expect(calls).toEqual([]);
    expect(rec.loaded).toHaveLength(1);
  });

  it('reports download progress', async () => {
    const dir = tempDir();
    const half = Math.floor(bytes.length / 2);
    let push: ReadableStreamDefaultController<Uint8Array> | null = null;
    let asked: () => void = () => undefined;
    const fetched = new Promise<void>((resolve) => (asked = resolve));
    const fetchImpl = (() => {
      asked();
      const body = new ReadableStream<Uint8Array>({ start: (c) => void (push = c) });
      return Promise.resolve(new Response(body));
    }) as typeof fetch;
    const model = new SpeechModel({ dir, spec, fetch: fetchImpl, load: recorder().load });
    const run = model.download();
    await fetched;
    push!.enqueue(new Uint8Array(bytes.subarray(0, half)));
    await expect
      .poll(() => model.status())
      .toEqual({
        state: 'downloading',
        received: half,
        bytes: bytes.length,
      });
    push!.enqueue(new Uint8Array(bytes.subarray(half)));
    push!.close();
    await run;
    expect(model.status()).toEqual({ state: 'ready' });
  });

  it('refuses a download that fails its checksum and leaves nothing behind', async () => {
    const dir = tempDir();
    const tampered = Buffer.from(bytes);
    tampered.writeUInt8(tampered.readUInt8(tampered.length - 1) ^ 0xff, tampered.length - 1);
    const rec = recorder();
    const model = new SpeechModel({ dir, spec, fetch: serve(tampered).fetchImpl, load: rec.load });
    await model.download();
    expect(model.status()).toEqual({
      state: 'failed',
      error: 'The downloaded model did not match its checksum; try again',
      bytes: bytes.length,
    });
    expect(model.stt()).toBeNull();
    expect(rec.loaded).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);
    // Trying again with a good download works.
    const retry = new SpeechModel({ dir, spec, fetch: serve(bytes).fetchImpl, load: rec.load });
    await retry.download();
    expect(retry.status()).toEqual({ state: 'ready' });
  });

  it('reports an HTTP error, a loader error and an archive without the files', async () => {
    const http = new SpeechModel({ dir: tempDir(), spec, fetch: serve(bytes, 404).fetchImpl });
    await http.download();
    expect(http.status()).toMatchObject({
      state: 'failed',
      error: 'The download failed (HTTP 404)',
    });

    const broken = new SpeechModel({
      dir: tempDir(),
      spec,
      fetch: serve(bytes).fetchImpl,
      load: () => Promise.reject(new Error('no engine')),
    });
    await broken.download();
    expect(broken.status()).toMatchObject({ state: 'failed', error: 'no engine' });

    const dir = tempDir();
    const wrong = new SpeechModel({
      dir,
      spec: { ...spec, files: { ...spec.files, encoder: 'base.en-encoder.int8.onnx' } },
      fetch: serve(bytes).fetchImpl,
      load: recorder().load,
    });
    await wrong.download();
    expect(wrong.status()).toMatchObject({
      state: 'failed',
      error: 'The model archive lacks base.en-encoder.int8.onnx',
    });
    expect(readdirSync(dir)).toEqual([]);
  });

  it('a half-installed model is downloaded again, not loaded', async () => {
    const dir = tempDir();
    const folder = path.join(dir, spec.name);
    await new SpeechModel({
      dir,
      spec,
      fetch: serve(bytes).fetchImpl,
      load: recorder().load,
    }).download();
    rmSync(path.join(folder, spec.files.decoder));
    expect(installedFiles(dir, spec)).toBeNull();
    const rec = recorder();
    const model = new SpeechModel({ dir, spec, fetch: serve(bytes).fetchImpl, load: rec.load });
    await model.init();
    expect(model.status().state).toBe('missing');
    await model.download();
    expect(existsSync(path.join(folder, spec.files.decoder))).toBe(true);
    expect(model.status()).toEqual({ state: 'ready' });
  });
});

describe('listen routes with a downloadable model (MC.5, D236)', () => {
  const GM = 'k'.repeat(32);
  const build = async (dir: string, fetchImpl: typeof fetch) => {
    const model = new SpeechModel({ dir, spec, fetch: fetchImpl, load: recorder().load });
    const app = Fastify();
    app.addHook('onRequest', async (request, reply) => {
      if (request.headers['x-gm-key'] !== GM) await reply.code(403).send({ error: 'GM only' });
    });
    registerListenRoutes(app, {
      active: () => null,
      stt: () => model.stt(),
      model,
      now: () => 0,
    });
    await app.ready();
    return { app, model };
  };

  it('reports the model and starts its download on request', async () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'keep.txt'), 'other files stay');
    const { app, model } = await build(dir, serve(bytes).fetchImpl);
    const headers = { 'x-gm-key': GM };
    const before = await app.inject({ method: 'GET', url: '/api/gm/listen', headers });
    expect(before.json()).toMatchObject({
      available: false,
      model: { state: 'missing', bytes: bytes.length },
    });
    const denied = await app.inject({ method: 'POST', url: '/api/gm/listen/model' });
    expect(denied.statusCode).toBe(403);
    const start = await app.inject({ method: 'POST', url: '/api/gm/listen/model', headers });
    expect(start.statusCode).toBe(200);
    expect(start.json().model.state).toBe('downloading');
    await model.download();
    const after = await app.inject({ method: 'GET', url: '/api/gm/listen', headers });
    expect(after.json()).toMatchObject({ available: true, model: { state: 'ready' } });
    expect(readFileSync(path.join(dir, 'keep.txt'), 'utf8')).toBe('other files stay');
    await app.close();
  });

  it('a server without a model says so', async () => {
    const app = Fastify();
    registerListenRoutes(app, { active: () => null, stt: () => null, now: () => 0 });
    const status = await app.inject({ method: 'GET', url: '/api/gm/listen' });
    expect(status.json()).toMatchObject({ available: false, model: null });
    const start = await app.inject({ method: 'POST', url: '/api/gm/listen/model' });
    expect(start.statusCode).toBe(404);
    await app.close();
  });
});

describe('speech model failure states (MC.5 review)', () => {
  it('abandons a download that stalls, and a retry works', async () => {
    const dir = tempDir();
    const stalled = ((_url: string, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array(bytes.subarray(0, 10)));
          init?.signal?.addEventListener('abort', () => c.error(new Error('aborted')));
        },
      });
      return Promise.resolve(new Response(body));
    }) as typeof fetch;
    const rec = recorder();
    const model = new SpeechModel({ dir, spec, fetch: stalled, load: rec.load, idleMs: 50 });
    await model.download();
    expect(model.status()).toMatchObject({
      state: 'failed',
      error: 'The download stalled; try again',
    });
    expect(readdirSync(dir)).toEqual([]);
    const retry = new SpeechModel({ dir, spec, fetch: serve(bytes).fetchImpl, load: rec.load });
    await retry.download();
    expect(retry.status()).toEqual({ state: 'ready' });
  });

  it('refuses a download larger than the model', async () => {
    const model = new SpeechModel({
      dir: tempDir(),
      spec,
      fetch: serve(Buffer.concat([bytes, Buffer.alloc(10)])).fetchImpl,
      load: recorder().load,
    });
    await model.download();
    expect(model.status()).toMatchObject({
      state: 'failed',
      error: 'The download was larger than the model; try again',
    });
  });

  it('a load failure says so, and trying again reloads without downloading', async () => {
    const dir = tempDir();
    await new SpeechModel({
      dir,
      spec,
      fetch: serve(bytes).fetchImpl,
      load: recorder().load,
    }).download();
    const { calls, fetchImpl } = serve(bytes);
    let fail = true;
    const rec = recorder();
    const model = new SpeechModel({
      dir,
      spec,
      fetch: fetchImpl,
      load: (files) => (fail ? Promise.reject(new Error('no addon')) : rec.load(files)),
    });
    await model.init();
    expect(model.status()).toMatchObject({ state: 'failed', error: 'no addon', loadFailed: true });
    fail = false;
    await model.download();
    expect(model.status()).toEqual({ state: 'ready' });
    expect(calls).toEqual([]);
  });
});

// MC.6 (D238): the speaker model, one checked .onnx file fetched after Whisper.
describe('speaker model download (MC.6, D238)', () => {
  const onnx = Buffer.from('SPEAKER-ONNX');
  const speaker = {
    ...WESPEAKER_EN_CAMPP,
    url: 'https://example.invalid/speaker.onnx',
    sha256: createHash('sha256').update(onnx).digest('hex'),
    bytes: onnx.length,
  };
  const embedder: SpeakerEmbedder = { embed: () => Promise.resolve([1, 0]) };
  // Answers the archive for Whisper and the .onnx for the speaker model.
  const both = (speakerBody: Buffer = onnx) => {
    const calls: string[] = [];
    const fetchImpl = ((url: string) => {
      calls.push(url);
      const body = url === speaker.url ? speakerBody : bytes;
      return Promise.resolve(new Response(new Uint8Array(body)));
    }) as typeof fetch;
    return { calls, fetchImpl };
  };

  it('pins the real model: GitHub releases, one .onnx file, a checksum', () => {
    expect(WESPEAKER_EN_CAMPP.url).toMatch(
      /^https:\/\/github\.com\/k2-fsa\/sherpa-onnx\/releases\/download\/speaker-recongition-models\//,
    );
    expect(WESPEAKER_EN_CAMPP.url.endsWith(WESPEAKER_EN_CAMPP.file)).toBe(true);
    expect(WESPEAKER_EN_CAMPP.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('downloads after Whisper, checks it and loads it; a later start loads it offline', async () => {
    const dir = tempDir();
    const { calls, fetchImpl } = both();
    const loadedFiles: string[] = [];
    const options = {
      dir,
      spec,
      speaker,
      fetch: fetchImpl,
      load: recorder().load,
      loadSpeaker: (file: string) => {
        loadedFiles.push(file);
        return Promise.resolve(embedder);
      },
    };
    const model = new SpeechModel(options);
    expect(model.speakerStatus()).toEqual({ state: 'missing' });
    expect(model.speakers()).toBeNull();
    await model.download();
    expect(calls).toEqual([spec.url, speaker.url]);
    expect(model.status()).toEqual({ state: 'ready' });
    expect(model.speakerStatus()).toEqual({ state: 'ready' });
    expect(model.speakers()).toBe(embedder);
    expect(readdirSync(path.join(dir, speaker.name))).toEqual([speaker.file]);
    expect(loadedFiles).toEqual([path.join(dir, speaker.name, speaker.file)]);

    const again = new SpeechModel({ ...options, fetch: serve(Buffer.alloc(0), 500).fetchImpl });
    await again.init();
    expect(again.speakers()).toBe(embedder);
    expect(again.stt()).not.toBeNull();
  });

  it('a bad speaker download only loses labels; pressing Download again fetches just it', async () => {
    const dir = tempDir();
    const bad = both(Buffer.from('SPEAKER-0NNX'));
    const model = new SpeechModel({
      dir,
      spec,
      speaker,
      fetch: bad.fetchImpl,
      load: recorder().load,
      loadSpeaker: () => Promise.resolve(embedder),
    });
    await model.download();
    expect(model.status()).toEqual({ state: 'ready' });
    expect(model.stt()).not.toBeNull();
    expect(model.speakerStatus()).toEqual({
      state: 'failed',
      error: 'The downloaded model did not match its checksum; try again',
    });
    expect(existsSync(path.join(dir, speaker.name, `${speaker.file}.part`))).toBe(false);

    const good = both();
    const retry = new SpeechModel({
      dir,
      spec,
      speaker,
      fetch: good.fetchImpl,
      load: recorder().load,
      loadSpeaker: () => Promise.resolve(embedder),
    });
    await retry.init();
    expect(retry.speakers()).toBeNull();
    await retry.download();
    expect(good.calls).toEqual([speaker.url]);
    expect(retry.speakers()).toBe(embedder);
  });

  it('a server without a speaker model reports none', () => {
    const model = new SpeechModel({ dir: tempDir(), spec, fetch: serve(bytes).fetchImpl });
    expect(model.speakerStatus()).toBeNull();
  });
});
