import { defineConfig } from 'vitest/config';

const sourceConditions = ['@kvman/source', 'module', 'node', 'default'];

export default defineConfig({
  resolve: { conditions: sourceConditions },
  ssr: { resolve: { conditions: sourceConditions, externalConditions: ['@kvman/source'] } },
  test: {
    allowOnly: false,
    include: ['test/**/*.test.ts', 'packages/*/test/**/*.test.ts', 'extensions/*/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'test/fixtures/**'],
  },
});
