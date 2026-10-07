import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI, FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { padded } from './support/long-messages.ts';
import { says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// Seven turns of a long message and an answer: 47,250 tokens by their characters, under the default
// `kvcoder.compactAt` (102,400 of the fake model's 128,000). The last answer is the chat's last model call.
async function history(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, last: FakeReply): Promise<void> {
  for (const index of [1, 2, 3, 4, 5, 6, 7]) {
    fake.reply(index === 7 ? last : says(`answer ${index}`));
    await kernel.exec('kvcoder.message.send', { sessionId, text: padded(`message ${index}`) });
    await kernel.clock.advance(0);
  }
}

const compactAt = (kernel: TestKernel, value: number) => kernel.exec('kernel.settings.set', { key: 'kvcoder.compactAt', value, scope: 'global' });

async function send(kernel: TestKernel, sessionId: string, text: string): Promise<void> {
  await kernel.exec('kvcoder.message.send', { sessionId, text });
  await kernel.clock.advance(0);
}

async function listed(kernel: TestKernel, sessionId: string) {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  return { summaries: messages.filter((message) => message.kind === 'summary').map((message) => message.content['text']), last: messages.at(-1) };
}

const answer = (text: string) => ({ kind: 'assistant', content: { content: [{ type: 'text', text }] } });

describe("compaction counts the prompt as the provider does (08 §8.1, ADR 0033, 2, 4, and 5)", { timeout: 30_000 }, () => {
  it("QA45-H2 a chat is summarized when its last call's reported prompt, cached tokens included, passes compactAt", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId, { chunks: [{ text: 'answer 7' }], usage: { input: 60_000, cacheRead: 45_000, output: 10 } });
    expect((await listed(kernel, sessionId)).summaries).toEqual([]);
    fake.reply(says('SUMMARY'), says('answer 8'));
    await send(kernel, sessionId, 'message 8');
    const after = await listed(kernel, sessionId);
    expect(after.summaries).toEqual(['SUMMARY']);
    expect(after.last).toMatchObject(answer('answer 8'));
  });

  it('QA45-H3 a chat the provider counts as small is not summarized, whatever its stored characters', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId, { chunks: [{ text: 'answer 7' }], usage: { input: 1000, cacheRead: 20_000, output: 10 } });
    await compactAt(kernel, 0.3);
    fake.reply(says('answer 8'));
    await send(kernel, sessionId, 'message 8');
    const after = await listed(kernel, sessionId);
    expect(after.summaries).toEqual([]);
    expect(after.last).toMatchObject(answer('answer 8'));
    expect(fake.requests()).toHaveLength(8);
  });

  it("QA45-E2 a call from before the summary doesn't count", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId, { chunks: [{ text: 'answer 7' }], usage: { input: 60_000, cacheRead: 45_000, output: 10 } });
    fake.reply(says('SUMMARY'), says('answer 8'));
    await send(kernel, sessionId, 'message 8');
    fake.reply(says('answer 9'));
    await send(kernel, sessionId, 'message 9');
    const after = await listed(kernel, sessionId);
    expect(after.summaries).toEqual(['SUMMARY']);
    expect(after.last).toMatchObject(answer('answer 9'));
    expect(fake.requests()).toHaveLength(10);
  });

  it('QA45-E4 with no reported tokens, the characters of what is sent are counted', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId, says('answer 7'));
    await compactAt(kernel, 0.3);
    fake.reply(says('SUMMARY'), says('answer 8'));
    await send(kernel, sessionId, 'message 8');
    const after = await listed(kernel, sessionId);
    expect(after.summaries).toEqual(['SUMMARY']);
    expect(after.last).toMatchObject(answer('answer 8'));
  });
});
