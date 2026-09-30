import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// kvwebui's app (plan 06 §6.1): built from `web/` into `dist/web`, the `kvman.web` folder the kernel serves at `/`.
export default defineConfig({
  root: 'web',
  base: '/',
  plugins: [vue(), tailwindcss()],
  resolve: { conditions: ['@kvman/source', 'module', 'browser', 'development|production'] },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
    // Contributed icons load one module each, on demand; the frame's own few icons are also imported directly, so they
    // stay in the main chunk. That's intended, so the warning about those few isn't useful.
    rolldownOptions: { checks: { ineffectiveDynamicImport: false } },
  },
});
