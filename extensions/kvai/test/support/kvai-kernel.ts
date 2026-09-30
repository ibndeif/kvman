import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import { createTestKernel, type ProgressChunk, type TestKernel, type TestKernelOptions } from '@kvman/testkit';
import { startFakeOpenAI, type FakeOpenAI } from '@kvman/testkit/fake-openai';
import type {} from '../../src/index.ts';

// kvai in a test kernel, beside test extensions written to a temporary folder, with the fake OpenAI server added as
// the custom provider `fake` (plan 07 §7.4). Everything is closed and removed after each test.

export const kvaiFolder = fileURLToPath(new URL('../..', import.meta.url));

export type TestExtension = { name: string; namespace: string; entry: string };

export type KvaiWorld = { kernel: TestKernel; fake: FakeOpenAI };

const fakeModel = { reasoning: true, input: ['text' as const], contextWindow: 128_000, maxTokens: 8192 };

// The price of `fake/m1`, in US dollars per million tokens.
export const m1Cost = { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 1.5 };

function writeExtension(root: string, extension: TestExtension): string {
  const folder = path.join(root, extension.name.replace('/', '__'));
  mkdirSync(folder);
  const manifest = { name: extension.name, version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: extension.namespace, source: 'index.ts' } };
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(folder, 'index.ts'), extension.entry);
  return folder;
}

// An entry's source: the SDK import, then the body of the default-exported function of `ctx`.
export function entry(body: string): string {
  return `import { z, type Ctx } from '@kvman/sdk';\n\nexport default (ctx: Ctx): void => {\n${body}\n};\n`;
}

// A harness whose command calls `kvai.complete` with its input, so the harness job is the root of the call.
export const harness: TestExtension = {
  name: '@test/harness',
  namespace: 'harness',
  entry: entry(`
  ctx.registerCommand('harness.turn', { description: 'Calls kvai.complete.', input: z.record(z.string(), z.unknown()), output: z.unknown(), public: true,
    handle: (input) => ctx.exec('kvai.complete', input) });`),
};

export function useKvai(): { start(options?: Omit<TestKernelOptions, 'extensions'>, extensions?: readonly TestExtension[]): Promise<KvaiWorld> } {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const close of closers.splice(0).reverse()) await close();
  });
  return {
    start: async (options = {}, extensions = [harness]) => {
      const root = mkdtempSync(path.join(tmpdir(), 'kvai-test-'));
      closers.push(() => Promise.resolve(rmSync(root, { recursive: true, force: true })));
      const fake = await startFakeOpenAI();
      closers.push(() => fake.close());
      const kernel = await createTestKernel({ ...options, extensions: [kvaiFolder, ...extensions.map((extension) => writeExtension(root, extension))] });
      closers.push(() => kernel.close());
      await kernel.exec('kvai.provider.add', { id: 'fake', title: 'Fake', api: 'openai-completions', baseUrl: fake.baseUrl });
      await kernel.exec('kvai.model.add', { provider: 'fake', id: 'm1', name: 'M1', ...fakeModel, cost: m1Cost });
      await kernel.exec('kvai.model.add', { provider: 'fake', id: 'm2', name: 'M2', ...fakeModel });
      return { kernel, fake };
    },
  };
}

// The chunks kvai streamed, from a list of a root job's progress chunks.
export function kvaiDeltas(chunks: readonly ProgressChunk[]): unknown[] {
  return chunks.filter((chunk) => chunk.source === '@kvman/kvai').map((chunk) => chunk.data);
}

// A user message, as pi-ai's JSON has it.
export function userSays(text: string): { role: 'user'; content: string; timestamp: number } {
  return { role: 'user', content: text, timestamp: 1 };
}
