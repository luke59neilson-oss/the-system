// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const focusOrSkip = ['describe', 'it', 'test', 'suite'].flatMap((fn) =>
  ['skip', 'only'].map((mod) => ({
    selector: `MemberExpression[object.name='${fn}'][property.name='${mod}']`,
    message: `${fn}.${mod} is banned (docs/LOOP.md §5.6).`,
  })),
);

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
    // Inline lint-suppression comments are banned: they are ignored and reported.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-restricted-syntax': ['error', ...focusOrSkip],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': 'allow-with-description' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // The engine must stay pure: no I/O, no ambient time or randomness.
    files: ['packages/engine/src/**/*.ts'],
    ignores: ['packages/engine/src/**/*.test.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['node:*', 'fs', 'path', 'os', 'http', 'net'] },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Inject a clock instead.' },
        { object: 'Math', property: 'random', message: 'Inject an RNG instead.' },
      ],
      'no-restricted-syntax': [
        'error',
        ...focusOrSkip,
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Inject a clock instead.',
        },
      ],
    },
  },
);
