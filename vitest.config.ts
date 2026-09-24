import { defineConfig } from 'vitest/config';

export default defineConfig({
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
