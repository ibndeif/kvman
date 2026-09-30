import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { z } from '@kvman/sdk';
import { createTestKernel, type TestKernel, type TestKernelOptions } from '../src/index.ts';

// Test extensions written to a temporary folder: no node_modules there, so `@kvman/sdk` resolves only through the
// kernel. Each is a `path:` extension whose `index.ts` entry loads through Node's type stripping.

export type TestExtension = {
  name: string;
  namespace: string;
  entry: string;
  version?: string;
  sdkRange?: string;
  dependencies?: Record<string, string>;
  kvmanExtra?: Record<string, unknown>;
};

function writeExtension(root: string, extension: TestExtension): string {
  const folder = path.join(root, extension.name.replace('/', '__'));
  mkdirSync(folder);
  const peerDependencies = extension.sdkRange === '' ? {} : { '@kvman/sdk': extension.sdkRange ?? '^0.1.0' };
  const kvman = { namespace: extension.namespace, source: 'index.ts', dependencies: extension.dependencies ?? {}, ...extension.kvmanExtra };
  const manifest = { name: extension.name, version: extension.version ?? '0.1.0', type: 'module', main: 'index.js', peerDependencies, kvman };
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(folder, 'index.ts'), extension.entry);
  return folder;
}

const logLineSchema = z.record(z.string(), z.unknown());

export type Harness = {
  start(extensions: readonly TestExtension[], options?: Omit<TestKernelOptions, 'extensions'>): Promise<TestKernel>;
  logLines(kernel: TestKernel): Record<string, unknown>[];
};

// Starts test kernels on temporary extensions, and closes and removes them after each test.
export function useHarness(): Harness {
  const roots: string[] = [];
  const kernels: TestKernel[] = [];
  afterEach(async () => {
    for (const kernel of kernels.splice(0)) await kernel.close();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  return {
    start: async (extensions, options) => {
      const root = mkdtempSync(path.join(tmpdir(), 'kvman-extensions-'));
      roots.push(root);
      const kernel = await createTestKernel({ ...options, extensions: extensions.map((extension) => writeExtension(root, extension)) });
      kernels.push(kernel);
      return kernel;
    },
    logLines: (kernel) =>
      readFileSync(path.join(kernel.home, 'logs', 'kvman.log'), 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => logLineSchema.parse(JSON.parse(line))),
  };
}

// An entry's source: the SDK import, then the body of the default-exported function of `ctx`.
export function entry(body: string): string {
  return `import { z, ProblemError, type Ctx } from '@kvman/sdk';\n\nexport default (ctx: Ctx): void => {\n${body}\n};\n`;
}
