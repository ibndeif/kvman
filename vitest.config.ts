import { defineConfig } from 'vitest/config';

const sourceConditions = ['@kvman/source', 'module', 'node', 'default'];

export default defineConfig({
  resolve: { conditions: sourceConditions },
  ssr: { resolve: { conditions: sourceConditions, externalConditions: ['@kvman/source'] } },
  test: {
    include: [
      'test/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
      'extensions/*/test/**/*.test.ts',
      'examples/*/test/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', 'test/fixtures/**'],
    allowOnly: false,
  },
});
