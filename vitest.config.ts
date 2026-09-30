import { defineConfig } from 'vitest/config';

const sourceConditions = ['@kvman/source', 'module', 'node', 'default'];

export default defineConfig({
  resolve: { conditions: sourceConditions },
  ssr: { resolve: { conditions: sourceConditions, externalConditions: ['@kvman/source'] } },
  test: {
    allowOnly: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['test/**/*.test.ts', 'packages/*/test/**/*.test.ts', 'extensions/*/test/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'test/fixtures/**', 'extensions/kvwebui/test/web/**', 'extensions/kvwebui/test/e2e/**'],
        },
      },
      'extensions/kvwebui/vitest.web.config.ts',
      'extensions/kvwebui/vitest.e2e.config.ts',
    ],
  },
});
