import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { importWallsRule } from './eslint/import-walls-rule.ts';

const testFiles = ['**/test/**', '**/*.test.ts'];
const configFiles = ['**/*.config.js', '**/*.config.ts'];

const noDefaultExport = {
  selector: 'ExportDefaultDeclaration',
  message: 'No default exports (plan 14 §14.1); export by name.',
};
const noDefaultExportSpecifier = {
  selector: "ExportSpecifier[exported.name='default']",
  message: 'No default exports (plan 14 §14.1); export by name.',
};
const onlyDefineExtensionDefault = {
  selector: "ExportDefaultDeclaration:not([declaration.type='CallExpression'][declaration.callee.name='defineExtension'])",
  message: 'The only default export of an extension is its defineExtension(...) result (plan 14 §14.1).',
};

const focusedOrSkippedTests = ['describe', 'it', 'test', 'suite'].flatMap((object) =>
  ['only', 'skip', 'todo', 'skipIf', 'runIf'].map((property) => ({
    object,
    property,
    message: 'Tests are never focused, skipped, or left as placeholders (CLAUDE.md §7).',
  })),
);

export default defineConfig(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.turbo/**', 'test/fixtures/**'],
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
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': true, 'ts-nocheck': true, 'ts-check': false },
      ],
      'no-warning-comments': ['error', { terms: ['todo', 'fixme'], location: 'start' }],
      'max-lines': ['error', { max: 300, skipBlankLines: false, skipComments: false }],
      'no-restricted-syntax': ['error', noDefaultExport, noDefaultExportSpecifier],
    },
  },
  {
    files: ['extensions/*/src/**', 'examples/*/src/**', 'packages/*/test/**/fixtures/extensions/**'],
    rules: { 'no-restricted-syntax': ['error', onlyDefineExtensionDefault, noDefaultExportSpecifier] },
  },
  {
    files: testFiles,
    rules: {
      'max-lines': 'off',
      'no-restricted-properties': ['error', ...focusedOrSkippedTests],
    },
  },
  {
    files: configFiles,
    rules: { 'no-restricted-syntax': 'off' },
  },
);
