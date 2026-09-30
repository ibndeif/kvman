import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vite';
import { z } from '@kvman/sdk';

const require = createRequire(import.meta.url);
const vueVersion = z.object({ version: z.string() }).parse(JSON.parse(readFileSync(require.resolve('vue/package.json'), 'utf8'))).version;

// One Vue for the app and every custom component (plan 06 §6.4): the app leaves `vue` unbundled, and the page's import
// map points it, for the app and for components alike, at Vue's own browser build, shipped beside the app with its
// version in the file name.
function sharedVue(): Plugin {
  const fileName = `vendor/vue-${vueVersion}.js`;
  return {
    name: 'kvwebui-shared-vue',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName, source: readFileSync(require.resolve('vue/dist/vue.runtime.esm-browser.prod.js'), 'utf8') });
    },
    transformIndexHtml: () => [{ tag: 'script', attrs: { type: 'importmap' }, children: JSON.stringify({ imports: { vue: `/${fileName}` } }), injectTo: 'head-prepend' }],
  };
}

// kvwebui's app (plan 06 §6.1): built from `web/` into `dist/web`, the `kvman.web` folder the kernel serves at `/`.
export default defineConfig({
  root: 'web',
  base: '/',
  plugins: [vue(), tailwindcss(), sharedVue()],
  resolve: { conditions: ['@kvman/source', 'module', 'browser', 'development|production'] },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
    rolldownOptions: {
      external: ['vue'],
      // Contributed icons load one module each, on demand; the frame's own few icons are also imported directly, so
      // they stay in the main chunk. That's intended, so the warning about those few isn't useful.
      checks: { ineffectiveDynamicImport: false },
    },
  },
});
