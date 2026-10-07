import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, shell, textOf, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();

// What the provider did: a short text, no call, and thousands of output tokens that never arrived.
const lost = (tokens: number): FakeReply => ({ chunks: [{ text: 'I will write the file now.' }], usage: { input: 100, output: tokens } });

async function started(settings?: Record<string, string | number>) {
  const world = await kvcoder.start(settings === undefined ? {} : { settings });
  const sessionId = await newSession(world.kernel);
  const send = async (text: string): Promise<void> => {
    await world.kernel.exec('kvcoder.message.send', { sessionId, text });
    await world.kernel.clock.advance(0);
  };
  const hints = async () => (await world.kernel.exec('kvcoder.message.list', { sessionId, limit: 100 })).messages.filter((message) => message.source?.kind === 'extension');
  return { ...world, sessionId, send, hints };
}

describe('a reply lost on the way is not the end of the turn (08 §8.2, ADR 0009, 188)', { timeout: 30_000 }, () => {
  it('QA8-H6 and QA8-H7 a lost reply gets a hint from kvcoder and another step, and the turn goes on to its end', async () => {
    const { kernel, fake, sessionId, send, hints } = await started();
    fake.reply(lost(3400), runs(shell('touch made.txt')), says('done'));
    await send('go');
    expect(existsSync(path.join(kernel.homeFolder, 'made.txt'))).toBe(true);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', steps: 3 });
    const [hint] = await hints();
    expect(hint).toMatchObject({ kind: 'user', source: { kind: 'extension', name: '@kvman/kvcoder' } });
    expect(String(hint?.content['content'])).toContain('Your last reply was lost on the way: the provider produced about 3400 tokens');
    expect(textOf(requestMessages(fake, 1).at(-1))).toContain('Your last reply was lost on the way');
  });

  it('QA8-H8 after two retries the third lost reply ends the turn failed with the notice REPLY_LOST, and no fourth step runs', async () => {
    const { kernel, fake, sessionId, send } = await started();
    fake.reply(lost(3400), lost(3500), lost(3600), says('never asked'));
    await send('go');
    const { session, turn } = await turnState(kernel, sessionId);
    expect(session.status).toBe('idle');
    expect(turn).toMatchObject({ outcome: 'failed', steps: 3 });
    expect(fake.requests()).toHaveLength(3);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.at(-1)).toMatchObject({ kind: 'notice', content: { code: 'REPLY_LOST', params: { tokens: 3587 } } });
  });

  it('QA8-E6 a reply with a call is never lost, however many tokens it took', async () => {
    const { fake, sessionId, kernel, send, hints } = await started();
    fake.reply({ ...runs(shell('echo hi')), usage: { input: 100, output: 5000 } }, says('done'));
    await send('go');
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', steps: 2 });
    expect(await hints()).toEqual([]);
  });

  it('QA8-E8 the retries belong to the turn: two lost replies in one turn leave the next turn its own retry', async () => {
    const { fake, sessionId, kernel, send, hints } = await started();
    fake.reply(lost(3400), lost(3400), says('first done'));
    await send('go');
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', steps: 3 });
    fake.reply(lost(3400), says('second done'));
    await send('again');
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', steps: 2 });
    expect(await hints()).toHaveLength(3);
  });

  it('QA8-E9 a lost reply counts as a step: at kvcoder.maxSteps the turn ends maxSteps', async () => {
    const { fake, sessionId, kernel, send } = await started({ 'kvcoder.maxSteps': 2 });
    fake.reply(lost(3400), lost(3400), says('never asked'));
    await send('go');
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'maxSteps', steps: 2 });
    expect(fake.requests()).toHaveLength(2);
  });

  it('QA8-E10 a turn stopped while the model is still answering is not retried, and gets no hint', async () => {
    const { fake, sessionId, kernel, hints } = await started();
    let release = (): void => undefined;
    const hold = new Promise<void>((resolve) => (release = resolve));
    fake.reply({ chunks: [{ text: 'x' }, { wait: hold }], usage: { input: 10, output: 3000 } }, says('late'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(1), wait);
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    release();
    await kernel.clock.advance(0);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'cancelled' });
    expect(await hints()).toEqual([]);
    expect(fake.requests()).toHaveLength(1);
  });

  it("QA8-E11 a subagent's lost reply is retried too, and its answer reaches the parent", async () => {
    const { fake, sessionId, kernel, send } = await started();
    fake.reply(runs(command('delegate', 'run', { worker: 'general', title: 'Helper', task: 'Do it' })), lost(3400), says('child done'), says('parent done'));
    await send('go');
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' });
    expect(textOf(requestMessages(fake, 2).at(-1))).toContain('Your last reply was lost on the way');
    expect(toolResults(fake).join('\n')).toContain('child done');
  });
});
