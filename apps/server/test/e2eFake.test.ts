// MC.1 review round 2 (M2): the e2e suite's stand-in cipher and AI client.
// It must only switch on with the exact env value, refuse real-looking keys,
// never write a key verbatim, and answer only with a saved key.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CoDm } from '../src/ai/coDm';
import { DEFAULT_AI_MODELS } from '../src/ai/client';
import { E2E_FAKE_AI_ENV, e2eFakeCipher, e2eFakeClient, e2eFakeFromEnv } from '../src/ai/e2eFake';
import { KEY_FILE } from '../src/ai/keyStore';

const TEST_KEY = 'sk-ant-e2e-0123456789abcdefghij';
const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'the-system-e2efake-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('e2e fake co-DM', () => {
  it('is on only when the env switch is exactly "1"', () => {
    expect(e2eFakeFromEnv({})).toBeNull();
    expect(e2eFakeFromEnv({ [E2E_FAKE_AI_ENV]: 'true' })).toBeNull();
    expect(e2eFakeFromEnv({ [E2E_FAKE_AI_ENV]: '0' })).toBeNull();
    expect(e2eFakeFromEnv({ [E2E_FAKE_AI_ENV]: '1' })).not.toBeNull();
  });

  it('refuses any key that is not a test key', () => {
    expect(() => e2eFakeCipher.encrypt('sk-ant-api03-realLookingKey0123456789')).toThrow(
      'only stores test keys',
    );
  });

  it('round-trips a test key without writing it verbatim', () => {
    const dir = tempDir();
    const coDm = new CoDm({ dir, cipher: e2eFakeCipher, makeClient: e2eFakeClient });
    coDm.keys.save(TEST_KEY);
    expect(readFileSync(path.join(dir, KEY_FILE), 'utf8')).not.toContain(TEST_KEY);
    expect(coDm.keys.load()).toBe(TEST_KEY);
    expect(coDm.status().hasKey).toBe(true);
  });

  it('a real-looking key is refused by the save route path too', () => {
    const coDm = new CoDm({ dir: tempDir(), cipher: e2eFakeCipher, makeClient: e2eFakeClient });
    expect(() => coDm.keys.save('sk-ant-api03-realLookingKey0123456789')).toThrow();
    expect(coDm.status().hasKey).toBe(false);
  });

  it('answers the connection test only with a key, and the spend counts it', async () => {
    const coDm = new CoDm({ dir: tempDir(), cipher: e2eFakeCipher, makeClient: e2eFakeClient });
    expect(await coDm.test()).toEqual({ ok: false, error: expect.stringContaining('No API key') });
    expect(coDm.status().spend.calls).toBe(0);
    coDm.keys.save(TEST_KEY);
    expect(await coDm.test()).toEqual({ ok: true, model: DEFAULT_AI_MODELS.fast });
    const spend = coDm.status().spend;
    expect(spend.calls).toBe(1);
    expect(spend.dollars).toBeCloseTo(0.001, 6);
  });
});
