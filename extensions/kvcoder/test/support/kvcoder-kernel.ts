import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import type { Json } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { startFakeOpenAI, type FakeOpenAI } from '@kvman/testkit/fake-openai';
import type {} from '@kvman/kvai';
import type {} from '../../src/index.ts';
import { todoEntry } from './todo-extension.ts';

// kvcoder in a test kernel with kvai and kvwebui, the `todo` fixture, and the fake OpenAI server as the custom provider
// `fake`: `fake/m1` takes text and images, `fake/m2` text only. Everything is closed and removed after each test.

const extensionsFolder = fileURLToPath(new URL('../../..', import.meta.url));

export const kvcoderFolder = path.join(extensionsFolder, 'kvcoder');

export type FixtureExtension = { name: string; namespace: string; entry: string; dependencies?: Record<string, string> };

export const todo: FixtureExtension = { name: '@test/todo', namespace: 'todo', entry: todoEntry, dependencies: { '@kvman/kvcoder': '^0.1.0' } };

export type World = { kernel: TestKernel; fake: FakeOpenAI; root: string };

export type StartOptions = { settings?: Record<string, Json>; extensions?: readonly FixtureExtension[] };

function writeExtension(root: string, extension: FixtureExtension): string {
  const folder = path.join(root, extension.name.replace('/', '__'));
  mkdirSync(folder);
  const manifest = { name: extension.name, version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: extension.namespace, source: 'index.ts', dependencies: extension.dependencies ?? {} } };
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(folder, 'index.ts'), extension.entry);
  return folder;
}

const fakeModel = { reasoning: true, contextWindow: 128_000, maxTokens: 8192 };

export function useKvcoder(): { start(options?: StartOptions): Promise<World> } {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const close of closers.splice(0).reverse()) await close();
  });
  return {
    start: async (options = {}) => {
      const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-test-'));
      closers.push(() => Promise.resolve(rmSync(root, { recursive: true, force: true })));
      const fake = await startFakeOpenAI();
      closers.push(() => fake.close());
      const extensions = [path.join(extensionsFolder, 'kvai'), path.join(extensionsFolder, 'kvwebui'), kvcoderFolder, ...(options.extensions ?? [todo]).map((extension) => writeExtension(root, extension))];
      const settings = { 'kvwebui.home': 'kvcoder.chat', 'kvai.defaultModel': 'fake/m1', 'kvcoder.shell.approval': 'auto', ...options.settings };
      const kernel = await createTestKernel({ extensions, settings });
      closers.push(() => kernel.close());
      await kernel.exec('kvai.provider.add', { id: 'fake', title: 'Fake', api: 'openai-completions', baseUrl: fake.baseUrl });
      await kernel.exec('kvai.model.add', { provider: 'fake', id: 'm1', name: 'M1', input: ['text', 'image'], ...fakeModel });
      await kernel.exec('kvai.model.add', { provider: 'fake', id: 'm2', name: 'M2', input: ['text'], ...fakeModel });
      return { kernel, fake, root };
    },
  };
}
