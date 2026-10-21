import { describe, expect, it } from 'vitest';
import { findBanned, isTestFile } from './banned-patterns.mjs';

const at = '@';
const sk = 'sk' + 'ip';
const on = 'on' + 'ly';
const t = { test: true };

describe('findBanned', () => {
  it('flags every dotted, computed or aliased test modifier in test files', () => {
    for (const line of [
      `it.${on}('x', f)`,
      `describe .${sk}('x', f)`,
      `test.${sk}('x')`,
      `test['${sk}']('a', f)`,
      `describe["${on}"](f)`,
      `test.each([1]).${sk}('x')`,
      `it.concurrent.${sk}('x')`,
      `it.${sk}If(true)('x')`,
      `test.${'fix' + 'me'}('x')`,
      `it.${'to' + 'do'}('x')`,
      `  .${sk}('continued line')`,
      `x${'it'}('x', f)`,
    ]) {
      expect(findBanned(line, t), line).toHaveLength(1);
    }
  });
  it('ignores test modifiers outside test files', () => {
    expect(findBanned(`const a = list.${sk};`)).toEqual([]);
  });
  it('flags ts and lint suppressions everywhere', () => {
    expect(findBanned(`// ${at}ts-ignore`)).toHaveLength(1);
    expect(findBanned(`// ${at}ts-nocheck`)).toHaveLength(1);
    expect(findBanned(`/* ${['eslint', 'disable'].join('-')} */`)).toHaveLength(1);
    expect(findBanned(`// ${at}ts-expect-error`)).toHaveLength(1);
  });
  it('allows a reasoned ts-expect-error and ordinary test code', () => {
    expect(findBanned(`// ${at}ts-expect-error testing invalid input`, t)).toEqual([]);
    expect(findBanned(`it('skips nothing', () => expect(a.onlyOne).toBe(1));`, t)).toEqual([]);
  });
  it('reports line numbers', () => {
    expect(findBanned(`ok\n// ${at}ts-ignore`)).toEqual([{ line: 2, name: `${at}ts-ignore` }]);
  });
});

describe('isTestFile', () => {
  it('recognises unit tests and e2e files', () => {
    expect(isTestFile('apps/server/test/server.test.ts')).toBe(true);
    expect(isTestFile('e2e/M0.1.spec.ts')).toBe(true);
    expect(isTestFile('e2e/helpers/server.ts')).toBe(true);
    expect(isTestFile('apps/server/test/helpers.ts')).toBe(true);
    expect(isTestFile('packages/x/tests/setup.ts')).toBe(true);
    expect(isTestFile('packages/x/src/__tests__/a.ts')).toBe(true);
    expect(isTestFile('apps/server/src/server.ts')).toBe(false);
  });
});
