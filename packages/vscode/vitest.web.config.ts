import { defineProject } from 'vitest/config';

// The view's page tests (plan 12 §12.1): its HTML and its relay script in happy-dom.
export default defineProject({
  test: {
    name: 'vscode-web',
    environment: 'happy-dom',
    include: ['test/web/**/*.test.ts'],
  },
});
