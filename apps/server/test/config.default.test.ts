import { describe, expect, it } from 'vitest';
import { DEFAULT_HOST, DEFAULT_PORT } from '../src/config';

describe('server defaults (DESIGN / D4)', () => {
  it('binds all interfaces on port 30333', () => {
    expect(DEFAULT_HOST).toBe('0.0.0.0');
    expect(DEFAULT_PORT).toBe(30333);
  });
});
