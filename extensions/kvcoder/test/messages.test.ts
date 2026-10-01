import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

describe('messages (08 §8.1, §8.6)', { timeout: 30_000 }, () => {
  it('M2.4-E10 an extension sending a message fails NOT_PUBLIC', async () => {
    const { kernel } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await expect(kernel.exec('kvcoder.message.send', { sessionId, text: 'x' }, { as: '@test/todo' })).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
  });

  it('M2.4-E11 message.list gives the newest limit in order and the count of older ones', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    for (const index of [1, 2, 3]) {
      fake.reply(says(`answer ${index}`));
      await kernel.exec('kvcoder.message.send', { sessionId, text: `message ${index}` });
      await kernel.clock.advance(0);
    }
    const { messages, omitted } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 4 });
    expect(omitted).toBe(2);
    expect(messages.map((message) => message.seq)).toEqual([2, 3, 4, 5]);
    expect(messages.map((message) => message.kind)).toEqual(['user', 'assistant', 'user', 'assistant']);
    await expect(kernel.exec('kvcoder.message.list', { sessionId, limit: 1001 })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
  });

  it('M2.4-E13 a note is stored and never starts a turn', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.note.add', { sessionId, key: 'todo.notes.saved', params: { count: 2 } }, { as: '@test/todo' });
    await kernel.clock.advance(0);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 10 });
    expect(messages).toEqual([expect.objectContaining({ kind: 'note', content: { key: 'todo.notes.saved', params: { count: 2 } } })]);
    expect(fake.requests()).toHaveLength(0);
    expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).toEqual([]);
  });
});
