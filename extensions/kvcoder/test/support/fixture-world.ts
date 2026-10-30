import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z, type Json } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { startFakeOpenAI, type FakeOpenAI } from '@kvman/testkit/fake-openai';
import { kvcoderFolder } from './kvcoder-kernel.ts';
import { newSession } from './turns.ts';

// A kernel whose kvcoder is a fixture entry around the real one, with the lead's model on `fake` and its helpers' on
// `helperFake` (ADR 0108, 1), so lead and helper replies never race for one queue.

export type FixtureCheck = (kernel: TestKernel, fake: FakeOpenAI, sessionId: string, helperFake: FakeOpenAI) => Promise<void>;

const manifestSchema = z.object({ name: z.string(), version: z.string(), peerDependencies: z.record(z.string(), z.string()), kvman: z.object({ namespace: z.string(), dependencies: z.record(z.string(), z.string()) }) });
const model = { name: 'M1', input: ['text' as const], reasoning: true, contextWindow: 128_000, maxTokens: 8192 };

function writeFixture(root: string, entry: string): void {
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(path.join(kvcoderFolder, 'package.json'), 'utf8')));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ ...manifest, type: 'module', main: 'index.js', kvman: { ...manifest.kvman, source: 'index.ts' } }));
  writeFileSync(path.join(root, 'index.ts'), entry);
  cpSync(path.join(kvcoderFolder, 'locales'), path.join(root, 'locales'), { recursive: true });
}

/** Runs `check` on a fresh fixture kernel and chat, then closes everything. */
export async function withFixtureWorld(prefix: string, entry: string, check: FixtureCheck, settings: Record<string, Json>): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  const closers: (() => Promise<void>)[] = [async () => Promise.resolve(rmSync(root, { recursive: true, force: true }))];
  try {
    const fake = await startFakeOpenAI();
    closers.push(() => fake.close());
    const helperFake = await startFakeOpenAI();
    closers.push(() => helperFake.close());
    writeFixture(root, entry);
    const kernel = await createTestKernel({ extensions: [path.join(kvcoderFolder, '../kvai'), path.join(kvcoderFolder, '../kvwebui'), root], settings: { 'kernel.workers': 2, 'kvwebui.home': 'kvcoder.chat', 'kvai.defaultModel': 'fake/m1', 'kvcoder.delegate.model': 'helper/m1', ...settings } });
    closers.push(() => kernel.close());
    for (const [id, server] of [['fake', fake], ['helper', helperFake]] as const) {
      await kernel.exec('kvai.provider.add', { id, title: id, api: 'openai-completions', baseUrl: server.baseUrl });
      await kernel.exec('kvai.model.add', { provider: id, id: 'm1', ...model });
    }
    await check(kernel, fake, await newSession(kernel), helperFake);
  } finally {
    for (const close of closers.reverse()) await close();
  }
}
