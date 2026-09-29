import { defineConfig } from 'vitest/config';

const sourceConditions = ['@kvman/source', 'module', 'node', 'default'];

const tests = ['test/**/*.test.ts', 'packages/*/test/**/*.test.ts', 'extensions/*/test/**/*.test.ts', 'examples/*/test/**/*.test.ts'];

const excluded = ['**/node_modules/**', 'test/fixtures/**'];

// Tests that assert wall-clock latency run after every other test, one file at a time, so no parallel test load
// decides their outcome (ADR 0131).
const timing = ['packages/*/test/**/*.timing.test.ts'];

// ADR 0165: the createTestKernel suites run a second time with the extensions under test sandboxed.
const testKernelSuites = ['packages/testkit/test/test-kernel/**/*.test.ts', 'packages/testkit/test/prompts/**/*.test.ts', 'examples/*/test/**/*.test.ts', 'extensions/*/test/**/*.test.ts'];

export default defineConfig({
  resolve: { conditions: sourceConditions },
  ssr: { resolve: { conditions: sourceConditions, externalConditions: ['@kvman/source'] } },
  test: {
    allowOnly: false,
    // Each test file runs a kernel with its worker threads, sandboxed hosts, or a child daemon (~300–600 MB); half the
    // cores keeps a full run within a developer machine's memory.
    maxWorkers: '50%',
    globalSetup: ['./test/temporary-folder.ts'],
    projects: [
      { extends: true, test: { name: 'parallel', include: tests, exclude: [...excluded, ...timing], sequence: { groupOrder: 0 } } },
      {
        extends: true,
        test: { name: 'sandboxed', include: testKernelSuites, exclude: [...excluded, ...timing], env: { KVMAN_TESTKIT_ISOLATION: 'sandboxed' }, sequence: { groupOrder: 0 } },
      },
      { extends: true, test: { name: 'timing', include: timing, exclude: excluded, fileParallelism: false, sequence: { groupOrder: 1 } } },
    ],
  },
});
