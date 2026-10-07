import { defineProject } from 'vitest/config';

// The desktop app's page tests (plan 12 §12.1): the home screen in happy-dom against a fake of the shell's functions.
export default defineProject({
  test: {
    name: 'desktop-web',
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
});
