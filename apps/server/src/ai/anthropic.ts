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
  ) {}

  async complete(request: AiRequest): Promise<AiReply> {
    const key = this.key();
    if (key === null) {
      throw new AiError('No API key is set: add one in Co-DM settings', 'no-key');
    }
    const model = this.models()[request.role];
    let res: Response;
    try {
      res = await this.fetchImpl(ANTHROPIC_URL, {
        method: 'POST',
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
