import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, runs, says, shell, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();

describe("the rules of a worker's subagent (08 §8.5, ADR 0009, 102; ADR 0021)", { timeout: 30_000 }, () => {
  it("M2.4-E43, QA4-E18, QA5-E7, and QA6-E21 a child's connectors are its worker's among its parent's: never delegate, always ask, and the shell only when it is given", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('general'), worker('limited', { connectors: ['todo'] })) });
    const sessionId = await newSession(kernel);
    fake.reply(
      runs(command('delegate', 'run', { worker: 'limited', task: 'Limited' })),
      runs(command('delegate', 'run', { worker: 'general', task: 'deeper' }), shell('echo hi'), command('todo', 'add', {"text":"c"}), command('ask', 'help')),
      says('child done'),
      says('parent done'),
    );
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const child = toolResults(fake, 2);
    expect(child[0]).toBe("error VALIDATION_FAILED: delegate isn't available in this subagent.");
    expect(child[1]).toBe("error VALIDATION_FAILED: shell isn't available in this subagent.");
    expect(child[2]).toMatch(/^\{\n {2}"id": ".+",\n {2}"text": "c"\n\}$/);
    expect(child[3]).toMatch(/^ask: Put a question to the person/);
    const prompt = systemPrompt(fake, 1);
    expect(prompt).toContain('- todo: Keep a todo list.');
    expect(prompt).toContain('- ask: Put a question to the person and wait for the answer.');
    expect(prompt).not.toContain('- delegate: ');
    expect(prompt).not.toContain('- fs: ');
    expect(prompt).not.toContain('- shell: ');
    expect(prompt).toContain('Connectors are the only way you act.');
    expect(prompt).toContain('If another agent gave you your task, do that task and return the result');
    expect(prompt).toContain('## Connectors\n- ask: ');
  });

  it("QA4-E13 a child that wasn't given files can't use it, and one that was can", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('limited', { connectors: ['background'] }), worker('full', { connectors: ['fs'] })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'limited', task: 'Limited' })), runs(fsCall('write', { path: 'a.txt', content: 'x' })), says('limited done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake, 2)).toEqual(["error VALIDATION_FAILED: fs isn't available in this subagent."]);
    expect(existsSync(path.join(kernel.homeFolder, 'a.txt'))).toBe(false);
    fake.reply(runs(command('delegate', 'run', { worker: 'full', task: 'Full' })), runs(fsCall('write', { path: 'b.txt', content: 'x' })), says('full done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await kernel.clock.advance(0);
    expect(toolResults(fake, 6)[0]).toMatch(/^\{\n {2}"path": "b.txt",\n {2}"created": true/);
    expect(existsSync(path.join(kernel.homeFolder, 'b.txt'))).toBe(true);
  });

  it('M2.4-E45 a child that ends maxSteps returns "subagent ended maxSteps" as an error', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.maxSteps': 2 } });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'general', task: 'Loop' })), runs(shell('echo 1')), { chunks: [{ text: 'still going' }, { toolCall: { id: 'x', name: 'run', arguments: { description: 'Again.', connector: 'shell', command: 'exec', payload: { line: 'echo 2', risky: false } } } }] }, says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake, 3)).toEqual(['subagent ended maxSteps\nstill going']);
  });

  it('M2.4-E2 every command that names a subagent session fails VALIDATION_FAILED, and reads work', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'general', task: 'Wait' })), runs(command('ask', 'text', {"prompt":"?"})));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const childId = String((await turnState(kernel, sessionId)).turn?.pending[0]?.childSessionId);
    const refused = [
      kernel.exec('kvcoder.session.rename', { sessionId: childId, title: 'x' }),
      kernel.exec('kvcoder.session.configure', { sessionId: childId, thinking: 'off' }),
      kernel.exec('kvcoder.session.delete', { sessionId: childId }),
      kernel.exec('kvcoder.session.fork', { sessionId: childId }),
      kernel.exec('kvcoder.session.compact', { sessionId: childId }),
      kernel.exec('kvcoder.session.export', { sessionId: childId }),
      kernel.exec('kvcoder.turn.cancel', { sessionId: childId }),
      kernel.exec('kvcoder.message.send', { sessionId: childId, text: 'x' }),
      kernel.exec('kvcoder.message.inject', { sessionId: childId, text: 'x' }, { as: '@test/todo' }),
      kernel.exec('kvcoder.note.add', { sessionId: childId, key: 'todo.note' }, { as: '@test/todo' }),
    ];
    for (const call of refused) await expect(call).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(kernel.exec('kvcoder.session.get', { sessionId: childId })).resolves.toMatchObject({ status: 'waiting' });
    await expect(kernel.exec('kvcoder.message.list', { sessionId: childId, limit: 10 })).resolves.toMatchObject({ omitted: 0 });
    await expect(kernel.exec('kvcoder.turn.list', { sessionId: childId, limit: 10 })).resolves.toHaveLength(1);
    await expect(kernel.exec('kvcoder.prompt.get', { sessionId: childId })).resolves.toMatchObject({ prompt: expect.stringContaining('kvman Coder') as unknown });
  });

  it("QA6-E10 a child that wasn't given artifact can't use it, and its prompt has no artifact line", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('limited', { connectors: ['background'] })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'limited', task: 'Limited' })), runs(command('artifact', 'write', { id: 'plan', title: 'Plan', content: 'x' })), says('limited done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake, 2)).toEqual(["error VALIDATION_FAILED: artifact isn't available in this subagent."]);
    expect(systemPrompt(fake, 1)).not.toContain('- artifact: ');
    expect(await kernel.exec('kvcoder.artifact.list', { sessionId })).toEqual([]);
  });
});
