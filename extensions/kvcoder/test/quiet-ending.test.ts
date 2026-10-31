import { describe, expect, it, vi } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeReply } from '@kvman/testkit/fake-openai';
import { heldReply } from './support/held-reply.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { brief } from './support/workers.ts';

// A chat's lead may answer a helper's ending that needs nothing with an empty reply (plan 08 §8.2, ADR 0113, 1): the
// turn ends quietly. A turn the person spoke in, and a helper's own empty reply, keep ADR 0054's hint.

const kvcoder = useKvcoder();
const empty: FakeReply = { chunks: [] };
const idle = async (kernel: TestKernel, sessionId: string): Promise<void> => vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
const hints = async (kernel: TestKernel, sessionId: string) =>
  (await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 })).messages.filter((message) => message.source?.kind === 'extension' && String(message.content['content']).startsWith('Your last reply was'));

// A lead that started one helper, which holds its answer until released, and is idle.
async function startedHelper(helperReplies: readonly FakeReply[] = []) {
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  world.fake.reply(runs(command('delegate', 'run', brief('general'))), says('Started.'));
  world.helperFake.reply(...helperReplies, { chunks: [{ wait: held }, { text: 'the answer' }] });
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await idle(world.kernel, sessionId);
  const [helperId = ''] = toolResults(world.fake, 1).flatMap((text) => /^started (\S+)/.exec(text)?.[1] ?? []);
  return { ...world, sessionId, helperId, release };
}

describe('a quiet ending (ADR 0113, 1)', { timeout: 30_000 }, () => {
  it("QA74-H3 an empty reply to a helper's ending ends the turn after one step, with no hint", async () => {
    const { kernel, fake, sessionId, release } = await startedHelper();
    fake.reply(empty, says('never asked'));
    release();
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(3), wait);
    await idle(kernel, sessionId);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', steps: 1 });
    expect(await hints(kernel, sessionId)).toEqual([]);
    expect(fake.requests()).toHaveLength(3);
  });

  it("QA74-E2 a background turn the person's message joined keeps the hint", async () => {
    const { kernel, fake, sessionId, release } = await startedHelper();
    const first = heldReply({ toolCall: { id: 'list-1', name: 'run', arguments: { connector: 'fs', command: 'list', payload: {} } } });
    fake.reply(first.reply, empty, says('Here you go.'));
    release();
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(3), wait);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'how is it going?' });
    first.release();
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(5), wait);
    await idle(kernel, sessionId);
    expect(await hints(kernel, sessionId)).toHaveLength(1);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', steps: 3 });
  });

  it("QA74-E3 a helper's empty reply is never quiet: it gets the hint and another step", async () => {
    const { kernel, fake, helperFake, helperId, release } = await startedHelper([empty]);
    fake.reply(says('Read it.'));
    release();
    await vi.waitFor(() => expect(helperFake.requests()).toHaveLength(2), wait);
    await idle(kernel, helperId);
    expect(await hints(kernel, helperId)).toHaveLength(1);
    expect((await turnState(kernel, helperId)).turn).toMatchObject({ outcome: 'done', steps: 2 });
  });
});
