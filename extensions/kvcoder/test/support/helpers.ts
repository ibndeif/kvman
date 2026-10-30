import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI, FakeReply } from '@kvman/testkit/fake-openai';

// A lead turn that starts helpers (ADR 0108, 1): the lead's replies and its helpers' come from their own fake servers,
// and the fake clock's advance resolves once every job, the helpers' and the lead's woken turns too, has ended.

export type Helped = { kernel: TestKernel; fake: FakeOpenAI; helperFake: FakeOpenAI };

/** Sends `text` with the lead's and the helpers' replies queued, and settles. */
export async function delegated(world: Helped, sessionId: string, lead: readonly FakeReply[], helper: readonly FakeReply[], text = 'go'): Promise<void> {
  world.fake.reply(...lead);
  world.helperFake.reply(...helper);
  await world.kernel.exec('kvcoder.message.send', { sessionId, text });
  await world.kernel.clock.advance(0);
}

/** The chat's helper sessions, oldest first. */
export async function helperIds(kernel: TestKernel, sessionId: string): Promise<string[]> {
  return (await kernel.exec('kvcoder.job.list', { sessionId })).filter((job) => job.kind === 'subagent').map((job) => job.id).reverse();
}
