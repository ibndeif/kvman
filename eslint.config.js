import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { importWallsRule } from './eslint/import-walls-rule.ts';

const testFiles = ['**/test/**', '**/*.test.ts'];
const configFiles = ['*.config.js', '*.config.ts'];
const extensionEntries = ['extensions/*/src/index.ts', 'packages/*/test/fixtures/extensions/*/index.ts'];

const noDefaultExport = [
  { selector: 'ExportDefaultDeclaration', message: 'No default exports except an extension\'s entry (CLAUDE.md §5); export by name.' },
  { selector: "ExportSpecifier[exported.name='default']", message: 'No default exports except an extension\'s entry (CLAUDE.md §5); export by name.' },
];

const focusedOrSkippedTests = ['describe', 'it', 'test', 'suite'].flatMap((object) =>
  ['only', 'skip', 'todo', 'skipIf', 'runIf'].map((property) => ({
    object,
    property,
    message: 'Tests are never focused, skipped, or left as placeholders (CLAUDE.md §5, §7).',
  })),
);

export default defineConfig(
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'test/fixtures/**'],
  },
  {
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  },
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      kvman: { rules: { 'import-walls': importWallsRule } },
    },
    rules: {
      'kvman/import-walls': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true, 'ts-expect-error': true, 'ts-nocheck': true, 'ts-check': false }],
      'no-warning-comments': ['error', { terms: ['todo', 'fixme'], location: 'start' }],
      'max-lines': ['error', { max: 300, skipBlankLines: false, skipComments: false }],
      'no-restricted-syntax': ['error', ...noDefaultExport],
    },
  },
  {
    files: testFiles,
    rules: { 'no-restricted-properties': ['error', ...focusedOrSkippedTests] },
  },
  {
    files: [...extensionEntries, ...configFiles],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
