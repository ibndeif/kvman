import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI, FakeReply } from '@kvman/testkit/fake-openai';
import { padded } from './support/long-messages.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

// ADR 0087, 2: a model call that fails `kvai/CONTEXT_TOO_LONG` gets a summary by force and one more call.

const kvcoder = useKvcoder();

const tooLong: FakeReply = { status: 400, body: { error: { message: "This model's maximum context length is 128000 tokens. However, your messages resulted in 200000 tokens.", type: 'invalid_request_error' } } };

// Seven turns whose older messages pass a summary's minimum, under the default `kvcoder.compactAt`.
async function history(kernel: TestKernel, fake: FakeOpenAI, sessionId: string): Promise<void> {
  for (const index of [1, 2, 3, 4, 5, 6, 7]) {
    fake.reply(says(`answer ${index}`));
    await kernel.exec('kvcoder.message.send', { sessionId, text: padded(`message ${index}`) });
    await kernel.clock.advance(0);
  }
}

async function chat(kernel: TestKernel, sessionId: string) {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  return { summaries: messages.filter((message) => message.kind === 'summary'), notices: messages.filter((message) => message.kind === 'notice').map((message) => message.content) };
}

describe('a conversation too long for the model (ADR 0087, 2)', { timeout: 30_000 }, () => {
  it('QA55-H3 it is summarized and sent again, and the turn ends done', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId);
    const before = fake.requests().length;
    fake.reply(tooLong, says('SUMMARY'), says('answer 8'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'message 8' });
    await kernel.clock.advance(0);
    const { summaries, notices } = await chat(kernel, sessionId);
    expect(summaries.map((summary) => summary.content['text'])).toEqual(['SUMMARY']);
    expect(notices).toEqual([]);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' });
    expect(fake.requests().length - before).toBe(3);
  });

  it('QA55-E5 too long again after the summary ends the turn', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId);
    const before = fake.requests().length;
    fake.reply(tooLong, says('SUMMARY'), tooLong);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'message 8' });
    await kernel.clock.advance(0);
    expect((await chat(kernel, sessionId)).notices).toEqual([{ code: 'STEP_FAILED', params: { code: 'kvai/CONTEXT_TOO_LONG', details: { model: 'fake/m1' } } }]);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'failed' });
    expect(fake.requests().length - before).toBe(3);
  });

  it('QA55-E6 with nothing to summarize the turn ends without a second call', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(tooLong);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'short' });
    await kernel.clock.advance(0);
    const { summaries, notices } = await chat(kernel, sessionId);
    expect(summaries).toEqual([]);
    expect(notices).toEqual([{ code: 'STEP_FAILED', params: { code: 'kvai/CONTEXT_TOO_LONG', details: { model: 'fake/m1' } } }]);
    expect(fake.requests()).toHaveLength(1);
  });

  it('QA55-E7 a session whose model window is unknown is summarized on overflow', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvai.defaultModel': null } });
    const sessionId = await newSession(kernel);
    await kernel.exec('kernel.settings.set', { key: 'kvai.defaultModel', value: 'fake/m1', scope: 'global' });
    expect((await turnState(kernel, sessionId)).session.model).toBeNull();
    await history(kernel, fake, sessionId);
    fake.reply(tooLong, says('SUMMARY'), says('answer 8'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'message 8' });
    await kernel.clock.advance(0);
    expect((await chat(kernel, sessionId)).summaries.map((summary) => summary.content['text'])).toEqual(['SUMMARY']);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' });
  });
});
