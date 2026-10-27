import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { build } from 'vite';

// kvvideo's custom component (plan 16 §16.8): `web/components/player.vue` builds into `dist/web/components/player.js`
// and `player.css`, the two files kvwebui loads, with `vue` left to kvwebui's import map.
const root = fileURLToPath(new URL('.', import.meta.url));
const components = ['player'];

rmSync(`${root}/dist/web`, { recursive: true, force: true });
for (const name of components) {
  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    plugins: [vue()],
    resolve: { conditions: ['@kvman/source', 'module', 'browser', 'development|production'] },
    build: {
      outDir: 'dist/web/components',
      emptyOutDir: false,
      lib: { entry: `web/components/${name}.vue`, formats: ['es'], fileName: () => `${name}.js`, cssFileName: name },
      rolldownOptions: { external: ['vue'] },
    },
  });
}
