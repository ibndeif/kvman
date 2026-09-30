import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import { createTestKernel, type TestKernel } from '@kvman/testkit';

// kvwebui in a test kernel, beside test extensions written to a temporary folder; everything is closed and removed
// after each test.

const kvwebuiFolder = fileURLToPath(new URL('../..', import.meta.url));

export type TestExtension = { name: string; namespace: string; body: string };

function writeExtension(root: string, extension: TestExtension): string {
  const folder = path.join(root, extension.name.replace('/', '__'));
  mkdirSync(folder);
  const manifest = { name: extension.name, version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: extension.namespace, source: 'index.ts' } };
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(folder, 'index.ts'), `import { z, type Ctx } from '@kvman/sdk';\n\nexport default (ctx: Ctx): void => {\n${extension.body}\n};\n`);
  return folder;
}

export function useKvwebuiKernel(): { start(extensions: readonly TestExtension[]): Promise<TestKernel> } {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const close of closers.splice(0).reverse()) await close();
  });
  return {
    start: async (extensions) => {
      const root = mkdtempSync(path.join(tmpdir(), 'kvwebui-test-'));
      closers.push(() => Promise.resolve(rmSync(root, { recursive: true, force: true })));
      const kernel = await createTestKernel({ extensions: [kvwebuiFolder, ...extensions.map((extension) => writeExtension(root, extension))], settings: { 'kvwebui.home': 'kvwebui.extensions' } });
      closers.push(() => kernel.close());
      return kernel;
    },
  };
}
