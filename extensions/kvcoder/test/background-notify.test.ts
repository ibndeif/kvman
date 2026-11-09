import { describe, expect, it, vi } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { heldReply } from './support/held-reply.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { runs, says, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

// A background line with `notify: true` wakes an idle chat when it ends (plan 08 §8.3, ADR 0108, 16).

const kvcoder = useKvcoder();
const line = (milliseconds: number, notify?: boolean, background = true): RunCallSpec => ({ connector: 'shell', command: 'exec', payload: { line: `node -e "setTimeout(() => {}, ${String(milliseconds)})"`, risky: false, ...(background ? { background: true } : {}), ...(notify === undefined ? {} : { notify }) } });

type Listed = { kind: string; queued?: boolean; content: Record<string, unknown> };
const finishedMessages = async (kernel: TestKernel, sessionId: string): Promise<Listed[]> =>
  ((await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 })).messages as Listed[]).filter((message) => message.kind === 'user' && JSON.stringify(message.content).includes(') finished:'));
const turnCount = async (kernel: TestKernel, sessionId: string): Promise<number> => (await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).length;

async function idle(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, requests: number): Promise<void> {
  await vi.waitFor(async () => {
    expect(fake.requests().length).toBe(requests);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle');
  }, { timeout: 30_000, interval: 100 });
}

describe('notify on a background line (ADR 0108, 16)', { timeout: 60_000 }, () => {
  it('QA71-H29 a notify line that ends starts a turn', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(line(2500, true)), says('Downloading; I go on when it ends.'), says('It finished.'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'download it' });
    await idle(kernel, fake, sessionId, 2);
    await idle(kernel, fake, sessionId, 3);
    expect(JSON.stringify(fake.requests().at(-1))).toContain(') finished:');
    expect(await turnCount(kernel, sessionId)).toBe(2);
  });

  it('QA71-E25 notify without background is refused', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(line(10, true, false)), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await idle(kernel, fake, sessionId, 2);
    expect(toolResults(fake)[0]).toContain('error VALIDATION_FAILED: notify works only with background set to true');
  });

  it('QA71-E26 a notify line that ends while a turn runs is read by its next step and starts no second turn', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const held = heldReply({ text: 'still working' });
    fake.reply(runs(line(1500, true)), held.reply, says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(2), wait);
    await vi.waitFor(async () => expect((await finishedMessages(kernel, sessionId)).map((message) => message.queued)).toEqual([true]), { timeout: 30_000, interval: 100 });
    held.release();
    await idle(kernel, fake, sessionId, 3);
    expect(JSON.stringify(fake.requests()[2])).toContain(') finished:');
    expect(await turnCount(kernel, sessionId)).toBe(1);
  });
});
