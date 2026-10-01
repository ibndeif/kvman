import type { FakeChunk, FakeReply } from '@kvman/testkit/fake-openai';

// A fake model reply that waits until the test releases it, so a test can act while a step's model call runs.
export function heldReply(...chunks: readonly FakeChunk[]): { reply: FakeReply; release(): void } {
  let release = (): void => undefined;
  const wait = new Promise<void>((resolve) => (release = resolve));
  return { reply: { chunks: [{ wait }, ...chunks] }, release: () => release() };
}
