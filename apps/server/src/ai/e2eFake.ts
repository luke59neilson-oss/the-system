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
import type { SpeechToText } from '../speech/stt';

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

/** The fake pair when the env switch is exactly "1"; null otherwise. */
export function e2eFakeFromEnv(env: NodeJS.ProcessEnv): {
  cipher: SecretCipher;
  makeClient: (key: () => string | null, models: () => AiModelSettings) => AiClient;
  speech: SpeechToText;
} | null {
  return env[E2E_FAKE_AI_ENV] === '1'
    ? { cipher: e2eFakeCipher, makeClient: e2eFakeClient, speech: e2eFakeSpeech() }
    : null;
}
