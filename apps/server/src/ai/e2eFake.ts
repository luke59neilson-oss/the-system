// TEST ONLY (MC.1 review round 2, M2): a stand-in cipher and AI client for
// the e2e suite, so the key-saved path of the co-DM settings (save, test,
// spend, remove) runs end to end without Electron and without the paid API
// (LOOP Hard rules). It is switched on only by THE_SYSTEM_E2E_FAKE_AI=1 on
// the terminal server; the desktop app never reads it. The cipher refuses
// any key that is not an obvious test key (`sk-ant-e2e-…`), so a real key
// can never be stored with it.
import { AiError, type AiClient, type AiModelSettings } from './client';
import { FixtureAiClient } from './fake';
import { GENERATE_FIXTURES } from './fixtures/generate';
import type { SecretCipher } from './keyStore';
import type { SpeakerEmbedder } from '../speech/speakers';
import type { SpeechToText } from '../speech/stt';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SpeechModel, WHISPER_TINY_EN } from '../speech/model';

export const E2E_FAKE_AI_ENV = 'THE_SYSTEM_E2E_FAKE_AI';
export const E2E_KEY_PREFIX = 'sk-ant-e2e-';
const MARK = 'e2e-fake:';

/** Recorded usage for the connection test: 1,000 in + 10 out on haiku = $0.001. */
export const E2E_TEST_USAGE = { inputTokens: 1000, outputTokens: 10 };

export const e2eFakeCipher: SecretCipher = {
  isAvailable: () => true,
  encrypt(plain) {
    if (!plain.startsWith(E2E_KEY_PREFIX)) {
      throw new Error('The e2e fake cipher only stores test keys');
    }
    // Not encryption: just enough that the file never holds the key verbatim.
    return Buffer.from(MARK + Buffer.from(plain, 'utf8').toString('base64'), 'utf8');
  },
  decrypt(data) {
    const text = data.toString('utf8');
    if (!text.startsWith(MARK)) throw new Error('Not an e2e fake key file');
    return Buffer.from(text.slice(MARK.length), 'base64').toString('utf8');
  },
};

/** Like the live client, the fake refuses to answer without a saved key. */
export function e2eFakeClient(key: () => string | null, models: () => AiModelSettings): AiClient {
  return {
    complete(request) {
      if (key() === null) {
        return Promise.reject(
          new AiError('No API key is set: add one in Co-DM settings', 'no-key'),
        );
      }
      const fixtures = new FixtureAiClient(
        [
          { role: 'fast', match: 'Connection test', text: 'ready', usage: E2E_TEST_USAGE },
          ...GENERATE_FIXTURES,
        ],
        models(),
      );
      return fixtures.complete(request);
    },
  };
}

/** MC.5: what the fake recognizer "hears", one line per speech segment, in a loop. */
export const E2E_SPEECH_LINES = [
  'We should find an herbalist before the canyon.',
  'Jake nocks an arrow and waits.',
];

/** A stand-in recognizer: each segment is the next scripted line (no model, no audio kept). */
export function e2eFakeSpeech(): SpeechToText {
  let n = 0;
  return {
    transcribe: () => Promise.resolve(E2E_SPEECH_LINES[n++ % E2E_SPEECH_LINES.length] ?? ''),
  };
}

/**
 * MC.6, TEST ONLY: Chromium's fake mic is one beep for everyone, so the fake
 * embedder scripts the voices by call order: the first two calls (the e2e
 * enrols Jake, then Miranda) are their voice prints; after that transcript
 * lines alternate a voice near Jake's and one near Miranda's, matching
 * E2E_SPEECH_LINES (the herbalist line is Jake's).
 */
export function e2eFakeSpeakers(): SpeakerEmbedder {
  const voices = [
    [1, 0, 0],
    [0, 1, 0],
  ];
  const lines = [
    [0.95, 0.1, 0.05],
    [0.1, 0.95, 0.05],
  ];
  let n = 0;
  return {
    embed: () => {
      const i = n++;
      return Promise.resolve([...(voices[i] ?? lines[(i - voices.length) % lines.length]!)]);
    },
  };
}

/**
 * MC.5 (D236), TEST ONLY: a speech model "downloaded" from a local archive
 * (`THE_SYSTEM_E2E_SPEECH_ARCHIVE`) into `<dataDir>/models`, loading the
 * fake recognizer, so the e2e suite can press Download with no network.
 */
export const E2E_SPEECH_ARCHIVE_ENV = 'THE_SYSTEM_E2E_SPEECH_ARCHIVE';

export function e2eFakeSpeechModel(archive: string, dataDir: string): SpeechModel {
  const bytes = readFileSync(archive);
  return new SpeechModel({
    dir: path.join(dataDir, 'models'),
    spec: {
      ...WHISPER_TINY_EN,
      url: 'https://e2e.invalid/speech-model.tar.bz2',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    },
    fetch: (() => Promise.resolve(new Response(new Uint8Array(bytes)))) as typeof fetch,
    load: () => Promise.resolve(e2eFakeSpeech()),
  });
}

/** The fake pair when the env switch is exactly "1"; null otherwise. */
export function e2eFakeFromEnv(env: NodeJS.ProcessEnv): {
  cipher: SecretCipher;
  makeClient: (key: () => string | null, models: () => AiModelSettings) => AiClient;
  speech: SpeechToText;
  speakers: SpeakerEmbedder;
} | null {
  return env[E2E_FAKE_AI_ENV] === '1'
    ? {
        cipher: e2eFakeCipher,
        makeClient: e2eFakeClient,
        speech: e2eFakeSpeech(),
        speakers: e2eFakeSpeakers(),
      }
    : null;
}
