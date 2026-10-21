import { describe, expect, it } from 'vitest';
import {
  authPath,
  isAllowedHost,
  gmKeyMatches,
  isAllowedOrigin,
  isLoopback,
  newGmKey,
  normalizeAddress,
} from '../src/security';

describe('addresses', () => {
  it('normalizes IPv4-mapped IPv6', () => {
    expect(normalizeAddress('::ffff:192.168.1.5')).toBe('192.168.1.5');
    expect(normalizeAddress('::FFFF:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeAddress('192.168.1.5')).toBe('192.168.1.5');
    expect(normalizeAddress('::ffff:abcd')).toBe('::ffff:abcd');
    expect(normalizeAddress('fe80::1')).toBe('fe80::1');
  });

  it('recognizes loopback only', () => {
    for (const a of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1']) {
      expect(isLoopback(a), a).toBe(true);
    }
    for (const a of ['::ffff:192.168.1.5', '192.168.1.5', '10.0.0.1', '1270.0.0.1', '', '::']) {
      expect(isLoopback(a), a).toBe(false);
    }
  });
});

describe('isAllowedOrigin', () => {
  it('allows same-origin pages and non-browser clients', () => {
    expect(isAllowedOrigin('http://192.168.1.5:30333', '192.168.1.5:30333')).toBe(true);
    expect(isAllowedOrigin('http://LOCALHOST:30333', 'localhost:30333')).toBe(true);
    expect(isAllowedOrigin(undefined, '192.168.1.5:30333')).toBe(true);
  });

  it('refuses other sites, ports, schemes and junk', () => {
    const host = '192.168.1.5:30333';
    for (const origin of [
      'http://evil.example',
      'http://192.168.1.5:8080',
      'http://192.168.1.5',
      'file://',
      'null',
      'not a url',
      'chrome-extension://abc',
    ]) {
      expect(isAllowedOrigin(origin, host), origin).toBe(false);
    }
    expect(isAllowedOrigin('http://192.168.1.5:30333', undefined)).toBe(false);
    expect(isAllowedOrigin('http://192.168.1.5:30333', '')).toBe(false);
  });

  it('allows listed extra origins (dev server)', () => {
    expect(
      isAllowedOrigin('http://localhost:5173', 'localhost:30333', ['http://localhost:5173']),
    ).toBe(true);
  });
});

describe('GM key', () => {
  it('matches only the exact key', () => {
    const key = newGmKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(newGmKey()).not.toBe(key);
    expect(gmKeyMatches(key, key)).toBe(true);
    for (const bad of ['', key.slice(1), `${key}x`, key.toUpperCase(), undefined, null, 5, [key]]) {
      expect(gmKeyMatches(key, bad)).toBe(false);
    }
    expect(gmKeyMatches('', '')).toBe(false);
  });
});

describe('isAllowedHost (DNS rebinding)', () => {
  it('allows localhost, IP literals and .local names', () => {
    for (const h of [
      'localhost:30333',
      '127.0.0.1',
      '192.168.1.5:30333',
      '[::1]:30333',
      'gm-laptop.local:30333',
    ]) {
      expect(isAllowedHost(h), h).toBe(true);
    }
    expect(isAllowedHost('table.example', ['table.example'])).toBe(true);
  });
  it('refuses domain names and junk', () => {
    for (const h of [
      undefined,
      '',
      'evil.example:30333',
      'evil.example',
      '999.1.1.1',
      '[zz]',
      '[::1',
      'local',
    ]) {
      expect(isAllowedHost(h), String(h)).toBe(false);
    }
  });
});

describe('authPath', () => {
  it('decodes and normalizes so encodings cannot hide /api', () => {
    expect(authPath('/%61pi/gm/export')).toBe('/api/gm/export');
    expect(authPath('/a%70i/gm/export?x=1')).toBe('/api/gm/export');
    expect(authPath('/API/gm')).toBe('/api/gm');
    expect(authPath('/x/../api/gm')).toBe('/api/gm');
    expect(authPath('//api/gm')).toBe('/api/gm');
    expect(authPath('/%2e%2e/api')).toBe('/api');
  });
  it('refuses absolute-form and undecodable paths', () => {
    expect(authPath('http://x/api/gm/export')).toBeNull();
    expect(authPath('*')).toBeNull();
    expect(authPath('/%zz')).toBeNull();
  });
});
