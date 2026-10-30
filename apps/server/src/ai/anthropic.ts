// The live AI client: Anthropic's Messages API with the GM's own key (MC.1).
// Only used at the table; build runs and tests inject a fake `fetch` or use
// FixtureAiClient, and never call the paid API (LOOP Hard rules).
import {
  AiError,
  redactKey,
  type AiClient,
  type AiModelSettings,
  type AiReply,
  type AiRequest,
} from './client';

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

interface MessagesReply {
  model?: unknown;
  content?: unknown;
  usage?: { input_tokens?: unknown; output_tokens?: unknown };
}

export class AnthropicClient implements AiClient {
  constructor(
    private readonly key: () => string | null,
    private readonly models: () => AiModelSettings,
    private readonly fetchImpl: Fetch = (url, init) => fetch(url, init),
    /** A stalled network must not hang the GM's panel (MC.1 review round 2, M1). */
    private readonly timeoutMs = 60_000,
  ) {}

  async complete(request: AiRequest): Promise<AiReply> {
    const key = this.key();
    if (key === null) {
      throw new AiError('No API key is set: add one in Co-DM settings', 'no-key');
    }
    const model = this.models()[request.role];
    const timeoutMs = request.timeoutMs ?? this.timeoutMs;
    let res: Response;
    try {
      res = await this.fetchImpl(ANTHROPIC_URL, {
        method: 'POST',
        signal: request.signal
          ? AbortSignal.any([AbortSignal.timeout(timeoutMs), request.signal])
          : AbortSignal.timeout(timeoutMs),
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: request.messages,
          ...(request.onText ? { stream: true } : {}),
        }),
      });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      throw new AiError(`Could not reach the API: ${redactKey(why, key)}`, 'network');
    }
    if (!res.ok) {
      const body = redactKey(await res.text().catch(() => ''), key).slice(0, 300);
      const kind =
        res.status === 401 || res.status === 403
          ? 'auth'
          : res.status === 429 || res.status === 529
            ? 'rate-limit'
            : 'bad-reply';
      const lead =
        kind === 'auth'
          ? 'The API refused the key'
          : kind === 'rate-limit'
            ? 'The API is busy or rate-limited; try again shortly'
            : `The API answered ${res.status}`;
      throw new AiError(body ? `${lead} (${body})` : lead, kind);
    }
    if (request.onText) return readStream(res, model, request.onText, key);
    const data = (await res.json().catch(() => null)) as MessagesReply | null;
    const blocks = Array.isArray(data?.content) ? (data.content as unknown[]) : null;
    const input = data?.usage?.input_tokens;
    const output = data?.usage?.output_tokens;
    if (blocks === null || typeof input !== 'number' || typeof output !== 'number') {
      throw new AiError('The API reply was not in the expected shape', 'bad-reply');
    }
    const text = blocks
      .map((b) =>
        typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'text'
          ? String((b as { text?: unknown }).text ?? '')
          : '',
      )
      .join('');
    return {
      text,
      model: typeof data?.model === 'string' ? data.model : model,
      usage: { inputTokens: input, outputTokens: output },
    };
  }
}

/**
 * MD.1: reads a streamed Messages reply (server-sent events), passing each
 * text delta on as it arrives; resolves with the whole text and the usage.
 */
export async function readStream(
  res: Response,
  fallbackModel: string,
  onText: (delta: string) => void,
  key?: string,
): Promise<AiReply> {
  if (!res.body) throw new AiError('The API reply was not in the expected shape', 'bad-reply');
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let model = fallbackModel;
  let input: number | null = null;
  let output: number | null = null;
  let stopped = false;
  const handle = (data: string) => {
    let event: {
      type?: unknown;
      message?: { model?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown } };
      delta?: { type?: unknown; text?: unknown };
      usage?: { output_tokens?: unknown; input_tokens?: unknown };
      error?: { message?: unknown };
    };
    try {
      event = JSON.parse(data) as typeof event;
    } catch {
      return;
    }
    if (event.type === 'message_start') {
      if (typeof event.message?.model === 'string') model = event.message.model;
      const u = event.message?.usage;
      if (typeof u?.input_tokens === 'number') input = u.input_tokens;
      if (typeof u?.output_tokens === 'number') output = u.output_tokens;
    } else if (event.type === 'content_block_delta') {
      if (event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
        text += event.delta.text;
        onText(event.delta.text);
      }
    } else if (event.type === 'message_delta') {
      if (typeof event.usage?.output_tokens === 'number') output = event.usage.output_tokens;
      if (typeof event.usage?.input_tokens === 'number') input = event.usage.input_tokens;
    } else if (event.type === 'message_stop') {
      stopped = true;
    } else if (event.type === 'error') {
      const why = typeof event.error?.message === 'string' ? event.error.message : 'stream error';
      throw new AiError(`The API stopped mid-answer (${redactKey(why, key)})`, 'bad-reply');
    }
  };
  const drain = (final: boolean) => {
    const parts = buffer.split(/\r?\n\r?\n/u);
    buffer = final ? '' : (parts.pop() ?? '');
    for (const part of parts) {
      const data = part
        .split(/\r?\n/u)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data !== '') handle(data);
    }
  };
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      drain(false);
    }
  } catch (e) {
    if (e instanceof AiError) throw e;
    const why = e instanceof Error ? e.message : String(e);
    throw new AiError(`The answer was cut off: ${redactKey(why, key)}`, 'network');
  }
  buffer += decoder.decode();
  drain(true);
  if (!stopped || input === null || output === null) {
    throw new AiError('The API answer ended early', 'bad-reply');
  }
  return { text, model, usage: { inputTokens: input, outputTokens: output } };
}
