import vue from '@vitejs/plugin-vue';
import { defineProject } from 'vitest/config';

// kvai's component tests (plan 12 §12.1): its components mounted in happy-dom with a fake injected `kvman`.
export default defineProject({
  plugins: [vue()],
  resolve: { conditions: ['@kvman/source', 'module', 'browser', 'development|production'] },
  test: {
    name: 'kvai-web',
    environment: 'happy-dom',
    include: ['test/web/**/*.test.ts'],
  },
});
