import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { padded, unpadded } from './support/long-messages.ts';
import { fsCall, requestMessages, runs, says, textOf, unstamped } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// Seven turns of a long message and a short answer: 14 messages, with seq 0 to 13.
async function history(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, text: (index: number) => string = (index) => padded(`message ${index}`)): Promise<void> {
  for (const index of [1, 2, 3, 4, 5, 6, 7]) {
    fake.reply(says(`answer ${index}`));
    await kernel.exec('kvcoder.message.send', { sessionId, text: text(index) });
    await kernel.clock.advance(0);
  }
}

const keep = (kernel: TestKernel, value: number, scope: 'global' | 'workspace' = 'global') => kernel.exec('kernel.settings.set', { key: 'kvcoder.compactKeep', value, scope });

async function summaries(kernel: TestKernel, sessionId: string) {
  return (await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 })).messages.filter((message) => message.kind === 'summary').map((message) => message.content);
}

const sent = (fake: FakeOpenAI) => requestMessages(fake).filter((message) => message.role !== 'system' && message.role !== 'developer').map((message) => unpadded(unstamped(textOf(message))));

describe('the messages a summary keeps whole (08 §8.1, ADR 0020, 1)', { timeout: 30_000 }, () => {
  it('QA27-H1 a step above compactAt keeps kvcoder.compactKeep messages whole', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId);
    await keep(kernel, 4);
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.compactAt', value: 0.0001, scope: 'global' });
    fake.reply(says('SUMMARY'), says('answer 8'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'message 8' });
    await kernel.clock.advance(0);
    expect(await summaries(kernel, sessionId)).toEqual([{ text: 'SUMMARY', coversThroughSeq: 10 }]);
    expect(sent(fake)).toEqual(['A summary of the earlier conversation:\nSUMMARY', 'answer 6', 'message 7', 'answer 7', 'message 8']);
  });

  it('QA27-H2 a summary by hand keeps as many', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId);
    await keep(kernel, 6);
    fake.reply(says('SUMMARY'));
    expect(await kernel.exec('kvcoder.session.compact', { sessionId })).toEqual({ summarized: true });
    expect(await summaries(kernel, sessionId)).toEqual([{ text: 'SUMMARY', coversThroughSeq: 7 }]);
  });

  it('QA27-H3 the default is 10, in the global and workspace scopes', async () => {
    const { kernel, fake } = await kvcoder.start();
    const setting = (await kernel.exec('kernel.settings.list', {})).find((candidate) => candidate.key === 'kvcoder.compactKeep');
    expect(setting).toMatchObject({ value: 10, source: 'default', scopes: ['global', 'workspace'] });
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId);
    fake.reply(says('SUMMARY'));
    await kernel.exec('kvcoder.session.compact', { sessionId });
    expect(await summaries(kernel, sessionId)).toEqual([{ text: 'SUMMARY', coversThroughSeq: 3 }]);
  });

  it("QA27-H4 a workspace's own value wins over the global one", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId);
    await keep(kernel, 4);
    await keep(kernel, 8, 'workspace');
    fake.reply(says('SUMMARY'));
    await kernel.exec('kvcoder.session.compact', { sessionId });
    expect(await summaries(kernel, sessionId)).toEqual([{ text: 'SUMMARY', coversThroughSeq: 5 }]);
  });

  it('QA27-E1 a value out of range fails VALIDATION_FAILED and changes nothing', async () => {
    const { kernel } = await kvcoder.start();
    for (const value of [0, 101, 2.5]) await expect(keep(kernel, value)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect((await kernel.exec('kernel.settings.list', {})).find((candidate) => candidate.key === 'kvcoder.compactKeep')?.value).toBe(10);
  });

  it('QA27-E2 a chat with fewer messages than are kept has nothing to summarize', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId);
    await keep(kernel, 20);
    const calls = fake.requests().length;
    expect(await kernel.exec('kvcoder.session.compact', { sessionId })).toEqual({ summarized: false });
    expect(fake.requests()).toHaveLength(calls);
    expect(await summaries(kernel, sessionId)).toEqual([]);
  });

  it("QA27-E3 the minimum still holds: short older messages aren't summarized, however few are kept", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId, (index) => `message ${index}`);
    await keep(kernel, 1);
    const calls = fake.requests().length;
    expect(await kernel.exec('kvcoder.session.compact', { sessionId })).toEqual({ summarized: false });
    expect(fake.requests()).toHaveLength(calls);
    expect(await summaries(kernel, sessionId)).toEqual([]);
  });

  it("QA48-H16 a summary never ends between a reply's calls and their results, and the next step sends each result after its call", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId);
    // Seq 14 the message, 15 the reply with three calls, 16 to 18 their results, 19 the answer.
    fake.reply(runs(fsCall('list'), fsCall('list'), fsCall('list')), says('answer 8'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'message 8' });
    await kernel.clock.advance(0);
    await keep(kernel, 3);
    fake.reply(says('SUMMARY'));
    expect(await kernel.exec('kvcoder.session.compact', { sessionId })).toEqual({ summarized: true });
    expect(await summaries(kernel, sessionId)).toEqual([{ text: 'SUMMARY', coversThroughSeq: 14 }]);
    fake.reply(says('answer 9'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'message 9' });
    await kernel.clock.advance(0);
    const wire = requestMessages(fake).filter((message) => message.role !== 'system' && message.role !== 'developer');
    expect(wire.map((message) => message.role)).toEqual(['user', 'assistant', 'tool', 'tool', 'tool', 'assistant', 'user']);
    expect(wire[1]?.tool_calls).toHaveLength(3);
  });
});
