// Co-DM AI connection (MC.1, DESIGN §11). Every AI call goes through the
// AiClient interface: the live Anthropic client at the table (the GM's own
// key) and a recorded-fixture fake in tests. Build runs never call the paid
// API (LOOP Hard rules).

export type AiRole = 'fast' | 'strong';

export interface AiMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface AiRequest {
  /** Which configured model to use: fast (listening, chips) or strong (generation). */
  readonly role: AiRole;
  readonly system: string;
  readonly messages: readonly AiMessage[];
  readonly maxTokens: number;
  /** Overrides the client's default time limit (a long generation needs more; MC.2). */
  readonly timeoutMs?: number;
  /** Aborts the call, e.g. when the GM cancels or closes the panel (MC.2). */
  readonly signal?: AbortSignal;
  /**
   * MD.1: called with each piece of text as the model writes it (streamed).
   * The reply still resolves with the whole text and the usage.
   */
  readonly onText?: (delta: string) => void;
}

export interface AiUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface AiReply {
  readonly text: string;
  /** The model id that answered. */
  readonly model: string;
  readonly usage: AiUsage;
  /**
   * QF.49: why the model stopped, as the API reports it (`end_turn`,
   * `max_tokens`, ...); absent when unknown (recorded fixtures).
   */
  readonly stopReason?: string;
}

export interface AiClient {
  complete(request: AiRequest): Promise<AiReply>;
}

/** An AI call that failed; the message is safe to show the GM (never holds the key). */
export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'no-key' | 'auth' | 'rate-limit' | 'network' | 'bad-reply' | 'fixture',
    /**
     * MD.1 review M2: what a streamed call had already used (and is billed for)
     * when it was cut off or cancelled, so the spend counter still counts it.
     */
    readonly partial?: AiReply,
  ) {
    super(message);
  }
}

export interface AiModelSettings {
  /** Model id for listening and suggestions (DESIGN §11: Claude Haiku). */
  readonly fast: string;
  /** Model id for generation (DESIGN §11: Claude Sonnet). */
  readonly strong: string;
}

/** Defaults; the GM can change both in settings (D226; QF.51 current models). */
export const DEFAULT_AI_MODELS: AiModelSettings = {
  fast: 'claude-haiku-5-5',
  strong: 'claude-sonnet-5-5',
};

/** US dollars per million tokens, input and output. */
export interface ModelPrice {
  readonly input: number;
  readonly output: number;
}

interface ListedPrice extends ModelPrice {
  /** A higher price for the whole call once its prompt passes `above` input tokens. */
  readonly long?: ModelPrice & { readonly above: number };
}

/**
 * QF.51: list prices per model id (platform.claude.com pricing, 2026-10,
 * as recorded in ROADMAP QF.51). A dated id ("claude-sonnet-4-5-20250929")
 * takes its base id's price.
 */
export const MODEL_PRICES: Readonly<Record<string, ListedPrice>> = {
  'claude-haiku-5-5': {
    input: 0.1,
    output: 0.5,
    long: { above: 100_000, input: 0.5, output: 2.5 },
  },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
};

/**
 * An id not listed is priced at the highest listed price of its family
 * (haiku / sonnet / opus), and an unknown family at the highest of all, so
 * the spend counter never under-reports.
 */
function highest(prices: readonly ListedPrice[]): ModelPrice {
  const all = prices.flatMap((p) => (p.long ? [p, p.long] : [p]));
  return {
    input: Math.max(...all.map((p) => p.input)),
    output: Math.max(...all.map((p) => p.output)),
  };
}

function listed(id: string): ListedPrice | undefined {
  const exact = MODEL_PRICES[id];
  if (exact) return exact;
  const base = Object.keys(MODEL_PRICES).find((k) => new RegExp(`^${k}-\\d{8}$`).test(id));
  return base ? MODEL_PRICES[base] : undefined;
}

/** The price of one call to `model` whose prompt had `inputTokens` tokens. */
export function priceOf(model: string, inputTokens = 0): ModelPrice {
  const id = model.trim().toLowerCase();
  const p = listed(id);
  if (p) {
    if (p.long && inputTokens > p.long.above) return { input: p.long.input, output: p.long.output };
    return { input: p.input, output: p.output };
  }
  const all = Object.entries(MODEL_PRICES);
  for (const family of ['haiku', 'sonnet', 'opus'] as const) {
    if (id.includes(family)) {
      return highest(all.filter(([k]) => k.includes(family)).map(([, v]) => v));
    }
  }
  return highest(all.map(([, v]) => v));
}

/** Cost of one reply in US dollars. */
export function costOf(model: string, usage: AiUsage): number {
  const p = priceOf(model, usage.inputTokens);
  return (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1_000_000;
}

export interface SpendSnapshot {
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** US dollars, rounded to a tenth of a cent. */
  readonly dollars: number;
}

/** The per-session spend counter (DESIGN §11). Reset when a session starts. */
export class SpendCounter {
  private calls = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private dollars = 0;

  record(reply: AiReply): void {
    const { inputTokens, outputTokens } = reply.usage;
    if (![inputTokens, outputTokens].every((n) => Number.isInteger(n) && n >= 0)) {
      throw new AiError('The AI reply reported unusable token counts', 'bad-reply');
    }
    this.calls += 1;
    this.inputTokens += inputTokens;
    this.outputTokens += outputTokens;
    this.dollars += costOf(reply.model, reply.usage);
  }

  reset(): void {
    this.calls = 0;
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.dollars = 0;
  }

  snapshot(): SpendSnapshot {
    return {
      calls: this.calls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      dollars: Math.round(this.dollars * 1000) / 1000,
    };
  }
}

/** Wraps a client so every reply is counted. */
export function counted(client: AiClient, counter: SpendCounter): AiClient {
  return {
    async complete(request) {
      let reply: AiReply;
      try {
        reply = await client.complete(request);
      } catch (err) {
        if (err instanceof AiError && err.partial) counter.record(err.partial);
        throw err;
      }
      counter.record(reply);
      return reply;
    },
  };
}

/**
 * Removes anything that looks like an Anthropic key from text bound for a
 * log, an error message or the GM's screen. The key itself never leaves the
 * desktop app's encrypted store except in the request header.
 */
export function redactKey(text: string, key?: string): string {
  let out = text.replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-…');
  if (key !== undefined && key.length >= 8) out = out.split(key).join('…');
  return out;
}

/** QF.49: a reply cut at its output cap; readers split the stretch and retry. */
export class TooLongError extends AiError {}

/**
 * QF.49: a reply cut at its output cap is not an answer (the JSON is torn).
 * Throws an AiError that says what to do instead of failing as bad JSON.
 * The call was still made, so the spend counter has already counted it.
 */
export function requireWhole(reply: AiReply): AiReply {
  if (reply.stopReason === 'max_tokens') {
    throw new TooLongError(
      'The co-DM ran out of room answering: that stretch of talk was too long for one go.',
      'bad-reply',
    );
  }
  return reply;
}
