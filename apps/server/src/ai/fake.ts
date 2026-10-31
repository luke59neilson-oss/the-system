// Recorded-fixture AI client for tests and the build (MC.1). It never touches
// the network. A fixture matches a request by role and by a substring of the
// last user message; the first match wins, in order.
import {
  AiError,
  DEFAULT_AI_MODELS,
  type AiClient,
  type AiModelSettings,
  type AiReply,
  type AiRequest,
} from './client';

export interface AiFixture {
  readonly role?: AiRequest['role'];
  /** Matches when the last user message contains this text. */
  readonly match: string;
  readonly text: string;
  readonly usage?: { inputTokens: number; outputTokens: number };
  /** QF.49: the stop reason to report (e.g. `max_tokens` for a reply cut at its cap). */
  readonly stopReason?: string;
  /** Reply with this error instead of text. */
  readonly error?: { message: string; kind: AiError['kind'] };
  /** Answer only after this long (a slow model), unless the request is aborted first. */
  readonly delayMs?: number;
}

export class FixtureAiClient implements AiClient {
  /** Every request seen, for assertions. */
  readonly requests: AiRequest[] = [];

  constructor(
    private readonly fixtures: readonly AiFixture[],
    private readonly models: AiModelSettings = DEFAULT_AI_MODELS,
  ) {}

  complete(request: AiRequest): Promise<AiReply> {
    this.requests.push(request);
    const last = [...request.messages].reverse().find((m) => m.role === 'user');
    const prompt = last?.content ?? '';
    const fixture = this.fixtures.find(
      (f) => (f.role === undefined || f.role === request.role) && prompt.includes(f.match),
    );
    if (fixture === undefined) {
      return Promise.reject(
        new AiError(`No recorded reply for this ${request.role} request`, 'fixture'),
      );
    }
    if (fixture.error) {
      return Promise.reject(new AiError(fixture.error.message, fixture.error.kind));
    }
    const reply: AiReply = {
      text: fixture.text,
      model: this.models[request.role],
      usage: fixture.usage ?? {
        inputTokens: Math.ceil((request.system.length + prompt.length) / 4),
        outputTokens: Math.ceil(fixture.text.length / 4),
      },
      ...(fixture.stopReason !== undefined ? { stopReason: fixture.stopReason } : {}),
    };
    const delay = fixture.delayMs ?? 0;
    // MD.1: a streamed request hears the text in word-sized pieces first.
    const stream = () => {
      if (request.onText) for (const piece of streamPieces(fixture.text)) request.onText(piece);
    };
    if (delay <= 0) {
      stream();
      return Promise.resolve(reply);
    }
    return new Promise((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer);
        reject(new AiError('The request was cancelled', 'network'));
      };
      const timer = setTimeout(() => {
        request.signal?.removeEventListener('abort', stop);
        stream();
        resolve(reply);
      }, delay);
      if (request.signal?.aborted) stop();
      else request.signal?.addEventListener('abort', stop, { once: true });
    });
  }
}

/** Splits text into word-sized pieces that join back to the same text (MD.1 streaming). */
export function streamPieces(text: string): string[] {
  return text.match(/\s*\S+|\s+$/gu) ?? [];
}
