import type { Json } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();
const asTodo = { as: '@test/todo' };

// A connector whose `add` asks the person first and whose `list` doesn't.
const guarded = { name: 'guarded', description: 'A guarded todo list.', commands: [{ name: 'add', command: 'todo.item.add', asks: true as const }, { name: 'list', command: 'todo.item.list' }] };

async function started(settings: Record<string, string> = {}) {
  const world = await kvcoder.start({ settings });
  await world.kernel.exec('kvcoder.connector.register', guarded, asTodo);
  return world;
}

const items = (kernel: TestKernel) => kernel.exec('todo.item.list', {}, asTodo);

async function answer(kernel: TestKernel, sessionId: string, confirmed: boolean): Promise<void> {
  const { turn } = await turnState(kernel, sessionId);
  await kernel.exec('kvcoder.question.answer', { questionId: String(turn?.pending[0]?.questionId), answer: { confirmed } });
  await kernel.clock.advance(0);
}

async function sent(world: Awaited<ReturnType<typeof started>>, ...replies: Parameters<typeof world.fake.reply>): Promise<string> {
  const sessionId = await newSession(world.kernel);
  world.fake.reply(...replies);
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return sessionId;
}

describe('a registered command that asks the person first (08 §8.3 and §8.4, ADR 0022, 5, 10, and 11)', { timeout: 30_000 }, () => {
  it('QA34-H1 a command entry takes asks: true, and the list says which commands ask', async () => {
    const { kernel } = await started();
    const listed = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'guarded');
    expect(listed?.commands?.map((entry) => [entry.name, entry.asks])).toEqual([['add', true], ['list', false]]);
  });

  it('QA34-H2 a call of it asks under auto, holds the call, and runs it once allowed', async () => {
    const world = await started({ 'kvcoder.shell.approval': 'auto' });
    const sessionId = await sent(world, runs(command('guarded', 'add', { text: 'milk' })), says('done'));
    const waiting = await turnState(world.kernel, sessionId);
    expect(waiting.session.status).toBe('waiting');
    expect(waiting.turn?.pending).toEqual([expect.objectContaining({ kind: 'approval', question: { description: 'A test call.', connector: 'guarded', command: 'add', payload: { text: 'milk' } } })]);
    expect(await items(world.kernel)).toEqual([]);
    await answer(world.kernel, sessionId, true);
    expect(await items(world.kernel)).toEqual([{ text: 'milk' }]);
    expect(toolResults(world.fake)[0]).toContain('"text":"milk"');
    expect((await turnState(world.kernel, sessionId)).turn).toMatchObject({ outcome: 'done' });
  });

  it('QA34-H3 and QA34-E5 help says that the command asks, only for that command, and help itself never asks', async () => {
    const world = await started();
    const sessionId = await sent(world, runs(command('guarded', 'help', { command: 'add' }), command('guarded', 'help', { command: 'list' })), says('done'));
    expect((await turnState(world.kernel, sessionId)).turn).toMatchObject({ outcome: 'done', pending: [] });
    const [add, list] = toolResults(world.fake);
    expect(add?.split('\n').slice(0, 3)).toEqual(['guarded add: Adds a todo item.', '', 'The person is asked before this runs.']);
    expect(list).not.toContain('The person is asked before this runs.');
  });

  it('QA34-E1 a denied call returns denied by the user and its command never ran', async () => {
    const world = await started();
    const sessionId = await sent(world, runs(command('guarded', 'add', { text: 'milk' })), says('done'));
    await answer(world.kernel, sessionId, false);
    expect(toolResults(world.fake)).toEqual(['denied by the user']);
    expect(await items(world.kernel)).toEqual([]);
  });

  it('QA34-E2 asks takes only true, and only on a command entry', async () => {
    const { kernel } = await kvcoder.start();
    const failed = { problem: { code: 'VALIDATION_FAILED' } };
    const register = (input: Json) => kernel.exec('kvcoder.connector.register', input as never, asTodo);
    await expect(register({ name: 'off', description: 'Never asks.', commands: [{ name: 'add', command: 'todo.item.add', asks: false }] })).rejects.toMatchObject(failed);
    await expect(register({ name: 'program', description: 'A program.', binary: { check: 'true' }, asks: true })).rejects.toMatchObject(failed);
    expect((await kernel.exec('kvcoder.connector.list', {})).map((connector) => connector.name)).toEqual(['todo']);
  });

  it('QA34-E3 a command without asks runs at once, with auto and with ask', async () => {
    for (const approval of ['auto', 'ask']) {
      const world = await started({ 'kvcoder.shell.approval': approval });
      const sessionId = await sent(world, runs(command('guarded', 'list'), command('todo', 'add', { text: approval })), says('done'));
      expect((await turnState(world.kernel, sessionId)).turn, approval).toMatchObject({ outcome: 'done', pending: [] });
      expect(await items(world.kernel), approval).toEqual([{ text: approval }]);
    }
  });

  it("QA34-E4 a subagent's call of it waits on the person, and runs when allowed", async () => {
    const world = await started(workers(worker('helper', { connectors: ['guarded'] })) as Record<string, string>);
    const sessionId = await sent(world, runs(command('delegate', 'run', { worker: 'helper', task: 'Add milk.' })), runs(command('guarded', 'add', { text: 'milk' })), says('child done'), says('parent done'));
    const parent = await turnState(world.kernel, sessionId);
    const childId = String(parent.turn?.pending[0]?.childSessionId);
    const child = await turnState(world.kernel, childId);
    expect(child.session.status).toBe('waiting');
    expect(child.turn?.pending[0]).toMatchObject({ kind: 'approval', question: { connector: 'guarded', command: 'add', payload: { text: 'milk' } } });
    expect(await items(world.kernel)).toEqual([]);
    await answer(world.kernel, childId, true);
    expect(await items(world.kernel)).toEqual([{ text: 'milk' }]);
    expect((await turnState(world.kernel, sessionId)).turn).toMatchObject({ outcome: 'done' });
  });
});
