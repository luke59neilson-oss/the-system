// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Test modifiers that disable or focus tests (docs/LOOP.md §5.6). Banned as any
// member access, dotted or computed, in test files.
const testModifiers = ['skip', 'only', 'fixme', 'todo', 'skipIf', 'runIf', 'fail'];
const modifierRegex = `/^(${testModifiers.join('|')})$/`;
const testBans = [
  {
    selector: `MemberExpression[computed=false][property.name=${modifierRegex}]`,
    message: 'Disabling or focusing tests is banned (docs/LOOP.md §5.6).',
  },
  {
    selector: `MemberExpression[computed=true][property.value=${modifierRegex}]`,
    message: 'Disabling or focusing tests is banned (docs/LOOP.md §5.6).',
  },
  {
    selector: 'CallExpression[callee.name=/^(xit|xdescribe|xtest|fit|fdescribe)$/]',
    message: 'Disabling or focusing tests is banned (docs/LOOP.md §5.6).',
  },
];

// The engine must stay pure and deterministic: no I/O, ambient time or randomness.
const enginePurity = [
  { selector: 'ImportExpression', message: 'No dynamic imports in the engine.' },
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Inject a clock.' },
  { selector: "CallExpression[callee.name='Date']", message: 'Inject a clock.' },
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message: 'Inject a clock.',
  },
  {
    selector: "MemberExpression[object.name='Date'][property.value='now']",
    message: 'Inject a clock.',
  },
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message: 'Inject an RNG.',
  },
  {
    selector: "MemberExpression[object.name='Math'][property.value='random']",
    message: 'Inject an RNG.',
  },
  {
    selector:
      "MemberExpression[object.name=/^(Date|Math)$/][computed=true][property.type!='Literal']",
    message: 'No dynamic member access on Date or Math.',
  },
  {
    selector: 'VariableDeclarator[init.name=/^(Date|Math|Reflect)$/]',
    message: 'Do not alias Date, Math or Reflect.',
  },
  {
    selector: 'AssignmentExpression[right.name=/^(Date|Math|Reflect)$/]',
    message: 'Do not alias Date, Math or Reflect.',
  },
  {
    selector: "NewExpression[callee.name='Date'] > SpreadElement",
    message: 'Inject a clock.',
  },
];
const engineGlobals = [
  'process',
  'performance',
  'crypto',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'clearTimeout',
  'clearInterval',
  'queueMicrotask',
  'Buffer',
  'require',
  'module',
  'globalThis',
  'window',
  'document',
  'fetch',
  'navigator',
  'localStorage',
  'console',
  'eval',
  'Function',
  'self',
  'Reflect',
  'Intl',
  '__dirname',
  '__filename',
].map((name) => ({ name, message: 'The engine must not touch the host environment.' }));

const engineSrc = 'packages/engine/src/**/*.ts';
const testFiles = [
  '**/*.{test,spec}.{ts,tsx,js,mjs}',
  '**/{test,tests,e2e,__tests__}/**/*.{ts,tsx,js,mjs}',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  {
    // Inline lint-suppression comments have no effect; scripts/check-banned.mjs fails on them.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': 'allow-with-description' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Node globals everywhere except engine source.
    ignores: [engineSrc],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: [engineSrc],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.{1,2}/|zod$|zod/)',
              message: 'The engine may import only relative modules and zod.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...engineGlobals],
      'no-restricted-syntax': ['error', ...enginePurity],
    },
  },
  {
    files: testFiles,
    rules: {
      'no-restricted-syntax': ['error', ...testBans],
      // Tests build deliberately malformed inputs.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
