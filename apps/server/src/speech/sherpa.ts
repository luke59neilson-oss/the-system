// MC.5 (D235): the live on-laptop recognizer, sherpa-onnx with a Whisper
// model, loaded only when the desktop app finds the package and a downloaded
// model (downloaded on first use, model.ts). The unit tests and e2e use
// FixtureSpeechToText; `npm run test:speech` runs this on a real fixture. The
// native package stays outside the bundles (esbuild external) and is loaded
// at run time; the packaged desktop app loads its copy from resources.
import path from 'node:path';
import type { SpeakerEmbedder } from './speakers';
import type { SpeechToText } from './stt';

/** Files a Whisper model folder must hold (sherpa-onnx's int8 export). */
export interface WhisperModelFiles {
  readonly encoder: string;
  readonly decoder: string;
  readonly tokens: string;
}

export function whisperModelFiles(dir: string, name: string): WhisperModelFiles {
  return {
    encoder: path.join(dir, `${name}-encoder.int8.onnx`),
    decoder: path.join(dir, `${name}-decoder.int8.onnx`),
    tokens: path.join(dir, `${name}-tokens.txt`),
  };
}

interface SherpaStream {
  acceptWaveform(o: { sampleRate: number; samples: Float32Array }): void;
}
interface SherpaRecognizer {
  createStream(): SherpaStream;
  decodeAsync(stream: SherpaStream): Promise<{ text?: string }>;
}
interface SherpaModule {
  OfflineRecognizer: { createAsync(config: unknown): Promise<SherpaRecognizer> };
}

/** Loads sherpa-onnx with the model; rejects when the package or model is missing. */
export async function sherpaSpeechToText(
  files: WhisperModelFiles,
  load: () => Promise<unknown> = () => import('sherpa-onnx-node' as string),
): Promise<SpeechToText> {
  const loaded = (await load()) as SherpaModule & { default?: SherpaModule };
  // A CommonJS package imported from ESM arrives as its `default` export.
  const mod = loaded.default?.OfflineRecognizer ? loaded.default : loaded;
  const recognizer = await mod.OfflineRecognizer.createAsync({
    featConfig: { sampleRate: 16_000, featureDim: 80 },
    modelConfig: {
      whisper: {
        encoder: files.encoder,
        decoder: files.decoder,
        language: 'en',
        task: 'transcribe',
      },
      tokens: files.tokens,
      numThreads: 2,
      provider: 'cpu',
    },
  });
  return {
    async transcribe(samples, sampleRate) {
      const stream = recognizer.createStream();
      stream.acceptWaveform({ sampleRate, samples });
      const result = await recognizer.decodeAsync(stream);
      return (result.text ?? '').trim();
    },
  };
}

// MC.6 (D238): voice embeddings for speaker labels, sherpa-onnx's
// SpeakerEmbeddingExtractor with a downloaded speaker model (one .onnx file).
interface SherpaEmbedStream {
  acceptWaveform(o: { sampleRate: number; samples: Float32Array }): void;
  inputFinished(): void;
}
interface SherpaExtractor {
  createStream(): SherpaEmbedStream;
  isReady(stream: SherpaEmbedStream): boolean;
  compute(stream: SherpaEmbedStream, enableExternalBuffer?: boolean): Float32Array;
}
interface SherpaSpeakerModule {
  SpeakerEmbeddingExtractor: new (config: unknown) => SherpaExtractor;
}

/** Loads the speaker-embedding extractor; rejects when the package or model is missing. */
export async function sherpaSpeakerEmbedder(
  model: string,
  load: () => Promise<unknown> = () => import('sherpa-onnx-node' as string),
): Promise<SpeakerEmbedder> {
  const loaded = (await load()) as SherpaSpeakerModule & { default?: SherpaSpeakerModule };
  const mod = loaded.default?.SpeakerEmbeddingExtractor ? loaded.default : loaded;
  const extractor = new mod.SpeakerEmbeddingExtractor({ model, numThreads: 1, provider: 'cpu' });
  return {
    embed(samples, sampleRate) {
      const stream = extractor.createStream();
      stream.acceptWaveform({ sampleRate, samples });
      stream.inputFinished();
      // Too little audio for the model to tell a voice: no label.
      if (!extractor.isReady(stream)) return Promise.resolve(null);
      return Promise.resolve(Array.from(extractor.compute(stream, false)));
    },
  };
}
