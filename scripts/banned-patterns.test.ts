import { describe, expect, it } from 'vitest';
import { findBanned } from './banned-patterns.mjs';

const at = '@';
const sk = 'sk' + 'ip';
const on = 'on' + 'ly';

describe('findBanned', () => {
  it('flags focused and skipped tests', () => {
    expect(findBanned(`it.${on}('x', f)`)).toHaveLength(1);
    expect(findBanned(`describe .${sk}('x', f)`)).toHaveLength(1);
    expect(findBanned(`test.${sk}('x')`)).toHaveLength(1);
  });
  it('flags ts and lint suppressions', () => {
    expect(findBanned(`// ${at}ts-ignore`)).toHaveLength(1);
    expect(findBanned(`// ${at}ts-nocheck`)).toHaveLength(1);
    expect(findBanned(`/* ${['eslint', 'disable'].join('-')} */`)).toHaveLength(1);
    expect(findBanned(`// ${at}ts-expect-error`)).toHaveLength(1);
  });
  it('allows a reasoned ts-expect-error and ordinary code', () => {
    expect(findBanned(`// ${at}ts-expect-error testing invalid input`)).toEqual([]);
    expect(findBanned(`const a = list.${sk}; items.${on} = 1;`)).toEqual([]);
  });
  it('reports line numbers', () => {
    expect(findBanned(`ok\n// ${at}ts-ignore`)).toEqual([{ line: 2, name: `${at}ts-ignore` }]);
  });
});
