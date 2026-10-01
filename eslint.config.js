import { defineConfig } from 'eslint/config';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { importWallsRule } from './eslint/import-walls-rule.ts';

const testFiles = ['**/test/**', '**/*.test.ts'];
const configFiles = ['*.config.js', '*.config.ts', '*/*/*.config.ts'];
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
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'], ecmaVersion: 'latest', sourceType: 'module' },
    },
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
      // kvwebui renders HTML in one place only: its sanitized Markdown component (plan 06 §6.1).
      'vue/no-v-html': 'error',
    },
  },
  {
    files: ['extensions/kvwebui/web/src/components/views/MarkdownView.vue'],
    rules: { 'vue/no-v-html': 'off' },
  },
  {
    // A custom component's file name is its public name, `<namespace>.<name>` (plan 06 §6.4), such as kvcoder.sessions.
    files: ['extensions/*/web/components/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
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
