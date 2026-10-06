import { defineProject } from 'vitest/config';

const sourceConditions = ['@kvman/source', 'module', 'node', 'default'];

// kvbuilder's scaffold and end-to-end tests (plan 12 §12.1, ADR 0009, 113): they install scaffolds from the in-test
// registry and run real kvman children, with Chromium through the `playwright` library, one file at a time, since
// previews take ports from 3738. The global setup builds the packages and bundled extensions, and packs and serves the
// scaffold's packages.
export default defineProject({
  resolve: { conditions: sourceConditions },
  ssr: { resolve: { conditions: sourceConditions, externalConditions: ['@kvman/source'] } },
  test: {
    name: 'kvbuilder-e2e',
    include: ['test/scaffold/**/*.test.ts', 'test/e2e/**/*.test.ts'],
    globalSetup: ['test/e2e/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
