import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, textOf, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

// The person's message ends a `background wait` at once (plan 08 §8.5, ADR 0085, 3).

const kvcoder = useKvcoder();
const parsed = (text: string | undefined) => z.record(z.string(), z.unknown()).parse(JSON.parse(text ?? 'null'));
const lasting = (milliseconds: number) => ({ connector: 'shell', command: 'exec', payload: { line: `node -e "setTimeout(() => {}, ${String(milliseconds)})"`, risky: false, background: true } });
const idOf = (started: string | undefined): string => /^started (\S+)/.exec(started ?? '')?.[1] ?? '';

describe("the person's message ends a wait (ADR 0085, 3)", { timeout: 60_000 }, () => {
  it('QA53-H11 the person\'s message ends a wait', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(lasting(30_000)), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'start it' });
    await kernel.clock.advance(0);
    const id = idOf(toolResults(fake)[0]);
    fake.reply(runs(command('background', 'wait', { id, timeoutMs: 600_000 })), says('ok'));
    const began = Date.now();
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'wait for it' });
    await vi.waitFor(() => expect(fake.requests().length).toBe(3), wait);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Please answer me now.' });
    await kernel.clock.advance(0);
    await vi.waitFor(() => expect(fake.requests().length).toBe(4), wait);
    expect(Date.now() - began).toBeLessThan(20_000);
    expect(parsed(toolResults(fake, 3).at(-1))).toMatchObject({ id, status: 'running', note: 'The person sent a message.' });
    expect(requestMessages(fake, 3).some((message) => message.role === 'user' && textOf(message).includes('Please answer me now.'))).toBe(true);
    fake.reply(runs(command('background', 'stop', { id })), says('ok'));
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'stop it' });
    await kernel.clock.advance(0);
  });

  it("QA53-E10 only the person's message ends a wait", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(lasting(2500), lasting(6000)), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'start them' });
    await kernel.clock.advance(0);
    const [sooner, later] = toolResults(fake).map(idOf);
    fake.reply(runs(command('background', 'wait', { id: later, timeoutMs: 600_000 })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'wait for the second' });
    await kernel.clock.advance(0);
    await vi.waitFor(() => expect(fake.requests().length).toBe(4), { timeout: 30_000, interval: 100 });
    const waited = parsed(toolResults(fake, 3).at(-1));
    expect(waited).toMatchObject({ id: later, status: 'succeeded' });
    expect(waited).not.toHaveProperty('note');
    const noticeOf = (index: number) => requestMessages(fake, index).some((message) => message.role === 'user' && textOf(message).includes(`(job ${sooner ?? ''}) finished`));
    expect(noticeOf(2)).toBe(false);
    expect(noticeOf(3)).toBe(true);
  });
});

describe('an ending the agent already read is not told again (ADR 0108, 7)', { timeout: 60_000 }, () => {
  const finishedIn = (fake: Awaited<ReturnType<typeof kvcoder.start>>['fake'], index: number, id: string) => requestMessages(fake, index).some((message) => message.role === 'user' && textOf(message).includes(`(job ${id}) finished`));

  it('QA71-H19 a process waited for until it ended gets no finished message', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(lasting(1500)), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'start it' });
    await kernel.clock.advance(0);
    const id = idOf(toolResults(fake)[0]);
    fake.reply(runs(command('background', 'wait', { id, timeoutMs: 30_000 })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'wait for it' });
    await vi.waitFor(() => expect(fake.requests().length).toBe(4), { timeout: 30_000, interval: 100 });
    expect(parsed(toolResults(fake, 3).at(-1))).toMatchObject({ id, status: 'succeeded' });
    expect(finishedIn(fake, 3, id)).toBe(false);
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
    const listed = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(listed.messages.some((message) => message.kind === 'user' && JSON.stringify(message.content).includes(`(job ${id}) finished`))).toBe(false);
  });

  it('QA71-E20 output read while the process still ran leaves its finished message', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(lasting(2500)), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'start it' });
    await kernel.clock.advance(0);
    const id = idOf(toolResults(fake)[0]);
    fake.reply(runs(command('background', 'output', { id })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'look at it' });
    await vi.waitFor(() => expect(fake.requests().length).toBe(4), wait);
    expect(parsed(toolResults(fake, 3).at(-1))).toMatchObject({ id, status: 'running' });
    await vi.waitFor(async () => {
      const listed = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
      expect(listed.messages.some((message) => message.kind === 'user' && JSON.stringify(message.content).includes(`(job ${id}) finished`))).toBe(true);
    }, { timeout: 30_000, interval: 100 });
  });
});
