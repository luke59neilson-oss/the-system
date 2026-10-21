import { describe, expect, it } from 'vitest';
import { ENGINE_API_VERSION, ENGINE_NAME } from './index';

describe('engine package', () => {
  it('exposes its identity', () => {
    expect(ENGINE_NAME).toBe('the-system-engine');
    expect(ENGINE_API_VERSION).toBe(0);
  });
});
