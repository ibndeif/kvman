import { copyFileSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { z } from 'zod';

// The extension's bundle (plan 15 §15.8, ADR 0099, 12): one CommonJS file with zod inside and `vscode` and the Node
// built-ins outside, in `dist/extension` beside the manifest, its texts, the page's stylesheet, the icons, the README,
// and the license. `tsc -p tsconfig.page.json` then adds the page's script. VS Code loads this folder as it is.

const root = import.meta.dirname;
const out = path.join(root, 'dist/extension');

function stageExtension(): Plugin {
  return {
    name: 'kvman-stage-extension',
    closeBundle() {
      const read = (file: string): unknown => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
      const { version } = z.object({ version: z.string() }).parse(read('package.json'));
      const manifest = z.record(z.string(), z.unknown()).parse(read('manifest.json'));
      writeFileSync(path.join(out, 'package.json'), `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
      cpSync(path.join(root, 'static'), out, { recursive: true });
      copyFileSync(path.join(root, 'README.md'), path.join(out, 'README.md'));
      copyFileSync(path.join(root, '../../LICENSE'), path.join(out, 'LICENSE'));
    },
  };
}

export default defineConfig({
  plugins: [stageExtension()],
  build: {
    outDir: out,
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: false,
    lib: { entry: path.join(root, 'src/extension.ts'), formats: ['cjs'], fileName: () => 'extension.js' },
    rollupOptions: { external: ['vscode', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)] },
  },
});
