// MC.1: the key store (encrypted only, never plain text) and the live
// Anthropic client driven by a fake fetch. Nothing here touches the network.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AnthropicClient, ANTHROPIC_URL } from '../src/ai/anthropic';
import { DEFAULT_AI_MODELS } from '../src/ai/client';
import { KEY_FILE, KeyStore, KeyStoreError, type SecretCipher } from '../src/ai/keyStore';

const KEY = 'sk-ant-api03-' + 'A1b2C3d4'.repeat(4);
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'keystore-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A stand-in for Electron safeStorage: reversible, and never plain text. */
const cipher = (available = true): SecretCipher => ({
  isAvailable: () => available,
  encrypt: (s) => Buffer.from(Buffer.from(s).map((b) => b ^ 0x5a)),
  decrypt: (b) => Buffer.from(b.map((x) => x ^ 0x5a)).toString(),
});

describe('KeyStore', () => {
  it('saves the key encrypted and loads it back', () => {
    const dir = tmp();
    const store = new KeyStore(dir, cipher());
    expect(store.has()).toBe(false);
    store.save(`  ${KEY}\n`);
    const raw = readFileSync(path.join(dir, KEY_FILE));
    expect(raw.toString('latin1')).not.toContain('sk-ant');
    expect(store.load()).toBe(KEY);
    expect(readdirSync(dir)).toEqual([KEY_FILE]);
    store.remove();
    expect(store.has()).toBe(false);
    expect(store.load()).toBeNull();
  });

  it('refuses to save without OS encryption, or a value that is not a key', () => {
    const dir = tmp();
    expect(() => new KeyStore(dir, null).save(KEY)).toThrow(KeyStoreError);
    expect(() => new KeyStore(dir, cipher(false)).save(KEY)).toThrow(KeyStoreError);
    expect(() => new KeyStore(dir, cipher()).save('hello')).toThrow(/sk-ant-/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('says why a key cannot be saved (not the desktop app, or no OS encryption)', () => {
    const dir = tmp();
    expect(new KeyStore(dir, null).whyCannotSave()).toBe('no-desktop');
    expect(new KeyStore(dir, cipher(false)).whyCannotSave()).toBe('no-encryption');
    expect(new KeyStore(dir, cipher()).whyCannotSave()).toBeNull();
  });

  it('loads null when the file cannot be decrypted to a key', () => {
    const dir = tmp();
    new KeyStore(dir, cipher()).save(KEY);
    const other: SecretCipher = { ...cipher(), decrypt: () => 'garbage' };
    expect(new KeyStore(dir, other).load()).toBeNull();
    const broken: SecretCipher = {
      ...cipher(),
      decrypt: () => {
        throw new Error('bad');
      },
    };
    expect(new KeyStore(dir, broken).load()).toBeNull();
  });
});

type Call = { url: string; init: RequestInit };
const fakeFetch = (status: number, body: unknown, calls: Call[] = []) => {
  return (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return Promise.resolve(new Response(text, { status }));
  };
};
const req = {
  role: 'strong' as const,
  system: 'sys',
  messages: [{ role: 'user' as const, content: 'hi' }],
  maxTokens: 50,
};

describe('AnthropicClient (fake fetch)', () => {
  it('sends the key only in the header and reads text and usage', async () => {
    const calls: Call[] = [];
    const client = new AnthropicClient(
      () => KEY,
      () => DEFAULT_AI_MODELS,
      fakeFetch(
        200,
        {
          model: 'claude-sonnet-4-5',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'tool_use', id: 'x' },
            { type: 'text', text: 'GM' },
          ],
          usage: { input_tokens: 12, output_tokens: 3 },
        },
        calls,
      ),
    );
    const reply = await client.complete(req);
    expect(reply).toEqual({
      text: 'Hello GM',
      model: 'claude-sonnet-4-5',
      usage: { inputTokens: 12, outputTokens: 3 },
    });
    expect(calls[0]!.url).toBe(ANTHROPIC_URL);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(KEY);
    expect(String(calls[0]!.init.body)).not.toContain(KEY);
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({
      model: 'claude-sonnet-4-5',
      max_tokens: 50,
      system: 'sys',
    });
  });

  it('says what it needs without a key, and never echoes the key in errors', async () => {
    const none = new AnthropicClient(
      () => null,
      () => DEFAULT_AI_MODELS,
      fakeFetch(200, {}),
    );
    await expect(none.complete(req)).rejects.toMatchObject({ kind: 'no-key' });
    const refused = new AnthropicClient(
      () => KEY,
      () => DEFAULT_AI_MODELS,
      fakeFetch(401, `invalid x-api-key ${KEY}`),
    );
    const err = (await refused.complete(req).catch((e: unknown) => e)) as Error & { kind: string };
    expect(err.kind).toBe('auth');
    expect(err.message).not.toContain(KEY);
    const busy = new AnthropicClient(
      () => KEY,
      () => DEFAULT_AI_MODELS,
      fakeFetch(529, ''),
    );
    await expect(busy.complete(req)).rejects.toMatchObject({ kind: 'rate-limit' });
    const odd = new AnthropicClient(
      () => KEY,
      () => DEFAULT_AI_MODELS,
      fakeFetch(200, 'nope'),
    );
    await expect(odd.complete(req)).rejects.toMatchObject({ kind: 'bad-reply' });
    const down = new AnthropicClient(
      () => KEY,
      () => DEFAULT_AI_MODELS,
      () => Promise.reject(new Error(`connect failed ${KEY}`)),
    );
    const net = (await down.complete(req).catch((e: unknown) => e)) as Error & { kind: string };
    expect(net.kind).toBe('network');
    expect(net.message).not.toContain(KEY);
  });
});
