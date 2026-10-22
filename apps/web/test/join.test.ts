import { describe, expect, it } from 'vitest';
import {
  REMEMBER_KEY,
  initials,
  parseJoinList,
  readRemembered,
  remember,
  rememberedEntry,
} from '../src/player/join';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const throwing = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('remembered character', () => {
  it('round-trips through storage', () => {
    const s = memoryStorage();
    expect(readRemembered(s)).toBeNull();
    remember(s, 'jake');
    expect(s.data.get(REMEMBER_KEY)).toBe('jake');
    expect(readRemembered(s)).toBe('jake');
    remember(s, 'miranda');
    expect(readRemembered(s)).toBe('miranda');
  });
  it('never throws when storage is blocked or missing', () => {
    expect(readRemembered(throwing)).toBeNull();
    expect(() => remember(throwing, 'jake')).not.toThrow();
    expect(readRemembered(null)).toBeNull();
    expect(() => remember(null, 'jake')).not.toThrow();
  });
  it('ignores empty or oversized values', () => {
    const s = memoryStorage();
    s.data.set(REMEMBER_KEY, '');
    expect(readRemembered(s)).toBeNull();
    s.data.set(REMEMBER_KEY, 'x'.repeat(201));
    expect(readRemembered(s)).toBeNull();
  });
  it('offers the remembered character only while it is listed', () => {
    const list = [
      { id: 'jake', name: 'Jake', grade: 'D', theme: 'silver' },
      { id: 'miranda', name: 'Miranda', grade: 'E', theme: 'copper' },
    ];
    expect(rememberedEntry(list, 'miranda')?.name).toBe('Miranda');
    expect(rememberedEntry(list, 'demo-jake')).toBeNull();
    expect(rememberedEntry(list, null)).toBeNull();
    expect(rememberedEntry([], 'jake')).toBeNull();
  });
});

describe('initials', () => {
  it('takes the first and last word', () => {
    expect(initials('Jake')).toBe('J');
    expect(initials('Jake Thayne')).toBe('JT');
    expect(initials('  miranda  of the  woods ')).toBe('MW');
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });
  it('keeps astral characters whole', () => {
    expect(initials('𝒜da Lovelace')).toBe('𝒜L');
  });
});

describe('parseJoinList', () => {
  it('keeps well-formed rows and drops the rest', () => {
    expect(
      parseJoinList([
        { id: 'a', name: 'A', grade: 'G', theme: 'aluminum' },
        { id: 'b', name: 'B', grade: 'F' },
        { id: 3, name: 'C', grade: 'G' },
        null,
        'x',
        { id: 'd', name: 'D' },
      ]),
    ).toEqual([
      { id: 'a', name: 'A', grade: 'G', theme: 'aluminum' },
      { id: 'b', name: 'B', grade: 'F', theme: null },
    ]);
    expect(parseJoinList({ not: 'a list' })).toEqual([]);
  });
  it('accepts only same-origin portrait paths', () => {
    const row = (portrait: unknown) =>
      parseJoinList([{ id: 'a', name: 'A', grade: 'G', portrait }])[0];
    expect(row('/portraits/a.png')?.portrait).toBe('/portraits/a.png');
    expect(row('//evil.example/a.png')).not.toHaveProperty('portrait');
    expect(row('/\\evil.example/a.png')).not.toHaveProperty('portrait');
    expect(row('https://evil.example/a.png')).not.toHaveProperty('portrait');
    expect(row('javascript:alert(1)')).not.toHaveProperty('portrait');
    expect(row(42)).not.toHaveProperty('portrait');
  });
});
