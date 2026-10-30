import { describe, expect, it, vi } from 'vitest';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { endedProbe } from './support/ended-probe.ts';
import { helperIds } from './support/helpers.ts';

// ADR 0087, 1: the turn that ends stores a result for every call of its last reply.

const kvcoder = useKvcoder();

const stopped = (why: string): string => `stopped while it ran (${why}): what it changed is unknown, so check before you run it again`;

async function storedResults(kernel: Awaited<ReturnType<typeof kvcoder.start>>['kernel'], sessionId: string) {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  return messages.filter((message) => message.kind === 'toolResult').map((message) => ({ id: message.content['toolCallId'], text: JSON.stringify(message.content['content']), isError: message.content['isError'] }));
}

describe('the calls of an ended turn (ADR 0087, 1)', { timeout: 30_000 }, () => {
  it('QA55-H1 a stopped turn stores what ran and what never started, and the next step sends both', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('fs', 'list', { path: '.' }), shell('echo hi', { risky: true })), says('after'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).session.status).toBe('waiting'), wait);
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    const results = await storedResults(kernel, sessionId);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ isError: false });
    expect(results[1]).toEqual({ id: expect.any(String), text: JSON.stringify([{ type: 'text', text: 'not run: the person stopped the turn' }]), isError: true });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go on' });
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).session.status).toBe('idle'), wait);
    const sent = toolResults(fake);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toBe('not run: the person stopped the turn');
    expect(sent.join('\n')).not.toContain('No result provided');
  });

  // ADR 0108, 1: a helper's call returns `started` at once, so a stopped turn keeps that result, and the helper goes on.
  it('QA55-H2 a helper started in a stopped turn keeps its started result, and goes on', async () => {
    const { kernel, fake, helperFake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'general', title: 'Helper', kind: 'check', goal: 'Ask them', done: 'It is done.' })), runs(command('ask', 'confirm', { prompt: 'Go on?' })));
    helperFake.reply(runs(shell('true', { risky: true })));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    const childId = await vi.waitFor(async () => {
      const [id = ''] = await helperIds(kernel, sessionId);
      expect((await turnState(kernel, id)).session.status).toBe('waiting');
      expect((await turnState(kernel, sessionId)).session.status).toBe('waiting');
      return id;
    }, wait);
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    const results = await storedResults(kernel, sessionId);
    expect(results.map((result) => result.text)).toEqual([JSON.stringify([{ type: 'text', text: `started ${childId}\n\n(helper ${childId})` }]), JSON.stringify([{ type: 'text', text: 'not run: the person stopped the turn' }])]);
    expect((await turnState(kernel, childId)).session.status).toBe('waiting');
  });

  it('QA55-E3 a turn that fails at its model call adds no result', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply({ status: 400, body: { error: { message: 'Bad request.' } } });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'failed' }), wait);
    expect(await storedResults(kernel, sessionId)).toEqual([]);
  });

  it('QA55-E1 QA55-E2 QA55-E4 each call gets what the turn held for it, and a stored one gets nothing more', async () => {
    const results = await endedProbe('interrupted');
    expect(results).toEqual([
      { id: 'stored', text: 'already here', isError: false },
      { id: 'held', text: 'ran before the end', isError: false },
      { id: 'approved', text: 'not run: kvman stopped', isError: true },
      { id: 'deferred', text: 'not run: kvman stopped', isError: true },
      { id: 'question', text: 'not run: kvman stopped', isError: true },
      { id: 'helper', text: stopped('kvman stopped'), isError: true },
      { id: 'running', text: stopped('kvman stopped'), isError: true },
    ]);
  });

  it('QA55-E1 each ending names why', async () => {
    expect((await endedProbe('failed')).at(-1)?.text).toBe(stopped('the turn failed'));
    expect((await endedProbe('maxSteps')).at(-1)?.text).toBe(stopped('the turn reached its step limit'));
    expect((await endedProbe('cancelled')).at(-1)?.text).toBe(stopped('the person stopped the turn'));
  });
});
