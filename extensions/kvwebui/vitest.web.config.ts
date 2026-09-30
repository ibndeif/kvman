import vue from '@vitejs/plugin-vue';
import { defineProject } from 'vitest/config';

// kvwebui's component tests (plan 12 §12.1): the app mounted in happy-dom against a fake API.
export default defineProject({
  plugins: [vue()],
  resolve: { conditions: ['@kvman/source', 'module', 'browser', 'development|production'] },
  test: {
    name: 'kvwebui-web',
    environment: 'happy-dom',
    include: ['test/web/**/*.test.ts'],
  },
});
