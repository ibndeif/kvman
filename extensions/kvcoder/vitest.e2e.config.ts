import { defineProject } from 'vitest/config';

const sourceConditions = ['@kvman/source', 'module', 'node', 'default'];

// kvcoder's end-to-end and crash tests (plan 12 §12.1–12.2): Chromium through the `playwright` library, and SIGKILL,
// against a real kvman. The global setup builds the bundled extensions first, since `pnpm test` runs before `pnpm build`.
export default defineProject({
  resolve: { conditions: sourceConditions },
  ssr: { resolve: { conditions: sourceConditions, externalConditions: ['@kvman/source'] } },
  test: {
    name: 'kvcoder-e2e',
    include: ['test/e2e/**/*.test.ts', 'test/crash/**/*.test.ts'],
    globalSetup: ['test/e2e/build-extensions.ts'],
  },
});
