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
    ['Date.now()', 'export const a = Date.now();'],
    ['Date["now"]()', "export const a = Date['now']();"],
    ['new Date()', 'export const a = new Date();'],
    ['Date()', 'export const a = Date();'],
    ['Math.random()', 'export const a = Math.random();'],
    ['Math["random"]()', "export const a = Math['random']();"],
    ['performance.now()', 'export const a = performance.now();'],
    ['crypto.randomUUID()', 'export const a = crypto.randomUUID();'],
    ['setTimeout', 'export const a = setTimeout;'],
    ['process.env', 'export const a = process.env;'],
    ['dynamic import', "export const a = import('node:fs');"],
    ['node import', "import { readFileSync } from 'node:fs';\nexport const a = readFileSync;"],
    ['bare node import', "import fs from 'fs/promises';\nexport const a = fs;"],
    ['aliased Date', 'const D = Date;\nexport const a = D.now();'],
    ['destructured Math', 'const { random } = Math;\nexport const a = random();'],
    ['Reflect', "export const a = Reflect.get(Date, 'now');"],
    ['computed Date member', "const k = 'now';\nexport const a = Date[k]();"],
    ['spread new Date', 'const args: [] = [];\nexport const a = new Date(...args);'],
    ['eval', "export const a = eval('1');"],
    ['Function', "export const a = new Function('return 1');"],
    ['Intl', 'export const a = Intl.DateTimeFormat().format();'],
    ['package import', "import cp from 'child_process';\nexport const a = cp;"],
  ])('rejects %s', async (_label, code) => {
    expect(await ruleIds(code, enginePath)).not.toEqual([]);
  });

  it('allows pure code, relative imports and zod', async () => {
    const code =
      "import { z } from 'zod';\nimport { x } from './x';\nexport const a = z.number().parse(x) + new Date(0).getTime();";
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
