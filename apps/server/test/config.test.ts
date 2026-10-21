import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_HOST, DEFAULT_PORT, parsePort, resolveOptions } from '../src/config';

describe('parsePort', () => {
  it('defaults when unset or blank', () => {
    expect(parsePort(undefined)).toBe(DEFAULT_PORT);
    expect(parsePort('  ')).toBe(DEFAULT_PORT);
  });
  it('accepts 0 and valid ports', () => {
    expect(parsePort('0')).toBe(0);
    expect(parsePort('8080')).toBe(8080);
  });
  it('rejects junk and out-of-range values', () => {
    expect(() => parsePort('abc')).toThrow(ConfigError);
    expect(() => parsePort('-1')).toThrow(ConfigError);
    expect(() => parsePort('70000')).toThrow(ConfigError);
  });
});

describe('resolveOptions', () => {
  it('uses defaults', () => {
    expect(resolveOptions([], {}, '/web')).toEqual({
      port: DEFAULT_PORT,
      host: DEFAULT_HOST,
      webRoot: '/web',
    });
  });
  it('prefers flags over env', () => {
    const opts = resolveOptions(['--port', '1234', '--host', '127.0.0.1'], { PORT: '999' }, '/w');
    expect(opts.port).toBe(1234);
    expect(opts.host).toBe('127.0.0.1');
  });
  it('reads env', () => {
    expect(resolveOptions([], { PORT: '4000', WEB_ROOT: '/x' }, '/w')).toMatchObject({
      port: 4000,
      webRoot: '/x',
    });
  });
  it('rejects a flag without a value', () => {
    expect(() => resolveOptions(['--port'], {}, '/w')).toThrow(ConfigError);
    expect(() => resolveOptions(['--port', '--host', 'x'], {}, '/w')).toThrow(ConfigError);
  });
});
