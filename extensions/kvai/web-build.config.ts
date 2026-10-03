import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { build } from 'vite';

// kvai's custom components (plan 07 §7.3, ADR 0009, 237): each `web/components/<name>.vue` builds on its own into
// `dist/web/components/<name>.js` and `<name>.css`, the two files kvwebui loads, with `vue` left to kvwebui's import
// map. One build per component keeps each self-contained: no shared chunk holds another component's styles.
const root = fileURLToPath(new URL('.', import.meta.url));
const components = ['connection'];

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
