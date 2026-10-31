// MC.1: the co-DM's AI client interface, the fixture-backed fake, the spend
// counter and key redaction. No test here touches the network.
import { describe, expect, it } from 'vitest';
import {
  AiError,
  SpendCounter,
  costOf,
  counted,
  priceOf,
  redactKey,
  type AiRequest,
} from '../src/ai/client';
import { FixtureAiClient } from '../src/ai/fake';

const ask = (content: string, role: AiRequest['role'] = 'strong'): AiRequest => ({
  role,
  system: 'You are the System.',
  messages: [{ role: 'user', content }],
  maxTokens: 500,
});

describe('FixtureAiClient', () => {
  const fake = new FixtureAiClient([
    { role: 'fast', match: 'herbalist', text: 'chip: Generate herbalist shop' },
    { match: 'herbalist', text: '{"shops":[]}', usage: { inputTokens: 1000, outputTokens: 200 } },
    { match: 'broken', text: '', error: { message: 'Overloaded, try again', kind: 'rate-limit' } },
  ]);

  it('answers by role and the last user message, first match first', async () => {
    const fast = await fake.complete(ask('they want an herbalist', 'fast'));
    expect(fast.text).toBe('chip: Generate herbalist shop');
    expect(fast.model).toBe('claude-haiku-5-5');
    const strong = await fake.complete(ask('make an herbalist shop'));
    expect(strong.text).toBe('{"shops":[]}');
    expect(strong.model).toBe('claude-sonnet-5-5');
    expect(strong.usage).toEqual({ inputTokens: 1000, outputTokens: 200 });
    expect(fake.requests.length).toBe(2);
  });

  it('rejects requests it has no recording for, and replays recorded errors', async () => {
    await expect(fake.complete(ask('a dragon'))).rejects.toMatchObject({ kind: 'fixture' });
    const err = await fake.complete(ask('broken')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err).toMatchObject({ kind: 'rate-limit', message: 'Overloaded, try again' });
  });

  it('estimates usage when a fixture records none', async () => {
    const reply = await fake.complete(ask('they want an herbalist', 'fast'));
    expect(reply.usage.inputTokens).toBeGreaterThan(0);
    expect(reply.usage.outputTokens).toBeGreaterThan(0);
  });
});

describe('spend counter', () => {
  it('prices each listed model exactly (QF.51)', () => {
    expect(priceOf('claude-haiku-5-5')).toEqual({ input: 0.1, output: 0.5 });
    expect(priceOf('claude-sonnet-5-5')).toEqual({ input: 2, output: 10 });
    expect(priceOf('claude-opus-5-5')).toEqual({ input: 4, output: 20 });
    expect(priceOf('claude-haiku-4-5')).toEqual({ input: 1, output: 5 });
    expect(priceOf('claude-sonnet-4-5')).toEqual({ input: 3, output: 15 });
    for (const v of ['5', '6', '7', '8']) {
      expect(priceOf(`claude-opus-4-${v}`)).toEqual({ input: 5, output: 25 });
    }
    expect(priceOf('claude-sonnet-4-5-20250929')).toEqual({ input: 3, output: 15 });
    expect(priceOf(' Claude-Haiku-5-5 ')).toEqual({ input: 0.1, output: 0.5 });
  });

  it('Haiku 5.5 prompts over 100k tokens take the long-prompt price for the call (QF.51)', () => {
    expect(priceOf('claude-haiku-5-5', 100_000)).toEqual({ input: 0.1, output: 0.5 });
    expect(priceOf('claude-haiku-5-5', 100_001)).toEqual({ input: 0.5, output: 2.5 });
    expect(costOf('claude-haiku-5-5', { inputTokens: 100_000, outputTokens: 1000 })).toBeCloseTo(
      0.0105,
    );
    expect(costOf('claude-haiku-5-5', { inputTokens: 200_000, outputTokens: 1000 })).toBeCloseTo(
      0.1025,
    );
    // Other models have one price whatever the prompt size.
    expect(priceOf('claude-sonnet-5-5', 500_000)).toEqual({ input: 2, output: 10 });
  });

  it('unknown ids take the highest price of their family, unknown families the highest of all', () => {
    expect(priceOf('claude-haiku-9')).toEqual({ input: 1, output: 5 });
    expect(priceOf('claude-sonnet-6-0')).toEqual({ input: 3, output: 15 });
    expect(priceOf('claude-opus-6')).toEqual({ input: 5, output: 25 });
    expect(priceOf('some-new-model')).toEqual({ input: 5, output: 25 });
    expect(costOf('claude-sonnet-4-5', { inputTokens: 1_000_000, outputTokens: 0 })).toBe(3);
    expect(costOf('claude-haiku-4-5', { inputTokens: 2000, outputTokens: 1000 })).toBeCloseTo(
      0.007,
    );
  });

  it('counts every reply through a counted client and resets per session', async () => {
    const counter = new SpendCounter();
    const client = counted(
      new FixtureAiClient([
        { match: 'x', text: 'ok', usage: { inputTokens: 1_000_000, outputTokens: 100_000 } },
      ]),
      counter,
    );
    await client.complete(ask('x'));
    await client.complete(ask('x', 'fast'));
    expect(counter.snapshot()).toEqual({
      calls: 2,
      inputTokens: 2_000_000,
      outputTokens: 200_000,
      // sonnet 3 + 1.5, haiku 1 + 0.5
      dollars: 3.75 /* sonnet-5-5 $3 + haiku-5-5 long-prompt $0.75 (QF.51) */,
    });
    counter.reset();
    expect(counter.snapshot()).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, dollars: 0 });
  });

  it('refuses token counts that are not whole numbers of 0 or more', () => {
    const counter = new SpendCounter();
    expect(() =>
      counter.record({
        text: '',
        model: 'claude-haiku-4-5',
        usage: { inputTokens: -1, outputTokens: 0 },
      }),
    ).toThrow(AiError);
    expect(counter.snapshot().calls).toBe(0);
  });

  it('does not count a failed call', async () => {
    const counter = new SpendCounter();
    const client = counted(new FixtureAiClient([]), counter);
    await expect(client.complete(ask('nothing'))).rejects.toBeInstanceOf(AiError);
    expect(counter.snapshot().calls).toBe(0);
  });
});

describe('redactKey', () => {
  it('removes Anthropic-looking keys and the given key from text', () => {
    const key = 'sk-ant-api03-abcDEF_123-xyz';
    expect(redactKey(`401 for key ${key}`)).toBe('401 for key sk-ant-…');
    expect(redactKey('token secretsecret123 rejected', 'secretsecret123')).toBe('token … rejected');
    expect(redactKey('nothing here')).toBe('nothing here');
  });
});

describe('CoDm spend per session', () => {
  it('starts the counter again when the running session changes', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const { CoDm } = await import('../src/ai/coDm');
    const dir = mkdtempSync(path.join(tmpdir(), 'codm-'));
    let session: string | null = 's1';
    const coDm = new CoDm({
      dir,
      cipher: null,
      sessionId: () => session,
      makeClient: () => new FixtureAiClient([{ match: 'x', text: 'ok' }]),
    });
    await coDm.client.complete(ask('x'));
    await coDm.client.complete(ask('x'));
    expect(coDm.status().spend.calls).toBe(2);
    session = 's2';
    expect(coDm.status().spend.calls).toBe(0);
    await coDm.client.complete(ask('x'));
    expect(coDm.status().spend.calls).toBe(1);
    session = null;
    expect(coDm.status().spend.calls).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});
