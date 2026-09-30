import { defineProject } from 'vitest/config';

const sourceConditions = ['@kvman/source', 'module', 'node', 'default'];

// kvwebui's end-to-end tests (plan 12 §12.1, ADR 0009, 67): Chromium through the `playwright` library against a real
// kvman. The global setup builds kvwebui first, since `pnpm test` runs before `pnpm build`.
export default defineProject({
  resolve: { conditions: sourceConditions },
  ssr: { resolve: { conditions: sourceConditions, externalConditions: ['@kvman/source'] } },
  test: {
    name: 'kvwebui-e2e',
    include: ['test/e2e/**/*.test.ts'],
    globalSetup: ['test/e2e/build-kvwebui.ts'],
  },
});
