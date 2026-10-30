import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, requestMessages, runs, says, shell, textOf, toolResults, type RunCallSpec, withoutHelperId } from './support/model-script.ts';
import { delegated } from './support/helpers.ts';
import { newSession, turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { workers } from './support/workers.ts';

const kvcoder = useKvcoder();
const programs = useWorkerPrograms();
const asTodo = { as: '@test/todo' };
const never = { 'kvcoder.approval': 'never' };

// A connector whose `add` asks the person first in the other two modes.
const guarded = { name: 'guarded', description: 'A guarded todo list.', commands: [{ name: 'add', command: 'todo.item.add', asks: true as const }] };

async function started(settings: Record<string, unknown>, ...replies: Parameters<Awaited<ReturnType<typeof kvcoder.start>>['fake']['reply']>) {
  const world = await kvcoder.start({ settings: settings as Record<string, string> });
  await world.kernel.exec('kvcoder.connector.register', guarded, asTodo);
  const sessionId = await newSession(world.kernel);
  world.fake.reply(...replies);
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  return { ...world, sessionId };
}

const calls = (...specs: readonly RunCallSpec[]) => [runs(...specs), says('ok')] as const;
const home = (kernel: TestKernel, file: string): boolean => existsSync(path.join(kernel.homeFolder, file));
const done = (kernel: TestKernel, sessionId: string) => vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', pending: [] }), wait);

describe('with never no call asks the person (08 §8.3, ADR 0077)', { timeout: 30_000 }, () => {
  it('M2.4-E289 a risky shell line and a risky file write run at once, and nothing waits', async () => {
    const { kernel, fake, sessionId } = await started(never, ...calls(shell('touch risky.txt', { risky: true }), fsCall('write', { path: 'a.txt', content: 'x', risky: true })));
    await done(kernel, sessionId);
    expect([home(kernel, 'risky.txt'), home(kernel, 'a.txt')]).toEqual([true, true]);
    expect(toolResults(fake)).toEqual(['[exit code 0]', expect.stringContaining('"created":true') as unknown]);
  });

  it('M2.4-E290 risky is still required: a call that leaves it out is refused and runs nothing', async () => {
    const { kernel, fake, sessionId } = await started(never, ...calls(command('shell', 'exec', { line: 'touch unmarked.txt' })));
    await done(kernel, sessionId);
    expect(toolResults(fake)[0]).toMatch(/^error VALIDATION_FAILED: risky: /);
    expect(home(kernel, 'unmarked.txt')).toBe(false);
  });

  it('M2.4-E291 a registered command with asks: true runs at once', async () => {
    const { kernel, fake, sessionId } = await started(never, ...calls(command('guarded', 'add', { text: 'milk' })));
    await done(kernel, sessionId);
    expect(await kernel.exec('todo.item.list', {}, asTodo)).toEqual([{ text: 'milk' }]);
    expect(toolResults(fake)[0]).toContain('"text":"milk"');
  });

  it('M2.4-E292 a program worker set to ask before a run starts at once, in the background', async () => {
    const installed = programs.install('claude');
    const { kernel, fake, sessionId } = await started({ ...never, ...workers(programWorker('cc', 'claude', { approval: 'ask' })) }, runs(command('delegate', 'run', { worker: 'cc', title: 'Helper', kind: 'find', goal: `wait:${installed.gate}`, done: 'It is done.' })), says('Started.'), says('read it'));
    await vi.waitFor(() => expect(installed.calls('claude')).toHaveLength(1), wait);
    await done(kernel, sessionId);
    expect(toolResults(fake, 1)).toEqual([expect.stringMatching(/^started \S+$/) as unknown]);
    installed.release();
    await vi.waitFor(async () => {
      const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
      expect(messages.some((message) => message.source?.kind === 'job' && JSON.stringify(message.content).includes('released'))).toBe(true);
    }, wait);
  });

  it("M2.4-E293 a helper's risky call runs at once too", async () => {
    const world = await kvcoder.start({ settings: never });
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, [runs(command('delegate', 'run', { worker: 'general', title: 'Helper', kind: 'check', goal: 'Check', done: 'It is done.' })), says('Started.'), says('parent done')], [runs(shell('touch child.txt', { risky: true })), says('child done')]);
    expect(home(world.kernel, 'child.txt')).toBe(true);
    expect(toolResults(world.helperFake, 1)).toEqual(['[exit code 0]']);
    expect(withoutHelperId(textOf(requestMessages(world.fake).at(-1)))).toMatch(/finished:\nchild done$/);
  });

  it("M2.4-E294 the agent's own question still waits for the person", async () => {
    const { kernel, sessionId } = await started(never, ...calls(command('ask', 'confirm', { prompt: 'Go on?' })));
    await kernel.clock.advance(0);
    const { session, turn } = await turnState(kernel, sessionId);
    expect(session.status).toBe('waiting');
    expect(turn?.pending.map((item) => item.kind)).toEqual(['question']);
  });

  it('M2.4-E295 the setting takes auto, ask, and never, and nothing else', async () => {
    const { kernel } = await kvcoder.start();
    for (const value of ['auto', 'ask', 'never']) await kernel.exec('kernel.settings.set', { key: 'kvcoder.approval', value, scope: 'global' });
    await expect(kernel.exec('kernel.settings.set', { key: 'kvcoder.approval', value: 'off', scope: 'global' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(kernel.exec('kernel.settings.set', { key: 'kvcoder.shell.approval', value: 'ask', scope: 'global' })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
  });
});
