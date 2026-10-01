import { describe, expect, it, vi } from 'vitest';
import { openGate } from './support/gates.ts';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { calls, requestMessages, says, textOf, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

const startedId = (result: string | undefined): string => /^started (\S+)\n\[exit code 0\]$/.exec(result ?? '')?.[1] ?? '';

describe('--async connector calls (08 §8.3, ADR 0009, 89)', { timeout: 30_000 }, () => {
  it('M2.4-H6 an --async result arrives as a message and starts a turn', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const gate = openGate('h6');
    fake.reply(calls(`todo wait --async '{"gate":"h6","text":"a"}'`), says('waiting'), says('thanks'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await gate.waiting;
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' }), wait);
    const jobId = startedId(toolResults(fake, 1)[0]);
    expect((await kernel.exec('kernel.jobs.get', { id: jobId })).name).toBe('kvcoder.connector.run');
    gate.release();
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(3);
    const last = requestMessages(fake).at(-1);
    expect(textOf(last)).toBe(`The background call \`todo wait --async '{"gate":"h6","text":"a"}'\` (job ${jobId}) finished:\n{\n  "text": "a"\n}\n[exit code 0]`);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.find((message) => message.source?.kind === 'job')?.source).toEqual({ kind: 'job', jobId });
    expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).toHaveLength(2);
  });

  it("M2.4-E38 a result arriving while waiting doesn't dismiss the question, and a cancelled job reports without a turn", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const gate = openGate('e38');
    fake.reply(calls(`todo wait --async '{"gate":"e38","text":"a"}'`, `ask text '{"prompt":"Name?"}'`), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await gate.waiting;
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).session.status).toBe('waiting'), wait);
    gate.release();
    await kernel.clock.advance(0);
    const waiting = await turnState(kernel, sessionId);
    expect(waiting.session.status).toBe('waiting');
    await kernel.exec('kvcoder.question.answer', { questionId: String(waiting.turn?.pending[0]?.questionId), answer: { text: 'Ada' } });
    await kernel.clock.advance(0);
    const sent = requestMessages(fake);
    expect(sent.filter((message) => message.role === 'tool').map(textOf)).toEqual([expect.stringMatching(/^started /) as unknown, '{\n  "text": "Ada"\n}\n[exit code 0]']);
    expect(textOf(sent.at(-1))).toMatch(/^The background call `todo wait --async/);

    const cancelled = openGate('e38b');
    fake.reply(calls(`todo wait --async '{"gate":"e38b","text":"b"}'`), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await cancelled.waiting;
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).session.status).toBe('idle'), wait);
    const jobId = startedId(toolResults(fake).at(-1));
    kernel.cancel(jobId);
    cancelled.release();
    await kernel.clock.advance(0);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(String(messages.at(-1)?.content['content'])).toBe(`The background call \`todo wait --async '{"gate":"e38b","text":"b"}'\` (job ${jobId}) finished:\nerror CANCELLED: The job was cancelled.\n[exit code 1]`);
    expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
    expect(fake.requests()).toHaveLength(4);
  });
});
