import { describe, expect, it } from 'vitest';
import type { FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();
const cut: FakeReply = { chunks: [{ text: 'Here is the first half of the answer' }], finish: 'length' };
const empty: FakeReply = { chunks: [] };

async function started() {
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  const send = async (text: string): Promise<void> => {
    await world.kernel.exec('kvcoder.message.send', { sessionId, text });
    await world.kernel.clock.advance(0);
  };
  const messages = async () => (await world.kernel.exec('kvcoder.message.list', { sessionId, limit: 100 })).messages;
  return { ...world, sessionId, send, messages };
}

describe('an empty or cut reply is not the end of the task (KVC-14, ADR 0054)', { timeout: 30_000 }, () => {
  it.each([['length', cut], ['empty', empty]] as const)('M2.4-E162 a reply that is %s gets one hint and another step', async (_reason, reply) => {
    const { kernel, fake, sessionId, send, messages } = await started();
    fake.reply(reply, says('and the rest'));
    await send('go');
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', steps: 2 });
    const all = await messages();
    const hints = all.filter((message) => message.source?.kind === 'extension');
    expect(hints).toHaveLength(1);
    expect(String(hints[0]?.content['content'])).toMatch(/^Your last reply was (empty|cut off at the length limit)/);
    expect(all.filter((message) => message.kind === 'assistant')).toHaveLength(2);
    expect(fake.requests()).toHaveLength(2);
  });

  it('M2.4-E162 a normal answer is not incomplete', async () => {
    const { kernel, fake, sessionId, send, messages } = await started();
    fake.reply(says('ok'));
    await send('go');
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', steps: 1 });
    expect((await messages()).some((message) => message.source?.kind === 'extension')).toBe(false);
  });

  it('M2.4-E163 a second incomplete reply ends the turn with REPLY_INCOMPLETE, and Retry runs it again', async () => {
    const { kernel, fake, sessionId, send, messages } = await started();
    fake.reply(cut, empty, says('never asked'));
    await send('go');
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'failed', steps: 2 });
    expect((await messages()).at(-1)).toMatchObject({ kind: 'notice', content: { code: 'REPLY_INCOMPLETE', params: { reason: 'empty' } } });
    expect(fake.requests()).toHaveLength(2);
    await kernel.exec('kvcoder.turn.retry', { sessionId });
    await kernel.clock.advance(0);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' });
  });
});
