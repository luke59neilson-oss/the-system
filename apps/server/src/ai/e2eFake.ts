// TEST ONLY (MC.1 review round 2, M2): a stand-in cipher and AI client for
// the e2e suite, so the key-saved path of the co-DM settings (save, test,
// spend, remove) runs end to end without Electron and without the paid API
// (LOOP Hard rules). It is switched on only by THE_SYSTEM_E2E_FAKE_AI=1 on
// the terminal server; the desktop app never reads it. The cipher refuses
// any key that is not an obvious test key (`sk-ant-e2e-…`), so a real key
// can never be stored with it.
import { AiError, type AiClient, type AiModelSettings } from './client';
import { FixtureAiClient, streamPieces } from './fake';
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
      const last = request.messages[request.messages.length - 1]?.content ?? '';
      if (request.role === 'fast' && last.startsWith('Practice drafts.')) {
        return Promise.resolve({
          text: e2ePracticeDrafts(last),
          model: models().fast,
          usage: { inputTokens: 500, outputTokens: 50 },
        });
      }
      if (request.role === 'fast' && last.startsWith('Suggestions.')) {
        return Promise.resolve({
          text: e2eSuggestions(last),
          model: models().fast,
          usage: { inputTokens: 400, outputTokens: 60 },
        });
      }
      if (last.startsWith('Quick response.')) {
        const text = e2eQuickResponse(last, request.role);
        return (async () => {
          for (const piece of streamPieces(text)) {
            if (request.signal?.aborted) throw new AiError('The request was cancelled', 'network');
            request.onText?.(piece);
            await new Promise((r) => setTimeout(r, 15));
          }
          return {
            text,
            model: models()[request.role],
            usage: { inputTokens: 600, outputTokens: 60 },
          };
        })();
      }
      if (request.role === 'fast' && last.startsWith('Prepare ahead.')) {
        return Promise.resolve({
          text: e2ePrepareAhead(last),
          model: models().fast,
          usage: { inputTokens: 300, outputTokens: 40 },
        });
      }
      const fixtures = new FixtureAiClient(
        [
          { role: 'fast', match: 'Connection test', text: 'ready', usage: E2E_TEST_USAGE },
          ...GENERATE_FIXTURES,
          // MC.9, TEST ONLY: running notes and the session summary.
          {
            role: 'fast',
            match: 'Session notes.',
            text: '{"notes": ["The party asked about a herbalist", "Jake readied an arrow"]}',
          },
          {
            role: 'fast',
            match: 'Session summary.',
            text: JSON.stringify({
              whatHappened: 'The party looked for a herbalist and Jake readied his bow.',
              whoDidWhat: [{ character: 'Jake', did: 'Nocked an arrow and waited' }],
              openThreads: ['Find the herbalist'],
              npcsMet: [],
            }),
          },
        ],
        models(),
      );
      return fixtures.complete(request);
    },
  };
}

/**
 * MC.8, TEST ONLY: the fast model's suggestion chips. A numbered line that
 * mentions an herbalist becomes a Generate shop chip; one about an arrow, a
 * Complication encounter chip.
 */
export function e2eSuggestions(prompt: string): string {
  const chips: { line: number; type: string; kind: string; title: string; request: string }[] = [];
  for (const m of prompt.matchAll(/^(\d+)\. (?:\[[^\]]*\] )?(.*)$/gmu)) {
    const line = Number(m[1]);
    const text = m[2] ?? '';
    if (/herbalist/iu.test(text) && !chips.some((c) => c.kind === 'shop')) {
      chips.push({
        line,
        type: 'generate',
        kind: 'shop',
        title: 'Herbalist shop',
        request: 'An herbalist the party can reach before the canyon',
      });
    }
    if (/arrow/iu.test(text) && !chips.some((c) => c.kind === 'encounter')) {
      chips.push({
        line,
        type: 'complication',
        kind: 'encounter',
        title: 'Pale hunters close in',
        request: 'Pale hunters notice the drawn bow',
      });
    }
  }
  return JSON.stringify({ chips });
}

/**
 * MC.10, TEST ONLY: where the table is heading. A numbered line about an
 * herbalist means the party is off to find one (a shop); otherwise nowhere.
 */
export function e2ePrepareAhead(prompt: string): string {
  for (const m of prompt.matchAll(/^(\d+)\. (?:\[[^\]]*\] )?(.*)$/gmu)) {
    if (/herbalist/iu.test(m[2] ?? '')) {
      return JSON.stringify({
        heading: {
          line: Number(m[1]),
          kind: 'shop',
          place: 'Herbalist',
          request: 'The herbalist the party is heading to, before the canyon',
        },
      });
    }
  }
  return JSON.stringify({ heading: null });
}

/**
 * MC.7, TEST ONLY: the fast model's practice drafts. A line that names a
 * party member and says "nocks an arrow" is a use of their first skill; the
 * herbalist line is talk, not a use.
 */
export function e2ePracticeDrafts(prompt: string): string {
  const party = [...prompt.matchAll(/^- (.+?): (.+)$/gmu)].map((m) => ({
    name: m[1]!,
    skill: m[2]!.split(', ')[0]!,
  }));
  const drafts = [...prompt.matchAll(/^(\d+)\. (?:\[[^\]]*\] )?(.*)$/gmu)].flatMap((m) => {
    const who = party.find((p) => m[2]!.includes(p.name));
    return who && m[2]!.includes('nocks an arrow')
      ? [
          {
            line: Number(m[1]),
            character: who.name,
            skill: who.skill,
            action: 'Nocks an arrow and waits for the shot',
            confidence: 'high',
          },
        ]
      : [];
  });
  return JSON.stringify({ drafts });
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

/**
 * MD.1, TEST ONLY: a quick response that names the button, the line it
 * answers and the NPC, so the e2e can tell retargeting and edited
 * instructions reached the prompt. The strong model (Richer) says so.
 */
export function e2eQuickResponse(prompt: string, role: 'fast' | 'strong'): string {
  const field = (name: string) =>
    new RegExp(`^${name}: (.*)$`, 'mu').exec(prompt)?.[1]?.trim() ?? '';
  const button = field('Button');
  const line = field('Answer this line').replace(/^"|"$/gu, '');
  const npc = field('NPC in the scene');
  const instruction = field('Instruction');
  return [
    `SAY: ${role === 'strong' ? '(richer) ' : ''}${button} to "${line}"`,
    `- NPC: ${npc}`,
    `- Instruction: ${instruction}`,
    '- A pale glow pulses under the skin of the canyon',
  ].join('\n');
}
