import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { heldReply } from './support/held-reply.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { worker, workers } from './support/workers.ts';

// A run the agent stopped sends no later notice, and the runs that ended while kvman was stopped are told in one message
// (plan 08 §8.5, ADR 0085, 5).

const kvcoder = useKvcoder();
const programs = useWorkerPrograms();
const messageSchema = z.object({ source: z.object({ kind: z.string() }).nullish(), content: z.record(z.string(), z.unknown()) });
const lasting: RunCallSpec = { connector: 'shell', command: 'exec', payload: { line: 'node -e "setTimeout(() => {}, 30000)"', risky: false, background: true } };
const helper = command('delegate', 'run', { worker: 'helper', title: 'Helper', task: 'Do it', background: true });
const startedIds = (results: readonly string[]): string[] => results.flatMap((text) => /^started (\S+)/.exec(text)?.[1] ?? []);

async function notices(kernel: TestKernel, sessionId: string): Promise<string[]> {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 200 });
  return messages.map((message) => messageSchema.parse(message)).filter((message) => message.source?.kind === 'job' || message.source?.kind === 'subagent').map((message) => String(message.content['content']));
}

// Sends a message and waits for the lead's turn to end, without waiting for a held helper.
async function sendAndIdle(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, requests: number, text = 'go'): Promise<void> {
  await kernel.exec('kvcoder.message.send', { sessionId, text });
  await vi.waitFor(async () => {
    expect(fake.requests().length).toBeGreaterThanOrEqual(requests);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle');
  }, wait);
}

// A chat running a background process and a background helper held in its first reply.
async function twoRuns() {
  const world = await kvcoder.start({ settings: workers(worker('helper')) });
  const sessionId = await newSession(world.kernel);
  const held = heldReply({ text: 'late' });
  world.fake.reply(runs(lasting, helper), held.reply, says('ok'));
  await sendAndIdle(world.kernel, world.fake, sessionId, 3);
  const [processId = '', helperId = ''] = startedIds(toolResults(world.fake));
  return { ...world, sessionId, held, processId, helperId };
}

describe('quieter notices (ADR 0085, 5)', { timeout: 60_000 }, () => {
  it('QA53-H13 quieter notices', async () => {
    const { kernel, fake, sessionId, held, processId, helperId } = await twoRuns();
    fake.reply(runs(command('background', 'stop', { id: processId }), command('background', 'stop', { id: helperId })), says('ok'));
    await sendAndIdle(kernel, fake, sessionId, fake.requests().length + 2);
    held.release();
    expect(toolResults(fake).slice(-2)).toEqual(['{"stopped":true}', '{"stopped":true}']);
    fake.reply(says('ok'));
    await sendAndIdle(kernel, fake, sessionId, fake.requests().length + 1, 'anything new?');
    expect(await notices(kernel, sessionId)).toEqual([]);

    const pi = programs.install('pi');
    const programWorld = await kvcoder.start({ settings: workers(programWorker('runner', 'pi')) });
    const programChat = await newSession(programWorld.kernel);
    programWorld.fake.reply(runs(command('delegate', 'run', { worker: 'runner', title: 'Runner', task: `wait:${pi.gate}`, background: true })), says('ok'));
    await sendAndIdle(programWorld.kernel, programWorld.fake, programChat, 2);
    const [runId = ''] = startedIds(toolResults(programWorld.fake));
    programWorld.fake.reply(runs(command('background', 'stop', { id: runId })), says('ok'), says('ok'));
    await sendAndIdle(programWorld.kernel, programWorld.fake, programChat, 4);
    await sendAndIdle(programWorld.kernel, programWorld.fake, programChat, 5, 'anything new?');
    expect(await notices(programWorld.kernel, programChat)).toEqual([]);

    const restartWorld = await kvcoder.start();
    const restartChat = await newSession(restartWorld.kernel);
    restartWorld.fake.reply(runs(lasting, lasting), says('ok'));
    await sendAndIdle(restartWorld.kernel, restartWorld.fake, restartChat, 2);
    const [first = '', second = ''] = startedIds(toolResults(restartWorld.fake));
    await restartWorld.kernel.restart();
    restartWorld.fake.reply(says('ok'));
    await sendAndIdle(restartWorld.kernel, restartWorld.fake, restartChat, 3, 'are you there');
    const line = (id: string) => `- \`node -e "setTimeout(() => {}, 30000)"\` (job ${id}): interrupted because kvman stopped.`;
    expect(await notices(restartWorld.kernel, restartChat)).toEqual([['While kvman was stopped, these background calls ended:', line(first), line(second)].join('\n')]);
  });

  it("QA53-E14 the person's stop still tells the chat", async () => {
    const { kernel, sessionId, held, processId, helperId } = await twoRuns();
    await kernel.exec('kvcoder.job.cancel', { sessionId, id: processId });
    await kernel.exec('kvcoder.job.cancel', { sessionId, id: helperId });
    held.release();
    const told = await notices(kernel, sessionId);
    expect(told).toHaveLength(2);
    expect(told.find((text) => text.includes(`(job ${processId}) finished:\nThe process was stopped by the person.`))).toBeDefined();
    expect(told.find((text) => text.includes(`(job ${helperId}) finished:\nsubagent ended cancelled`))).toBeDefined();
  });
});
