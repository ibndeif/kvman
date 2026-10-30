import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { delegated, helperIds } from './support/helpers.ts';
import { command, fsCall, runs, says, shell, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { brief, worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();
const lead = (run: Record<string, unknown>) => [runs(command('delegate', 'run', run as never)), says('Started.'), says('parent done')];

describe("the rules of a worker's subagent (08 §8.5, ADR 0009, 102; ADR 0021)", { timeout: 30_000 }, () => {
  it("M2.4-E43, QA4-E18, QA5-E7, and QA6-E21 a child's connectors are its worker's among its parent's: never delegate or ask, and the shell only when it is given", async () => {
    const world = await kvcoder.start({ settings: workers(worker('general'), worker('limited', { connectors: ['todo'] })) });
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, lead(brief('limited', { kind: 'check', goal: 'Limited' })), [runs(command('delegate', 'run', brief('general', { goal: 'deeper' })), shell('echo hi'), command('todo', 'add', { text: 'c' }), command('ask', 'help')), says('child done')]);
    const child = toolResults(world.helperFake, 1);
    expect(child[0]).toBe("error VALIDATION_FAILED: delegate isn't available in this subagent.");
    expect(child[1]).toBe("error VALIDATION_FAILED: shell isn't available in this subagent.");
    expect(child[2]).toMatch(/^\{"id":".+","text":"c"\}$/);
    expect(child[3]).toBe("error VALIDATION_FAILED: ask isn't available in this subagent.");
    const prompt = systemPrompt(world.helperFake, 0);
    expect(prompt).toContain('- todo: Keep a todo list.');
    expect(prompt).not.toContain('- ask: ');
    expect(prompt).not.toContain('- delegate: ');
    expect(prompt).not.toContain('- fs: ');
    expect(prompt).not.toContain('- shell: ');
    expect(prompt).toContain('Connectors are the only way you act.');
    expect(prompt).toContain("Do the task you were given and return the result to the lead agent; don't re-plan it or widen it.");
    expect(prompt).toContain('## Connectors\n- todo: ');
  });

  it("QA4-E13 a child that wasn't given files can't use it, and one that was can", async () => {
    const world = await kvcoder.start({ settings: workers(worker('limited', { connectors: ['background'] }), worker('full', { connectors: ['fs'] })) });
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, lead(brief('limited', { kind: 'change', files: ['a.txt'], goal: 'Limited' })), [runs(fsCall('write', { path: 'a.txt', content: 'x' })), says('limited done')]);
    expect(toolResults(world.helperFake, 1)).toEqual(["error VALIDATION_FAILED: fs isn't available in this subagent."]);
    expect(existsSync(path.join(world.kernel.homeFolder, 'a.txt'))).toBe(false);
    await delegated(world, sessionId, lead(brief('full', { kind: 'change', files: ['b.txt'], goal: 'Full' })), [runs(fsCall('write', { path: 'b.txt', content: 'x' })), says('full done')], 'again');
    expect(toolResults(world.helperFake, 3)[0]).toMatch(/^\{"path":"b.txt","created":true/);
    expect(existsSync(path.join(world.kernel.homeFolder, 'b.txt'))).toBe(true);
  });

  it('M2.4-E45 a child that ends maxSteps returns "subagent ended maxSteps" as an error', async () => {
    const world = await kvcoder.start({ settings: { 'kvcoder.maxSteps': 2 } });
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, lead(brief('general', { kind: 'check', goal: 'Loop' })), [runs(shell('echo 1')), { chunks: [{ text: 'still going' }, { toolCall: { id: 'x', name: 'run', arguments: { connector: 'shell', command: 'exec', payload: { line: 'echo 2', risky: false } } } }] }]);
    expect(JSON.stringify(world.fake.requests().at(-1)?.body)).toContain('subagent ended maxSteps\\n\\nIts last message before it stopped (unfinished, not a result):\\nstill going');
  });

  it('M2.4-E2 every command that names a subagent session fails VALIDATION_FAILED, and reads work', async () => {
    const world = await kvcoder.start();
    const { kernel } = world;
    const sessionId = await newSession(kernel);
    world.fake.reply(...lead(brief('general', { kind: 'check', goal: 'Wait' })));
    world.helperFake.reply(runs(shell('true', { risky: true })));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [childId = ''] = await helperIds(kernel, sessionId);
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
    const world = await kvcoder.start({ settings: workers(worker('limited', { connectors: ['background'] })) });
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, lead(brief('limited', { kind: 'check', goal: 'Limited' })), [runs(command('artifact', 'write', { id: 'plan', title: 'Plan', content: 'x' })), says('limited done')]);
    expect(toolResults(world.helperFake, 1)).toEqual(["error VALIDATION_FAILED: artifact isn't available in this subagent."]);
    expect(systemPrompt(world.helperFake, 0)).not.toContain('- artifact: ');
    expect(await world.kernel.exec('kvcoder.artifact.list', { sessionId })).toEqual([]);
  });

  it('M2.4-E155 a title over 60 characters is shortened, and one over 200 fails', async () => {
    const world = await kvcoder.start();
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, lead(brief('general', { title: 'x'.repeat(61), goal: 'Go' })), [says('gone')]);
    const [childId = ''] = await helperIds(world.kernel, sessionId);
    expect((await world.kernel.exec('kvcoder.session.get', { sessionId: childId })).title).toBe(`${'x'.repeat(59)}…`);
    world.fake.reply(runs(command('delegate', 'run', brief('general', { title: 'y'.repeat(201), goal: 'Go' }))), says('parent done'));
    await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await vi.waitFor(() => expect(toolResults(world.fake).at(-1)).toMatch(/^error VALIDATION_FAILED: title/), wait);
  });
});
