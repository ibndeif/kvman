import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { openGate } from './support/gates.ts';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell, toolResults } from './support/model-script.ts';
import { kvcoderChunks, newSession, sendStreamed, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

const pendingSchema = z.array(z.object({ questionId: z.string() }));

describe('a turn (08 §8.1–8.3)', { timeout: 30_000 }, () => {
  it('M2.4-H1 a shell call and a connector command run in parallel, a question suspends the turn, and the answer continues it', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const marker = path.join(kernel.homeFolder, 'shell-ran');
    const gate = openGate('h1');
    fake.reply(runs(command('todo', 'wait', {"gate":"h1","text":"a"}), shell(`touch shell-ran && echo hi`), command('ask', 'text', {"prompt":"Name?"})), says('done'));

    const sent = sendStreamed(kernel, sessionId, 'go');
    await gate.waiting;
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), wait);
    gate.release();
    const stream = await sent;
    await kernel.clock.advance(0);

    const waiting = await turnState(kernel, sessionId);
    expect(waiting.session).toMatchObject({ status: 'waiting' });
    expect(waiting.session.stepJobId).toBeUndefined();
    expect(waiting.turn?.pending).toEqual([{ toolCallId: expect.any(String) as unknown, kind: 'question', questionId: expect.any(String) as unknown, question: { kind: 'text', prompt: 'Name?' }, childSessionId: null }]);
    const [{ questionId }] = pendingSchema.parse(waiting.turn?.pending) as [{ questionId: string }];
    expect(kvcoderChunks(stream)).toContainEqual({ type: 'follow', jobId: expect.any(String) as unknown });
    expect(kvcoderChunks(stream)).toContainEqual({ type: 'component', component: 'kvcoder.question', props: expect.objectContaining({ questionId, sessionId }) as unknown });

    const { jobId } = await kernel.exec('kvcoder.question.answer', { questionId, answer: { text: 'Ada' } });
    expect(jobId).toEqual(expect.any(String));
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual(['{"text":"a"}', 'hi\n[exit code 0]', '{"text":"Ada"}']);
    const done = await turnState(kernel, sessionId);
    expect(done.session).toMatchObject({ status: 'idle' });
    expect(done.turn).toMatchObject({ outcome: 'done', steps: 2, pending: [] });
    expect(done.turn?.durationMs).toBeGreaterThanOrEqual(0);
    expect(await kernel.exec('todo.item.list', {})).toEqual([{ text: 'a' }]);
  });
});
