import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { padded } from './support/long-messages.ts';
import { requestMessages, says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// Seven turns of a message and an answer: 14 messages, of which four are older than the last 10.
async function history(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, text: (index: number) => string): Promise<void> {
  for (const index of [1, 2, 3, 4, 5, 6, 7]) {
    fake.reply(says(`answer ${index}`));
    await kernel.exec('kvcoder.message.send', { sessionId, text: text(index) });
    await kernel.clock.advance(0);
  }
}

async function stored(kernel: TestKernel, sessionId: string, kind: string) {
  return (await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 })).messages.filter((message) => message.kind === kind);
}

describe("a summary's minimum, and what a summary by hand answers (08 §8.1, ADR 0019, 5, 7, and 8)", { timeout: 30_000 }, () => {
  it('QA26-H5 kvcoder.session.compact says whether a summary was made, and a second one at once makes none', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId, (index) => padded(`message ${index}`));
    fake.reply(says('SUMMARY'));
    expect(await kernel.exec('kvcoder.session.compact', { sessionId })).toEqual({ summarized: true });
    expect((await stored(kernel, sessionId, 'summary')).map((message) => message.content)).toEqual([{ text: 'SUMMARY', coversThroughSeq: 3 }]);
    const calls = fake.requests().length;
    expect(await kernel.exec('kvcoder.session.compact', { sessionId })).toEqual({ summarized: false });
    expect(fake.requests()).toHaveLength(calls);
    expect(await stored(kernel, sessionId, 'summary')).toHaveLength(1);
  });

  it("QA26-H6 older messages below a tenth of the model's window aren't summarized, by a step or by hand", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId, (index) => `message ${index}`);
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.compactAt', value: 0.0001, scope: 'global' });
    const calls = fake.requests().length;
    fake.reply(says('answer 8'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'message 8' });
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(calls + 1);
    expect(requestMessages(fake).filter((message) => message.role === 'user')).toHaveLength(8);
    expect(await kernel.exec('kvcoder.session.compact', { sessionId })).toEqual({ summarized: false });
    expect(fake.requests()).toHaveLength(calls + 1);
    expect(await stored(kernel, sessionId, 'summary')).toEqual([]);
  });

  it('QA26-E4 a summary by hand that fails answers false and leaves its notice', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId, (index) => padded(`message ${index}`));
    fake.reply({ status: 500, body: { error: { message: 'down', type: 'server_error' } } });
    expect(await kernel.exec('kvcoder.session.compact', { sessionId })).toEqual({ summarized: false });
    expect((await stored(kernel, sessionId, 'notice')).map((message) => message.content)).toEqual([{ code: 'SUMMARY_FAILED', params: { code: 'kvai/PROVIDER_ERROR' } }]);
    expect(await stored(kernel, sessionId, 'summary')).toEqual([]);
  });
});
