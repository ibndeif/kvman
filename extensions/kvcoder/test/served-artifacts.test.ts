import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI, FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

// A url artifact ends with the background process that served it (plan 08 §8.5, ADR 0104). The lines are bash, the
// Linux and macOS branch.

const kvcoder = useKvcoder();

function posixShell(): void {
  if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
}

const serving = 'echo "Local: http://localhost:4173/"; until [ -f go ]; do sleep 0.1; done';
const lasting = 'echo "Local: http://localhost:4173/"; sleep 30';
const deletedLine = 'Its artifact `preview` was deleted, since nothing serves its address now.';
const previewWrite = command('artifact', 'write', { id: 'preview', title: 'Preview', content: 'http://127.0.0.1:4173/app' });
const writes = [
  previewWrite,
  command('artifact', 'write', { id: 'docs', title: 'Docs', content: 'http://localhost:8080' }),
  command('artifact', 'write', { id: 'notes', title: 'Notes', format: 'markdown', content: 'http://localhost:4173/' }),
];
const messageSchema = z.object({ kind: z.string(), source: z.object({ kind: z.string() }).nullish(), content: z.record(z.string(), z.unknown()) });

async function send(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, text: string, ...replies: FakeReply[]): Promise<void> {
  for (const reply of replies) fake.reply(reply);
  await kernel.exec('kvcoder.message.send', { sessionId, text });
  await kernel.clock.advance(0);
  await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
}

async function jobMessages(kernel: TestKernel, sessionId: string): Promise<string[]> {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  return messages.map((message) => messageSchema.parse(message)).filter((message) => message.kind === 'user' && message.source?.kind === 'job').map((message) => String(message.content['content']));
}

const artifactIds = async (kernel: TestKernel, sessionId: string): Promise<string[]> => (await kernel.exec('kvcoder.artifact.list', { sessionId })).map((artifact) => artifact.id).sort();

// A chat with the three artifacts and one background process started by `line`.
async function servingChat(line: string) {
  posixShell();
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  await send(world.kernel, world.fake, sessionId, 'go', runs(...writes, shell(line, { background: true })), says('ok'));
  const started = toolResults(world.fake).find((text) => text.startsWith('started ')) ?? '';
  const jobId = /^started (\S+)/.exec(started)?.[1] ?? '';
  expect(await artifactIds(world.kernel, sessionId)).toEqual(['docs', 'notes', 'preview']);
  return { ...world, sessionId, jobId };
}

describe('url artifacts end with their server (08 §8.5, ADR 0104)', { timeout: 60_000 }, () => {
  it('QA69-H1 an exit by itself deletes the artifact it served, and says so', async () => {
    const { kernel, sessionId, jobId } = await servingChat(serving);
    writeFileSync(path.join(kernel.homeFolder, 'go'), 'go\n');
    await vi.waitFor(async () => expect(await jobMessages(kernel, sessionId)).toHaveLength(1), wait);
    const [text = ''] = await jobMessages(kernel, sessionId);
    expect(text).toContain(`(job ${jobId}) finished:\nThe process exited with code 0.\n${deletedLine}\nIts last output:\nLocal: http://localhost:4173/`);
    expect(await artifactIds(kernel, sessionId)).toEqual(['docs', 'notes']);
  });

  it("QA69-H2 the agent's stop deletes it, and its result names it", async () => {
    const { kernel, fake, sessionId, jobId } = await servingChat(lasting);
    await send(kernel, fake, sessionId, 'stop it', runs(command('background', 'stop', { id: jobId })), says('ok'));
    expect(toolResults(fake).at(-1)).toBe('{"stopped":true,"deletedArtifacts":["preview"]}');
    expect(await artifactIds(kernel, sessionId)).toEqual(['docs', 'notes']);
    expect(await jobMessages(kernel, sessionId)).toEqual([]);
  });

  it("QA69-H3 the person's Stop deletes it, and its message says so", async () => {
    const { kernel, sessionId, jobId } = await servingChat(lasting);
    await kernel.exec('kvcoder.job.cancel', { sessionId, id: jobId });
    const [text = ''] = await jobMessages(kernel, sessionId);
    expect(text).toContain(`(job ${jobId}) finished:\nThe process was stopped by the person.\n${deletedLine}\nIts last output:`);
    expect(await artifactIds(kernel, sessionId)).toEqual(['docs', 'notes']);
  });

  it("QA69-H4 a process kvman's stop ended loses its artifact at the chat's next message", async () => {
    const { kernel, fake, sessionId, jobId } = await servingChat(lasting);
    await kernel.restart();
    expect(await artifactIds(kernel, sessionId)).toEqual(['docs', 'notes', 'preview']);
    await send(kernel, fake, sessionId, 'are you there', says('ok'));
    expect(await jobMessages(kernel, sessionId)).toEqual([`While kvman was stopped, these background calls ended:\n- \`${lasting}\` (job ${jobId}): interrupted because kvman stopped. ${deletedLine}`]);
    expect(await artifactIds(kernel, sessionId)).toEqual(['docs', 'notes']);
  });

  it("QA69-E1 the person's Restart keeps it", async () => {
    const { kernel, sessionId, jobId } = await servingChat(lasting);
    const { id } = await kernel.exec('kvcoder.job.restart', { sessionId, id: jobId });
    expect(id).not.toBe(jobId);
    expect(await artifactIds(kernel, sessionId)).toEqual(['docs', 'notes', 'preview']);
    await kernel.exec('kvcoder.job.cancel', { sessionId, id });
  });

  it('QA69-E2 an exit inside the startup second deletes nothing', async () => {
    const { kernel, fake, sessionId } = await servingChat('sleep 30');
    await send(kernel, fake, sessionId, 'again', runs(shell('echo "Local: http://localhost:4173/"', { background: true })), says('ok'));
    const jobId = /^started (\S+)/.exec(toolResults(fake).at(-1) ?? '')?.[1] ?? '';
    await vi.waitFor(async () => expect(await kernel.exec('kvcoder.job.get', { sessionId, id: jobId })).toMatchObject({ status: 'succeeded' }), wait);
    await kernel.clock.advance(0);
    expect(await artifactIds(kernel, sessionId)).toEqual(['docs', 'notes', 'preview']);
  });

  it('QA69-E3 a process that printed no address deletes nothing', async () => {
    const { kernel, fake, sessionId, jobId } = await servingChat('sleep 30');
    await send(kernel, fake, sessionId, 'stop it', runs(command('background', 'stop', { id: jobId })), says('ok'));
    expect(toolResults(fake).at(-1)).toBe('{"stopped":true}');
    expect(await artifactIds(kernel, sessionId)).toEqual(['docs', 'notes', 'preview']);
  });

  it("QA69-E4 a helper's process deletes the artifact of the chat at its root", async () => {
    posixShell();
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await send(kernel, fake, sessionId, 'go', runs(previewWrite), says('ok'));
    fake.reply(runs(command('delegate', 'run', { worker: 'general', title: 'Helper', task: 'Serve it' })), runs(shell(serving, { background: true })), says('child done'), says('parent done'));
    await send(kernel, fake, sessionId, 'serve');
    writeFileSync(path.join(kernel.homeFolder, 'go'), 'go\n');
    await vi.waitFor(async () => expect(await artifactIds(kernel, sessionId)).toEqual([]), wait);
  });
});
