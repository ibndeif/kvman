import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { calls, says, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

describe('subagent rules (08 §8.5, ADR 0009, 102)', { timeout: 30_000 }, () => {
  it("M2.4-E43 and QA4-E18 a child's connectors are a subset of its parent's: never subagent, always ask, and shell: false refuses the shell", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(
      calls(
        `subagent run '{"task":"x","mode":"fresh","connectors":["nope"]}'`,
        `subagent run '{"task":"x","mode":"fresh","connectors":["subagent"]}'`,
        `subagent run '{"task":"Limited","mode":"fresh","connectors":["todo"],"shell":false}'`,
      ),
      calls(`subagent run '{"task":"deeper","mode":"fresh"}'`, 'echo hi', `todo add '{"text":"c"}'`, 'ask -h'),
      says('child done'),
      says('parent done'),
    );
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [nope, deep] = toolResults(fake, 3);
    expect(nope).toBe("error VALIDATION_FAILED: A subagent can't have the connector nope.\n[exit code 1]");
    expect(deep).toBe("error VALIDATION_FAILED: A subagent can't have the connector subagent.\n[exit code 1]");
    const child = toolResults(fake, 2);
    expect(child[0]).toBe("error VALIDATION_FAILED: subagent isn't available in this subagent.\n[exit code 1]");
    expect(child[1]).toBe('error VALIDATION_FAILED: shell calls are off for this subagent\n[exit code 1]');
    expect(child[2]).toMatch(/^\{\n {2}"id": ".+",\n {2}"text": "c"\n\}\n\[exit code 0\]$/);
    expect(child[3]).toMatch(/^ask: Ask the person/);
    const prompt = systemPrompt(fake, 1);
    expect(prompt).toContain('- todo: Keep a todo list.');
    expect(prompt).toContain('- ask: Ask the person a question and wait for the answer (commands: text, choice, confirm).');
    expect(prompt).not.toContain('- subagent: ');
    expect(prompt).not.toContain('- fs: ');
  });

  it("QA4-E13 a child that wasn't given files can't use it, and one that was can", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(calls(`subagent run '{"task":"Limited","mode":"fresh","connectors":["jobs"]}'`), calls(`fs write '{"path":"a.txt","content":"x"}'`), says('limited done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake, 2)).toEqual(["error VALIDATION_FAILED: fs isn't available in this subagent.\n[exit code 1]"]);
    expect(existsSync(path.join(kernel.homeFolder, 'a.txt'))).toBe(false);
    fake.reply(calls(`subagent run '{"task":"Full","mode":"fresh","connectors":["fs"]}'`), calls(`fs write '{"path":"b.txt","content":"x"}'`), says('full done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await kernel.clock.advance(0);
    expect(toolResults(fake, 6)[0]).toMatch(/^\{\n {2}"path": "b.txt",\n {2}"created": true/);
    expect(existsSync(path.join(kernel.homeFolder, 'b.txt'))).toBe(true);
  });

  it('M2.4-E45 a child that ends maxSteps returns "subagent ended maxSteps" with exit 1', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.maxSteps': 2 } });
    const sessionId = await newSession(kernel);
    fake.reply(calls(`subagent run '{"task":"Loop","mode":"fresh"}'`), calls('echo 1'), { chunks: [{ text: 'still going' }, { toolCall: { id: 'x', name: 'bash', arguments: { title: 'Again', command: 'echo 2', description: 'Again.', risky: false } } }] }, says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake, 3)).toEqual(['subagent ended maxSteps\nstill going\n[exit code 1]']);
  });

  it('M2.4-E2 every command that names a subagent session fails VALIDATION_FAILED, and reads work', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(calls(`subagent run '{"task":"Wait","mode":"fresh"}'`), calls(`ask text '{"prompt":"?"}'`));
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
});
