import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

// A turn whose model call keeps failing for a temporary reason waits for the connection, and a schedule tries it again
// every 2 minutes (plan 08 §8.1, ADR 0108, 15). The step's own tries wait real time (1, 4, 15, and 60 s).

const kvcoder = useKvcoder();
const failure = (status: number, message: string) => ({ status, body: { error: { message, type: 'server_error' } } });
const fiveFailures = () => Array.from({ length: 5 }, (_, index) => failure(503, `down ${String(index)}`));
const notices = async (kernel: TestKernel, sessionId: string): Promise<unknown[]> => (await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 })).messages.filter((message) => message.kind === 'notice').map((message) => message.content['code']);

async function waitingChat() {
  const { kernel, fake } = await kvcoder.start();
  const sessionId = await newSession(kernel);
  fake.reply(...fiveFailures());
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return { kernel, fake, sessionId };
}

describe('waiting for the connection (ADR 0108, 15)', { timeout: 180_000 }, () => {
  it('QA71-H28 after its tries the turn waits with one notice, and the next scheduled try goes on with the turn', async () => {
    const { kernel, fake, sessionId } = await waitingChat();
    expect(fake.requests()).toHaveLength(5);
    const waiting = await turnState(kernel, sessionId);
    expect(waiting.session.status).toBe('waiting');
    expect(waiting.turn?.outcome).toBeUndefined();
    expect(await notices(kernel, sessionId)).toEqual(['CONNECTION_WAITING']);
    fake.reply(says('Back.'));
    // The schedule's time is the handler's own, which the step's real waits moved past the fake clock's start.
    await kernel.clock.advance(240_000);
    expect(fake.requests()).toHaveLength(6);
    const done = await turnState(kernel, sessionId);
    expect(done.turn?.outcome).toBe('done');
    expect(done.session.status).toBe('idle');
  });

  it("QA71-E21 the person's message during the wait runs the step at once", async () => {
    const { kernel, fake, sessionId } = await waitingChat();
    fake.reply(says('Here.'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'try now' });
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(6);
    expect((await turnState(kernel, sessionId)).turn?.outcome).toBe('done');
  });

  it('QA71-E22 Stop during the wait ends the turn cancelled, and the scheduled try then does nothing', async () => {
    const { kernel, fake, sessionId } = await waitingChat();
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    await kernel.clock.advance(120_000);
    expect(fake.requests()).toHaveLength(5);
    expect((await turnState(kernel, sessionId)).turn?.outcome).toBe('cancelled');
  });
});
