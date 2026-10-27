import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import type { Json } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { startFakeOpenAI, type FakeOpenAI } from '@kvman/testkit/fake-openai';
import type {} from '@kvman/kvcoder';
import type {} from '../../src/index.ts';

// kvvideo in a test kernel with kvai, kvwebui, and kvcoder, all as `path:` extensions. Its commands run in the Home
// workspace, the test kernel's own temporary folder; `write` puts files there. Closed after each test.

export const extensionsFolder = fileURLToPath(new URL('../../..', import.meta.url));

export const bundledFolders = ['kvai', 'kvwebui', 'kvcoder', 'kvvideo'].map((name) => path.join(extensionsFolder, name));

export type KvvideoWorld = { kernel: TestKernel; workspace: string; write(file: string, content: string | Uint8Array): string };

export type StartOptions = { settings?: Record<string, Json>; secrets?: Record<string, string> };

export function writeIn(root: string, file: string, content: string | Uint8Array): string {
  const absolute = path.join(root, file);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
  return absolute;
}

export function useKvvideo(): { start(options?: StartOptions): Promise<KvvideoWorld>; withModel(options?: StartOptions): Promise<KvvideoWorld & { fake: FakeOpenAI }> } {
  const kernels: TestKernel[] = [];
  const fakes: FakeOpenAI[] = [];
  afterEach(async () => {
    for (const kernel of kernels.splice(0)) await kernel.close();
    for (const fake of fakes.splice(0)) await fake.close();
  });
  const start = async ({ settings = {}, secrets = {} }: StartOptions = {}): Promise<KvvideoWorld> => {
    const kernel = await createTestKernel({ extensions: bundledFolders, settings: { 'kvwebui.home': 'kvcoder.chat', ...settings }, secrets: { '@kvman/kvvideo': secrets } });
    kernels.push(kernel);
    await kernel.clock.advance(0);
    return { kernel, workspace: kernel.homeFolder, write: (file, content) => writeIn(kernel.homeFolder, file, content) };
  };
  return {
    start,
    withModel: async (options = {}) => {
      const fake = await startFakeOpenAI();
      fakes.push(fake);
      const world = await start({ ...options, settings: { 'kvai.defaultModel': 'fake/m1', 'kvcoder.approval': 'auto', ...options.settings } });
      await world.kernel.exec('kvai.provider.add', { id: 'fake', title: 'Fake', api: 'openai-completions', baseUrl: fake.baseUrl });
      await world.kernel.exec('kvai.model.add', { provider: 'fake', id: 'm1', name: 'M1', input: ['text'], reasoning: true, contextWindow: 128_000, maxTokens: 8192 });
      await world.kernel.clock.advance(0);
      return { ...world, fake };
    },
  };
}

/** A new chat with making videos on, as after `/video`. */
export async function videoSession(kernel: TestKernel, title = 'Video'): Promise<string> {
  const { id } = await kernel.exec('kvcoder.session.create', { title });
  await kernel.exec('kvvideo.video.start', { sessionId: id, argument: '' });
  return id;
}
