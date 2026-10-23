// Proves the ESLint config enforces engine purity and the test bans.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? m.message);
}

const enginePath = 'packages/engine/src/__lint_probe__.ts';
const testPaths = [
  'packages/engine/src/__lint_probe__.test.ts',
  'apps/server/test/__lint_probe_helper__.ts',
];

describe('engine purity lint', () => {
  it.each([
    ['Date.now()', 'export const a = Date.now();', 'no-restricted-syntax'],
    ['Date["now"]()', "export const a = Date['now']();", 'no-restricted-syntax'],
    ['new Date()', 'export const a = new Date();', 'no-restricted-syntax'],
    ['Date()', 'export const a = Date();', 'no-restricted-syntax'],
    ['Math.random()', 'export const a = Math.random();', 'no-restricted-syntax'],
    ['Math["random"]()', "export const a = Math['random']();", 'no-restricted-syntax'],
    ['performance.now()', 'export const a = performance.now();', 'no-restricted-globals'],
    ['crypto.randomUUID()', 'export const a = crypto.randomUUID();', 'no-restricted-globals'],
    ['setTimeout', 'export const a = setTimeout;', 'no-restricted-globals'],
    ['process.env', 'export const a = process.env;', 'no-restricted-globals'],
    ['dynamic import', "export const a = import('node:fs');", 'no-restricted-syntax'],
    [
      'node import',
      "import { readFileSync } from 'node:fs';\nexport const a = readFileSync;",
      'no-restricted-imports',
    ],
    [
      'bare node import',
      "import fs from 'fs/promises';\nexport const a = fs;",
      'no-restricted-imports',
    ],
    ['aliased Date', 'const D = Date;\nexport const a = D.now();', 'no-restricted-syntax'],
    [
      'destructured Math',
      'const { random } = Math;\nexport const a = random();',
      'no-restricted-syntax',
    ],
    ['Reflect', "export const a = Reflect.get(Date, 'now');", 'no-restricted-globals'],
    [
      'computed Date member',
      "const k = 'now';\nexport const a = Date[k]();",
      'no-restricted-syntax',
    ],
    [
      'spread new Date',
      'const args: [] = [];\nexport const a = new Date(...args);',
      'no-restricted-syntax',
    ],
    ['eval', "export const a = eval('1');", 'no-restricted-globals'],
    ['Function', "export const a = new Function('return 1');", 'no-restricted-globals'],
    ['Intl', 'export const a = Intl.DateTimeFormat().format();', 'no-restricted-globals'],
    [
      'package import',
      "import cp from 'child_process';\nexport const a = cp;",
      'no-restricted-imports',
    ],
    [
      'default parameter clock = Date',
      'export function f(clock = Date) {\n  return clock.now();\n}',
      'no-restricted-syntax',
    ],
    [
      'default parameter rng = Math',
      'export function f(rng = Math) {\n  return rng.random();\n}',
      'no-restricted-syntax',
    ],
    [
      'object property { clock: Date }',
      'export const deps = { clock: Date };',
      'no-restricted-syntax',
    ],
    [
      'shorthand property { Math }',
      'const make = (o: object) => o;\nexport const deps = make({ Math });',
      'no-restricted-syntax',
    ],
    ['arrow returning Date', 'export const clock = () => Date;', 'no-restricted-syntax'],
    [
      'Date as an argument',
      'const use = (c: unknown) => c;\nexport const a = use(Date);',
      'no-restricted-syntax',
    ],
    ['Math in an array', 'export const a = [Math];', 'no-restricted-syntax'],
    [
      'Date as a computed key',
      'const o: Record<string, number> = {};\nexport const a = o[String(Date)];',
      'no-restricted-syntax',
    ],
    ['Date.call', 'export const a = Date.call(null);', 'no-restricted-syntax'],
    ['Date.bind', 'export const a = Date.bind(null)();', 'no-restricted-syntax'],
    [
      'Math.apply',
      'export const a = Math.max.apply(null, [1]) + Math.apply;',
      'no-restricted-syntax',
    ],
    ['constructor.now', 'export const a = new Date(0).constructor.now();', 'no-restricted-syntax'],
  ])('rejects %s', async (_label, code, ruleId) => {
    expect(await ruleIds(code, enginePath)).toContain(ruleId);
  });

  it('allows pure code, relative imports and zod', async () => {
    const code =
      "import { z } from 'zod';\nimport { x } from './x';\nexport const a = z.number().parse(x) + new Date(0).getTime();";
    expect(await ruleIds(code, enginePath)).toEqual([]);
  });

  it('allows Math and Date in member access, new Date(x) and types', async () => {
    const code = [
      'type Clock = { now: () => number };',
      'export const d: Date = new Date(5);',
      'export const t: typeof Date.prototype.getTime = d.getTime;',
      'export const o = { Date: 1, Math: 2 };',
      'export const n = Math.floor(2.5) + Math.max(1, 2) + Math.PI + o.Date + d.getTime();',
      'export function f(clock: Clock) {',
      '  return clock.now();',
      '}',
    ].join('\n');
    expect(await ruleIds(code, enginePath)).toEqual([]);
  });
});

describe('test-modifier lint', () => {
  const sk = 'sk' + 'ip';
  it.each([
    `test.${sk}('a', () => {});`,
    `test['${sk}']('a', () => {});`,
    `it.concurrent.${sk}('a', () => {});`,
    `test.each([1]).${sk}('a', () => {});`,
    `it.${'on' + 'ly'}('a', () => {});`,
    `x${'it'}('a', () => {});`,
  ])('rejects %s', async (code) => {
    for (const testPath of testPaths) {
      const ids = await ruleIds(`import { it, test } from 'vitest';\n${code}\n`, testPath);
      expect(ids, testPath).toContain('no-restricted-syntax');
    }
  });
});
