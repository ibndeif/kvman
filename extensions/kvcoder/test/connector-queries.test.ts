import { describe, expect, it, vi } from 'vitest';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { calls, says, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

describe('connector commands that are queries (08 §8.4, ADR 0009, 129)', { timeout: 30_000 }, () => {
  it('M2.5-E41 a connector may name a public query: it runs, -h describes it, and --async refuses it', async () => {
    const { kernel, fake } = await kvcoder.start();
    await kernel.exec('kvcoder.connector.register', { name: 'todo-read', description: 'Read the todo list.', commands: [{ name: 'list', command: 'todo.item.list' }] }, { as: '@test/todo' });
    await expect(kernel.exec('kvcoder.connector.register', { name: 'x', description: 'X.', commands: [{ name: 'go', command: 'kvcoder.session.list' }] }, { as: '@test/todo' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    const sessionId = await newSession(kernel);
    fake.reply(calls('todo-read list', 'todo-read -h', 'todo-read list --async'), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' }), wait);
    const [run, help, queued] = toolResults(fake);
    expect(run).toBe('[]\n[exit code 0]');
    expect(help).toContain('list  Lists the items.');
    expect(queued).toBe("error VALIDATION_FAILED: todo-read list reads only, so it can't run with --async.\n[exit code 1]");
  });
});
