import vue from '@vitejs/plugin-vue';
import { defineProject } from 'vitest/config';

// kvvideo's component tests (plan 16 §16.10): the player mounted in happy-dom with a fake injected `kvman`.
export default defineProject({
  plugins: [vue()],
  resolve: { conditions: ['@kvman/source', 'module', 'browser', 'development|production'] },
  test: {
    name: 'kvvideo-web',
    environment: 'happy-dom',
    include: ['test/web/**/*.test.ts'],
  },
});
