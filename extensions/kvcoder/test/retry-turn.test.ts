import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { requestMessages, says, textOf, unstamped } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();
const invalid = { problem: { code: 'VALIDATION_FAILED' } };
const limit = { status: 403, body: { error: { message: 'The user has reached their usage limit.', type: 'invalid_request_error' } } };
const listSchema = z.object({ messages: z.array(z.object({ kind: z.string(), content: z.record(z.string(), z.unknown()) })) });
const kinds = async (kernel: TestKernel, sessionId: string) => listSchema.parse(await kernel.exec('kvcoder.message.list', { sessionId, limit: 50 })).messages.map((message) => message.kind);

describe('a failed turn is retried without a message (KVC-35 and KVC-37, ADR 0050)', { timeout: 30_000 }, () => {
  it('M2.4-E148 a usage limit ends the turn at once, with its code in the notice', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(limit);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(1);
    expect(await turnState(kernel, sessionId)).toMatchObject({ session: { status: 'idle' }, turn: { outcome: 'failed' } });
    const { messages } = listSchema.parse(await kernel.exec('kvcoder.message.list', { sessionId, limit: 50 }));
    expect(messages.at(-1)?.content).toEqual({ code: 'STEP_FAILED', params: { code: 'kvai/USAGE_LIMIT', details: { model: 'fake/m1' } } });
  });

  it('M2.4-E149 Retry runs the turn again on the same history and adds no message', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(limit, says('Done.'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(await kernel.exec('kvcoder.turn.retry', { sessionId })).toEqual({});
    await kernel.clock.advance(0);
    expect(await kinds(kernel, sessionId)).toEqual(['user', 'notice', 'assistant']);
    expect(requestMessages(fake).filter((sent) => sent.role === 'user').map((sent) => unstamped(textOf(sent)))).toEqual(['go']);
    expect(await turnState(kernel, sessionId)).toMatchObject({ session: { status: 'idle' }, turn: { outcome: 'done' } });
  });

  it("M2.4-E149 Retry fails when the chat's last turn didn't stop, and changes nothing", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await expect(kernel.exec('kvcoder.turn.retry', { sessionId })).rejects.toMatchObject(invalid);
    fake.reply(says('Done.'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    await expect(kernel.exec('kvcoder.turn.retry', { sessionId })).rejects.toMatchObject(invalid);
    expect(await kinds(kernel, sessionId)).toEqual(['user', 'assistant']);
    expect(fake.requests()).toHaveLength(1);
    await expect(kernel.exec('kvcoder.turn.retry', { sessionId }, { as: '@test/todo' })).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
  });
});
