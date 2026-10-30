import { describe, expect, it, vi } from 'vitest';
import { heldReply } from './support/held-reply.ts';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, textOf, unstamped, withoutHelperId } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

const roles = (messages: ReturnType<typeof requestMessages>) => messages.filter((message) => message.role !== 'system' && message.role !== 'developer').map((message) => `${message.role}:${unstamped(textOf(message))}`);

describe('steering (08 §8.1, ADR 0009, 90 and 102)', { timeout: 30_000 }, () => {
  it("M2.4-E15 a message sent while a step runs is queued, then appended after the step's results", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const held = heldReply({ toolCall: { id: 'c1', name: 'run', arguments: { connector: 'shell', command: 'exec', payload: { line: 'echo a', risky: false } } } });
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

  // Superseded by ADR 0108, 1: a lead never waits on its helpers, so a message sent while one works starts a turn at
  // once, and the helper's answer comes after it as a background message.
  it('M2.4-E17 while a helper works, a message starts a turn at once, and the answer comes after it', async () => {
    const { kernel, fake, helperFake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const child = heldReply({ text: 'child answer' });
    fake.reply(runs(command('delegate', 'run', { worker: 'general', title: 'Helper', kind: 'find', goal: 'Help', done: 'It is done.' })), says('Started.'), says('noted'), says('read it'));
    helperFake.reply(child.reply);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).session.status).toBe('idle'), wait);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'meanwhile' });
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' }), wait);
    expect(roles(requestMessages(fake)).at(-1)).toMatch(/^user:meanwhile\n/);
    child.release();
    await kernel.clock.advance(0);
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(4), wait);
    expect(withoutHelperId(roles(requestMessages(fake)).at(-1) ?? '')).toMatch(/^user:.*finished:\nchild answer$/s);
  });
});
