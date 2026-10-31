import { describe, expect, it } from 'vitest';
import { listNames } from '../src/gm/XpAward';

describe('listNames (QF.46)', () => {
  it('joins names the way the result lines read', () => {
    expect(listNames([])).toBe('');
    expect(listNames(['Jake'])).toBe('Jake');
    expect(listNames(['Jake', 'Kim'])).toBe('Jake and Kim');
    expect(listNames(['Jake', 'Kim', 'Ada'])).toBe('Jake, Kim and Ada');
  });
});
