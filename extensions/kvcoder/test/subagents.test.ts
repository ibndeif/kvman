import { describe, expect, it, vi } from 'vitest';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { calls, requestMessages, says, systemPrompt, textOf, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

const usage = { input: 10, output: 5 };

describe('subagents (08 §8.5)', { timeout: 30_000 }, () => {
  it('M2.4-H4 two subagents run in parallel and return their answers in call order', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    let release = (): void => undefined;
    const both = new Promise<void>((resolve) => (release = resolve));
    fake.reply(
      { ...calls(`subagent run '{"task":"Task A","mode":"fresh"}'`, `subagent run '{"task":"Task B","mode":"fork"}'`), usage },
      { chunks: [{ wait: both }, { text: 'first answer' }], usage },
      { chunks: [{ wait: both }, { text: 'second answer' }], usage },
      says('done'),
    );
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'split it' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(3), wait);
    const waiting = await turnState(kernel, sessionId);
    expect(waiting.turn?.pending.map((item) => item.kind)).toEqual(['subagent', 'subagent']);
    release();
    await kernel.clock.advance(0);

    const served = [1, 2].map((index) => textOf(requestMessages(fake, index).at(-1)));
    const answerOf = (task: string): string => (served.indexOf(task) === 0 ? 'first answer' : 'second answer');
    expect(toolResults(fake, 3)).toEqual([`${answerOf('Task A')}\n[exit code 0]`, `${answerOf('Task B')}\n[exit code 0]`]);
    const fresh = served.indexOf('Task A') + 1;
    expect(requestMessages(fake, fresh).filter((message) => message.role === 'user').map(textOf)).toEqual(['Task A']);
    expect(systemPrompt(fake, fresh)).toContain('You are kvman Coder');
    expect(requestMessages(fake, 3 - fresh).filter((message) => message.role === 'user').map(textOf)).toEqual(['split it', 'Task B']);

    const children = (waiting.turn?.pending ?? []).map((item) => String(item.childSessionId));
    expect((await kernel.exec('kvcoder.session.list', { limit: 100 })).map((session) => session.id)).not.toContain(children[0]);
    for (const childId of children) expect(await kernel.exec('kvcoder.session.get', { sessionId: childId })).toMatchObject({ parentId: sessionId, model: 'fake/m1', thinking: 'medium' });
    const parent = await kernel.exec('kvcoder.session.get', { sessionId });
    expect(parent.usage).toMatchObject({ input: 30, output: 15 });
  });

  it('M2.4-E44 an async subagent prints its id, and its answer arrives later as a message', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(calls(`subagent run --async '{"task":"Background task","mode":"fresh"}'`), says('one'), says('two'), says('three'), says('four'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [started] = toolResults(fake, 1).length > 0 ? toolResults(fake, 1) : toolResults(fake, 2);
    const childId = /^started (\S+)\n\[exit code 0\]$/.exec(started ?? '')?.[1] ?? '';
    expect((await kernel.exec('kvcoder.session.get', { sessionId: childId })).parentId).toBe(sessionId);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    const arrived = messages.find((message) => message.source?.kind === 'subagent');
    expect(arrived?.source).toEqual({ kind: 'subagent', sessionId: childId });
    expect(String(arrived?.content['content'])).toMatch(new RegExp(`^The background call \`subagent run --async .*\` \\(job ${childId}\\) finished:\\n(one|two|three)\\n\\[exit code 0\\]$`));
  });

  it("M2.4-E46 a child's approval shows in the root: the parent waits on the child, and the answer continues the child", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.shell.approval': 'ask' } });
    const sessionId = await newSession(kernel);
    fake.reply(calls(`subagent run '{"task":"Check","mode":"fresh"}'`), calls('echo child'), says('child done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const parent = await turnState(kernel, sessionId);
    const childId = String(parent.turn?.pending[0]?.childSessionId);
    const child = await turnState(kernel, childId);
    expect(child.session.status).toBe('waiting');
    expect(child.turn?.pending[0]).toMatchObject({ kind: 'approval', question: { command: 'echo child' } });
    await kernel.exec('kvcoder.question.answer', { questionId: String(child.turn?.pending[0]?.questionId), answer: { confirmed: true } });
    await kernel.clock.advance(0);
    expect(toolResults(fake, 2)).toEqual(['child\n[exit code 0]']);
    expect(toolResults(fake, 3)).toEqual(['child done\n[exit code 0]']);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' });
  });
});
