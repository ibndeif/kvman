import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

const todo = { as: '@test/todo' };

const points = ['kvcoder.session.created', 'kvcoder.session.deleted', 'kvcoder.session.forked', 'kvcoder.turn.started', 'kvcoder.turn.ended', 'kvcoder.session.waiting'] as const;

describe('session points (08 §8.4)', { timeout: 30_000 }, () => {
  it("M2.4-E42 a handler must be a known point and the caller's own public command; registering again replaces it", async () => {
    const { kernel } = await kvcoder.start();
    await expect(kernel.exec('kvcoder.handler.register', { point: 'kvcoder.nope', command: 'todo.seen' } as never, todo)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(kernel.exec('kvcoder.handler.register', { point: 'kvcoder.session.created', command: 'kvai.complete' }, todo)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(kernel.exec('kvcoder.handler.register', { point: 'kvcoder.session.created', command: 'todo.private' }, todo)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await kernel.exec('kvcoder.handler.register', { point: 'kvcoder.session.created', command: 'todo.seen' }, todo);
    await kernel.exec('kvcoder.handler.register', { point: 'kvcoder.session.created', command: 'todo.react' }, todo);
    expect(await kernel.exec('kvcoder.handler.list', {})).toEqual([{ point: 'kvcoder.session.created', command: 'todo.react', owner: '@test/todo' }]);
    await kernel.exec('kvcoder.handler.unregister', { point: 'kvcoder.session.created' }, { as: '@kvman/kvai' });
    expect(await kernel.exec('kvcoder.handler.list', {})).toHaveLength(1);
    await kernel.exec('kvcoder.handler.unregister', { point: 'kvcoder.session.created' }, todo);
    expect(await kernel.exec('kvcoder.handler.list', {})).toEqual([]);
  });

  it('M2.4-E21 each point queues one job per handler, with ids and totals only', async () => {
    const { kernel, fake } = await kvcoder.start();
    for (const point of points) await kernel.exec('kvcoder.handler.register', { point, command: 'todo.seen' }, todo);
    const sessionId = await newSession(kernel);
    fake.reply({ ...runs(command('ask', 'confirm', {"prompt":"?"})), usage: { input: 7, output: 3 } }, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const { turn } = await turnState(kernel, sessionId);
    await kernel.exec('kvcoder.question.answer', { questionId: String(turn?.pending[0]?.questionId), answer: { confirmed: true } });
    await kernel.clock.advance(0);
    const fork = await kernel.exec('kvcoder.session.fork', { sessionId, throughSeq: 0 });
    await kernel.exec('kvcoder.session.delete', { sessionId: fork.id });
    await kernel.clock.advance(0);
    const seen = await kernel.exec('todo.seen.list', {});
    const turnId = String(turn?.id);
    expect(seen).toEqual(
      expect.arrayContaining([
        { sessionId },
        { sessionId, turnId },
        { sessionId, kind: 'question' },
        { sessionId, turnId, outcome: 'done', usage: { input: 7, output: 3, cacheRead: 0, cacheWrite: 0, cost: 0 }, durationMs: expect.any(Number) as unknown },
        { fromSessionId: sessionId, toSessionId: fork.id, throughSeq: 0 },
        { sessionId: fork.id },
      ]),
    );
    expect(seen).toHaveLength(7);
  });

  it('M2.4-E12 inject marks the extension and starts a turn, but injected from a handler job it starts none', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(says('first'));
    await kernel.exec('kvcoder.message.inject', { sessionId, text: 'from todo' }, todo);
    await kernel.clock.advance(0);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 10 });
    expect(messages[0]).toMatchObject({ kind: 'user', source: { kind: 'extension', name: '@test/todo' } });
    expect(messages[1]).toMatchObject({ kind: 'assistant' });

    await kernel.exec('kvcoder.handler.register', { point: 'kvcoder.turn.ended', command: 'todo.react' }, todo);
    fake.reply(says('second'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await kernel.clock.advance(0);
    const after = await kernel.exec('kvcoder.message.list', { sessionId, limit: 10 });
    expect(after.messages.at(-1)).toMatchObject({ kind: 'user', source: { kind: 'extension', name: '@test/todo' }, content: { content: 'from a handler' } });
    expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).toHaveLength(2);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle');
  });
});
