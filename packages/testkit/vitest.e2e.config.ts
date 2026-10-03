import { defineProject } from 'vitest/config';

const sourceConditions = ['@kvman/source', 'module', 'node', 'default'];

// The testkit's scaffold tests (plan 12 §12.1, ADR 0010, 2): they install `kvman-new` scaffolds from the in-test
// registry and run the built bins, one file at a time, since installs take a while. The global setup builds the
// packages and packs and serves the scaffold's packages.
export default defineProject({
  resolve: { conditions: sourceConditions },
  ssr: { resolve: { conditions: sourceConditions, externalConditions: ['@kvman/source'] } },
  test: {
    name: 'testkit-e2e',
    include: ['test/scaffold/**/*.test.ts', 'test/e2e/**/*.test.ts'],
    globalSetup: ['test/e2e/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
