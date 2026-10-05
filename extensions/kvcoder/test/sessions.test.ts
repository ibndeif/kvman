import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

describe('sessions (08 §8.6)', { timeout: 30_000 }, () => {
  it('M2.4-E1 an unknown session, or one of another workspace, fails SESSION_NOT_FOUND', async () => {
    const { kernel, root } = await kvcoder.start();
    const { mkdtempSync } = await import('node:fs');
    const other = await kernel.exec('kernel.workspace.open', { path: mkdtempSync(`${root}/other-`) });
    const foreign = await newSession(kernel, other.id);
    for (const sessionId of ['nope', foreign]) {
      const calls = [
        kernel.exec('kvcoder.session.get', { sessionId }),
        kernel.exec('kvcoder.session.rename', { sessionId, title: 'x' }),
        kernel.exec('kvcoder.session.configure', { sessionId, thinking: 'off' }),
        kernel.exec('kvcoder.session.delete', { sessionId }),
        kernel.exec('kvcoder.session.compact', { sessionId }),
        kernel.exec('kvcoder.session.export', { sessionId }),
        kernel.exec('kvcoder.session.fork', { sessionId }),
        kernel.exec('kvcoder.message.send', { sessionId, text: 'x' }),
        kernel.exec('kvcoder.message.inject', { sessionId, text: 'x' }, { as: '@test/todo' }),
        kernel.exec('kvcoder.note.add', { sessionId, key: 'x' }, { as: '@test/todo' }),
        kernel.exec('kvcoder.message.list', { sessionId, limit: 1 }),
        kernel.exec('kvcoder.turn.list', { sessionId, limit: 1 }),
        kernel.exec('kvcoder.turn.cancel', { sessionId }),
        kernel.exec('kvcoder.prompt.get', { sessionId }),
      ];
      for (const call of calls) await expect(call).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND', params: { sessionId } } });
    }
  });

  it('M2.4-E4 session.list gives top-level sessions newest first, its limit is at most 1000, and session.count counts by status', async () => {
    const { kernel, fake } = await kvcoder.start();
    const first = await newSession(kernel);
    const second = await newSession(kernel);
    fake.reply(runs(command('ask', 'text', {"prompt":"?"})), runs(command('subagent', 'run', {"task":"t","mode":"fresh"})), says('child'));
    await kernel.exec('kvcoder.message.send', { sessionId: first, text: 'go' });
    await kernel.clock.advance(0);
    expect((await kernel.exec('kvcoder.session.list', { limit: 10 })).map((session) => session.id)).toEqual([second, first]);
    expect(await kernel.exec('kvcoder.session.count', {})).toEqual({ count: 2 });
    expect(await kernel.exec('kvcoder.session.count', { status: 'waiting' })).toEqual({ count: 1 });
    await expect(kernel.exec('kvcoder.session.list', { limit: 1001 })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
  });

  it('M2.4-E6 configure changes the model and thinking from the next step, and an unknown model fails that step', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.session.configure', { sessionId, model: 'fake/m2', thinking: 'off' });
    expect(await kernel.exec('kvcoder.session.get', { sessionId })).toMatchObject({ model: 'fake/m2', thinking: 'off' });
    fake.reply(says('hi'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(fake.requests().at(-1)?.body).toMatchObject({ model: 'm2' });
    await kernel.exec('kvcoder.session.configure', { sessionId, model: 'fake/nope' });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await kernel.clock.advance(0);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 10 });
    expect(messages.at(-1)?.content).toEqual({ code: 'STEP_FAILED', params: { code: 'kvai/MODEL_UNKNOWN', details: { model: 'fake/nope' } } });
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'failed' });
  });

  it('M2.4-E9 delete cancels the turn and deletes its subagent sessions and per-session sections, then fires the point', async () => {
    const { kernel, fake } = await kvcoder.start();
    await kernel.exec('kvcoder.handler.register', { point: 'kvcoder.session.deleted', command: 'todo.seen' }, { as: '@test/todo' });
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.section.set', { id: 'mine', title: 'Mine', order: 1, content: 'x', sessionId }, { as: '@test/todo' });
    fake.reply(runs(command('subagent', 'run', {"task":"t","mode":"fresh"})), runs(command('ask', 'text', {"prompt":"?"})));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const childId = String((await turnState(kernel, sessionId)).turn?.pending[0]?.childSessionId);
    await kernel.exec('kvcoder.session.delete', { sessionId });
    await kernel.clock.advance(0);
    for (const id of [sessionId, childId]) await expect(kernel.exec('kvcoder.session.get', { sessionId: id })).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND' } });
    expect((await kernel.exec('kvcoder.section.list', {})).map((section) => section.id)).not.toContain('mine');
    expect(await kernel.exec('todo.seen.list', {})).toEqual([{ sessionId }]);
  });
});
