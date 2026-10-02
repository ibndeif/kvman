import { describe, expect, it, vi } from 'vitest';
import { heldReply } from './support/held-reply.ts';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { calls, requestMessages, says, textOf } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

const roles = (messages: ReturnType<typeof requestMessages>) => messages.filter((message) => message.role !== 'system' && message.role !== 'developer').map((message) => `${message.role}:${textOf(message)}`);

describe('steering (08 §8.1, ADR 0009, 90 and 102)', { timeout: 30_000 }, () => {
  it("M2.4-E15 a message sent while a step runs is queued, then appended after the step's results", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const held = heldReply({ toolCall: { id: 'c1', name: 'bash', arguments: { title: 'x', command: 'echo a', description: 'x' } } });
    fake.reply(held.reply, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(1), wait);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'also this' });
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 10 });
    expect(messages.at(-1)).toMatchObject({ queued: true, kind: 'user', content: { content: 'also this' } });
    expect(messages.at(-1)?.seq).toBeUndefined();
    held.release();
    await kernel.clock.advance(0);
    expect(roles(requestMessages(fake))).toEqual(['user:go', 'assistant:', 'tool:a\n[exit code 0]', 'user:also this']);
    expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).toHaveLength(1);
  });

  it('M2.4-E16 a step with no calls ends the turn, unless messages arrived during it', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const held = heldReply({ text: 'first' });
    fake.reply(held.reply, says('second'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(1), wait);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'wait, one more' });
    held.release();
    await kernel.clock.advance(0);
    expect(roles(requestMessages(fake))).toEqual(['user:go', 'assistant:first', 'user:wait, one more']);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', steps: 2 });
  });

  it('M2.4-E17 while waiting only on subagents, a message is queued and read after their results', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const child = heldReply({ text: 'child answer' });
    fake.reply(calls(`subagent run '{"task":"Help","mode":"fresh"}'`), child.reply, says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(2), wait);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'meanwhile' });
    expect((await turnState(kernel, sessionId)).session.status).toBe('waiting');
    child.release();
    await kernel.clock.advance(0);
    expect(roles(requestMessages(fake)).slice(-2)).toEqual(['tool:child answer\n[exit code 0]', 'user:meanwhile']);
  });
});
