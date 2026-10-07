import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { longAlone, padded } from './support/long-messages.ts';
import { says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

const mebibyte = 1024 * 1024;

describe('a long chat lists its messages (08 §8.1, ADR 0033, 1)', { timeout: 60_000 }, () => {
  it('QA45-H1 a chat of more than 1 MiB of messages answers its newest 200', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    // A summary takes one reply when the chat passes `kvcoder.compactAt`, so each turn has two to spare.
    for (let index = 1; index <= 22; index += 1) {
      fake.reply(says(`answer ${index}`), says(`answer ${index}`));
      await kernel.exec('kvcoder.message.send', { sessionId, text: padded(`message ${index}`, longAlone) });
      await kernel.clock.advance(0);
    }
    const listed = await kernel.exec('kvcoder.message.list', { sessionId, limit: 200 });
    expect(Buffer.byteLength(JSON.stringify(listed))).toBeGreaterThan(mebibyte);
    expect(listed.omitted).toBe(0);
    expect(listed.messages.filter((message) => message.kind === 'user')).toHaveLength(22);
    expect(listed.messages.map((message) => message.seq)).toEqual(listed.messages.map((_, index) => index));
  });

  it('QA46-H7 with afterSeq only the newer messages are returned', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    for (const index of [1, 2]) {
      fake.reply(says(`answer ${index}`));
      await kernel.exec('kvcoder.message.send', { sessionId, text: `message ${index}` });
      await kernel.clock.advance(0);
    }
    const second = await kernel.exec('kvcoder.message.list', { sessionId, limit: 200, afterSeq: 1 });
    expect(second.messages.map((message) => message.seq)).toEqual([2, 3]);
    expect(await kernel.exec('kvcoder.message.list', { sessionId, limit: 200, afterSeq: 3 })).toMatchObject({ messages: [] });
  });
});
