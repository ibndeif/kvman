import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

describe('an earlier page of messages (KVC-23, ADR 0059)', { timeout: 30_000 }, () => {
  it('M2.4-E190 beforeSeq gives the newest messages before it, in order, with the count of older ones', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    for (const index of [1, 2, 3]) {
      fake.reply(says(`answer ${String(index)}`));
      await kernel.exec('kvcoder.message.send', { sessionId, text: `message ${String(index)}` });
      await kernel.clock.advance(0);
    }
    const page = await kernel.exec('kvcoder.message.list', { sessionId, limit: 2, beforeSeq: 4 });
    expect(page.messages.map((message) => message.seq)).toEqual([2, 3]);
    expect(page.omitted).toBe(2);
    const first = await kernel.exec('kvcoder.message.list', { sessionId, limit: 10, beforeSeq: 2 });
    expect(first.messages.map((message) => message.seq)).toEqual([0, 1]);
    expect(first.omitted).toBe(0);
    expect(await kernel.exec('kvcoder.message.list', { sessionId, limit: 10, beforeSeq: 0 })).toEqual({ messages: [], omitted: 0 });
    expect((await kernel.exec('kvcoder.message.list', { sessionId, limit: 2 })).omitted).toBe(4);
  });
});
