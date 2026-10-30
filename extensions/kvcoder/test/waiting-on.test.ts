import { describe, expect, it, vi } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { worker, workers } from './support/workers.ts';

// Who a chat waits on (08 §8.1, ADR 0091, 6): the person, its helpers, or no one.

const kvcoder = useKvcoder();
const waitingOn = async (kernel: TestKernel, sessionId: string) => (await kernel.exec('kvcoder.session.get', { sessionId })).waitingOn;
const listed = async (kernel: TestKernel) => Object.fromEntries((await kernel.exec('kvcoder.session.list', { limit: 10 })).map((session) => [session.id, session.waitingOn]));
const counted = async (kernel: TestKernel) => (await kernel.exec('kvcoder.session.count', { waitingOn: 'person' })).count;
const delegated = () => command('delegate', 'run', { worker: 'helper', title: 'Helper', kind: 'check', goal: 'Do it', done: 'It is done.' });

async function send(kernel: TestKernel, sessionId: string): Promise<void> {
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
}

describe('waitingOn (ADR 0091, 6)', { timeout: 60_000 }, () => {
  it('QA59-H9 and QA59-H10 a chat waiting on an approval is person, an idle one null, and the count is of the person', async () => {
    const { kernel, fake } = await kvcoder.start();
    const asking = await newSession(kernel);
    fake.reply(runs(shell('touch x', { risky: true })));
    await send(kernel, asking);
    const idle = await newSession(kernel);
    fake.reply(says('hello'));
    await send(kernel, idle);
    expect(await waitingOn(kernel, asking)).toBe('person');
    expect(await waitingOn(kernel, idle)).toBeNull();
    expect(await listed(kernel)).toEqual({ [asking]: 'person', [idle]: null });
    expect(await counted(kernel)).toBe(1);
  });

  it('QA59-H9 an idle chat whose background helper waits on an approval needs the person', async () => {
    const { kernel, fake, helperFake } = await kvcoder.start({ settings: workers(worker('helper')) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegated()), says('started it'));
    helperFake.reply(runs(shell('echo hi', { risky: true })));
    await send(kernel, sessionId);
    await vi.waitFor(async () => expect(await waitingOn(kernel, sessionId)).toBe('person'), wait);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle');
    expect(await counted(kernel)).toBe(1);
  });

  // Superseded by ADR 0108, 1: helpers run in the background, so a chat whose helper works is idle, not helpers.
  it('QA59-H9 a chat whose helper works is null, and one whose helper asks is person', async () => {
    const { kernel, fake, helperFake } = await kvcoder.start({ settings: workers(worker('helper')) });
    const sessionId = await newSession(kernel);
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const asks = runs(shell('echo hi', { risky: true }));
    fake.reply(runs(delegated()), says('started it'));
    helperFake.reply({ chunks: [{ wait: held }, ...('chunks' in asks ? asks.chunks : [])] });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(helperFake.requests()).toHaveLength(1), wait);
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
    expect(await waitingOn(kernel, sessionId)).toBeNull();
    expect(await counted(kernel)).toBe(0);
    release();
    await vi.waitFor(async () => expect(await waitingOn(kernel, sessionId)).toBe('person'), wait);
    expect(await counted(kernel)).toBe(1);
  });

});
