import { startFakeOpenAI, type FakeOpenAI } from '@kvman/testkit/fake-openai';
import type { TestKernel } from '@kvman/testkit';
import { afterEach } from 'vitest';
import { useKvcustomizer } from './kvcustomizer-kernel.ts';

// kvcustomizer with a model the test scripts, so a real turn makes the calls. The fake model servers close after each test.

export function useScriptedModel(): { withModel(): Promise<{ kernel: TestKernel; fake: FakeOpenAI }> } {
  const kvcustomizer = useKvcustomizer();
  const fakes: FakeOpenAI[] = [];
  afterEach(async () => {
    for (const fake of fakes.splice(0)) await fake.close();
  });
  return {
    withModel: async () => {
      const fake = await startFakeOpenAI();
      fakes.push(fake);
      const { kernel } = await kvcustomizer.start({ 'kvai.defaultModel': 'fake/m1', 'kvcoder.shell.approval': 'auto' });
      await kernel.exec('kvai.provider.add', { id: 'fake', title: 'Fake', api: 'openai-completions', baseUrl: fake.baseUrl });
      await kernel.exec('kvai.model.add', { provider: 'fake', id: 'm1', name: 'M1', input: ['text'], reasoning: true, contextWindow: 128_000, maxTokens: 8192 });
      await kernel.clock.advance(0);
      return { kernel, fake };
    },
  };
}

/** A chat's status and its newest turn. */
export async function turn(kernel: TestKernel, sessionId: string) {
  const session = await kernel.exec('kvcoder.session.get', { sessionId });
  const [newest] = await kernel.exec('kvcoder.turn.list', { sessionId, limit: 1 });
  return { session, turn: newest };
}
