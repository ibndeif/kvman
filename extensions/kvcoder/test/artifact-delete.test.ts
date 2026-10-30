import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { heldReply } from './support/held-reply.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, systemPrompt, toolResults } from './support/model-script.ts';
import { delegated } from './support/helpers.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { worker, workers } from './support/workers.ts';

// Deleting an artifact (plan 08 §8.5, ADR 0105, 1 to 4): the agent's `artifact delete`, the person's, and another
// extension's, through the one public command.

const kvcoder = useKvcoder();
const writeOld = command('artifact', 'write', { id: 'old-report', title: 'Old report', content: '# Old' });
const messageSchema = z.object({ kind: z.string(), queued: z.boolean().optional(), source: z.object({ kind: z.string(), name: z.string().optional() }).nullish(), content: z.record(z.string(), z.unknown()) });

async function kvcoderMessages(kernel: TestKernel, sessionId: string): Promise<{ source: unknown; text: string; queued?: boolean }[]> {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  return messages.map((message) => messageSchema.parse(message)).filter((message) => message.kind === 'user' && message.source?.kind === 'extension').map((message) => ({ source: message.source, text: String(message.content['content']), ...(message.queued === true ? { queued: true } : {}) }));
}

const ids = async (kernel: TestKernel, sessionId: string): Promise<string[]> => (await kernel.exec('kvcoder.artifact.list', { sessionId })).map((artifact) => artifact.id);

// A chat whose agent wrote `old-report`, idle again.
async function chatWithReport() {
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  world.fake.reply(runs(writeOld), says('ok'));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  expect(await ids(world.kernel, sessionId)).toEqual(['old-report']);
  return { ...world, sessionId };
}

const turns = async (kernel: TestKernel, sessionId: string): Promise<number> => (await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).length;

describe('deleting an artifact (08 §8.5, ADR 0105)', { timeout: 30_000 }, () => {
  it('QA70-H1 the agent deletes one, and no message follows', async () => {
    const { kernel, fake, sessionId } = await chatWithReport();
    fake.reply(runs(command('artifact', 'delete', { id: 'old-report' })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'clean up' });
    await kernel.clock.advance(0);
    expect(toolResults(fake).at(-1)).toBe('{"id":"old-report","deleted":true}');
    expect(await ids(kernel, sessionId)).toEqual([]);
    expect(await kvcoderMessages(kernel, sessionId)).toEqual([]);
  });

  it('QA70-H2 the entry says when, and the lead has delete', async () => {
    const { fake } = await chatWithReport();
    const prompt = systemPrompt(fake, 0);
    expect(prompt).toContain('Delete an artifact that is superseded or no longer true with delete; never empty one to clear it.');
    expect(prompt).toContain('  delete { id (≤50) }\n');
  });

  it("QA70-H3 the person's delete tells the agent, and starts no turn", async () => {
    const { kernel, sessionId } = await chatWithReport();
    expect(await kernel.exec('kvcoder.artifact.delete', { sessionId, payload: { id: 'old-report' } })).toEqual({ id: 'old-report', deleted: true });
    expect(await ids(kernel, sessionId)).toEqual([]);
    expect(await kvcoderMessages(kernel, sessionId)).toEqual([{ source: { kind: 'extension', name: '@kvman/kvcoder' }, text: 'The person deleted the artifact `old-report`.' }]);
    await kernel.clock.advance(0);
    expect(await turns(kernel, sessionId)).toBe(1);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle');
  });

  it('QA70-E1 an unknown id fails NOT_FOUND, and a bad payload VALIDATION_FAILED', async () => {
    const { kernel, sessionId } = await chatWithReport();
    await expect(kernel.exec('kvcoder.artifact.delete', { sessionId, payload: { id: 'missing' } })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND', params: { id: 'missing' } } });
    for (const payload of [{ id: 'Bad Id' }, { id: 'old-report', extra: true }]) {
      await expect(kernel.exec('kvcoder.artifact.delete', { sessionId, payload })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    }
    expect(await ids(kernel, sessionId)).toEqual(['old-report']);
  });

  it('QA70-E2 a helper is refused, and its prompt has no delete', async () => {
    const world = await kvcoder.start({ settings: workers(worker('free')) });
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, [runs(writeOld), runs(command('delegate', 'run', { worker: 'free', title: 'Helper', kind: 'check', goal: 'Clean', done: 'It is done.' })), says('Started.'), says('done')], [runs(command('artifact', 'delete', { id: 'old-report' })), says('found')]);
    expect(toolResults(world.helperFake, 1)[0]).toMatch(/^error VALIDATION_FAILED: A helper writes no artifact/);
    expect(systemPrompt(world.helperFake, 0)).not.toMatch(/\n {2}delete +\{ id/);
    expect(await ids(world.kernel, sessionId)).toEqual(['old-report']);
  });

  it("QA70-E3 the person's delete while a turn runs is queued, and starts no turn", async () => {
    const { kernel, fake, sessionId } = await chatWithReport();
    const held = heldReply({ text: 'still thinking' });
    // The running turn's next step reads the queued message, so it takes one more reply.
    fake.reply(held.reply, says('noted'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'think' });
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('running'), wait);
    await kernel.exec('kvcoder.artifact.delete', { sessionId, payload: { id: 'old-report' } });
    expect((await kvcoderMessages(kernel, sessionId)).map((message) => message.queued)).toEqual([true]);
    held.release();
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
    await kernel.clock.advance(0);
    expect(await kvcoderMessages(kernel, sessionId)).toEqual([{ source: { kind: 'extension', name: '@kvman/kvcoder' }, text: 'The person deleted the artifact `old-report`.' }]);
    expect(await turns(kernel, sessionId)).toBe(2);
  });

  it("QA70-E4 an extension's delete adds no message", async () => {
    const { kernel, sessionId } = await chatWithReport();
    await kernel.exec('kvcoder.artifact.delete', { sessionId, payload: { id: 'old-report' } }, { as: '@test/todo' });
    expect(await ids(kernel, sessionId)).toEqual([]);
    expect(await kvcoderMessages(kernel, sessionId)).toEqual([]);
  });
});
