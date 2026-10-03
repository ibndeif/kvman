import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import type { Json } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import type {} from '@kvman/kvcoder';
import type {} from '../../src/index.ts';

// kvcustomizer in a test kernel with kvai, kvwebui, and kvcoder, all as `path:` extensions. Its commands run in the Home
// workspace, whose folder is the test kernel's own temporary folder; `write` puts files there. Closed after each test.

export const extensionsFolder = fileURLToPath(new URL('../../..', import.meta.url));

export const bundledFolders = ['kvai', 'kvwebui', 'kvcoder', 'kvcustomizer'].map((name) => path.join(extensionsFolder, name));

export type KvcustomizerWorld = { kernel: TestKernel; workspace: string; write(file: string, content: string | Json): string };

export function writeIn(root: string, file: string, content: string | Json): string {
  const absolute = path.join(root, file);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, typeof content === 'string' ? content : JSON.stringify(content));
  return absolute;
}

/** A project manifest, as `ext new` writes one, for tests that need a project without npm. */
export function manifest(name: string, namespace: string, extra: Record<string, Json> = {}): Json {
  return { name, version: '0.1.0', type: 'module', main: 'dist/index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace, source: 'src/index.ts', dependencies: {} }, ...extra };
}

export function useKvcustomizer(): { start(settings?: Record<string, Json>): Promise<KvcustomizerWorld> } {
  const kernels: TestKernel[] = [];
  afterEach(async () => {
    for (const kernel of kernels.splice(0)) await kernel.close();
  });
  return {
    start: async (settings = {}) => {
      const kernel = await createTestKernel({ extensions: bundledFolders, settings: { 'kvwebui.home': 'kvcoder.chat', ...settings } });
      kernels.push(kernel);
      return { kernel, workspace: kernel.homeFolder, write: (file, content) => writeIn(kernel.homeFolder, file, content) };
    },
  };
}
