import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { fsCall, runs, says } from './support/model-script.ts';
import { personTexts, readAt, seqOf, stored, turnOf, writeAt } from './support/rewind.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

// Editing a message (plan 08 §8.1 and §8.6, ADR 0118, 1, 2, and 6): the chat rewinds to just before it, kvman's own
// file changes after it go back, and the new text is sent in its place.

describe('editing a message (ADR 0118)', { timeout: 60_000 }, () => {
  it('QA77-H1 an edit rewinds the messages and the file, and sends the new text', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeAt(kernel, 'a.txt', 'one\n');
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'change it', runs(fsCall('read', { path: 'a.txt' })), runs(fsCall('edit', { path: 'a.txt', edits: [{ oldText: 'one', newText: 'two' }] })), says('Changed.'));
    await turnOf(kernel, fake, sessionId, 'thanks', says('You are welcome.'));
    expect(readAt(kernel, 'a.txt')).toBe('two\n');
    const seq = await seqOf(kernel, sessionId, 'change it');
    fake.reply(says('Again.'));
    const result = await kernel.exec('kvcoder.message.edit', { sessionId, seq, text: 'again', files: true });
    await kernel.clock.advance(0);
    expect(result).toEqual({ restored: ['a.txt'], deleted: [], left: [] });
    expect(readAt(kernel, 'a.txt')).toBe('one\n');
    expect(await personTexts(kernel, sessionId)).toEqual(['again']);
    const messages = await stored(kernel, sessionId);
    expect(messages.every((message) => (message.seq ?? 0) > seq || message.kind !== 'user' || message.content['content'] === 'again')).toBe(true);
    expect(messages.at(-1)?.content['content']).toEqual([{ type: 'text', text: 'Again.' }]);
  });

  it('QA77-H2 a file kvman created after the message is deleted', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'make it', runs(fsCall('write', { path: 'new.txt', content: 'fresh\n' })), says('Made.'));
    const seq = await seqOf(kernel, sessionId, 'make it');
    fake.reply(says('Fine.'));
    const result = await kernel.exec('kvcoder.message.edit', { sessionId, seq, text: 'not that', files: true });
    await kernel.clock.advance(0);
    expect(result.deleted).toEqual(['new.txt']);
    expect(readAt(kernel, 'new.txt')).toBeUndefined();
  });

  it('QA77-H13 a turn waiting on an approval is stopped, its question goes, and no CANCELLED notice is left', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'risky', runs(fsCall('write', { path: 'x.txt', content: 'x', risky: true })));
    expect((await turnState(kernel, sessionId)).session.status).toBe('waiting');
    const seq = await seqOf(kernel, sessionId, 'risky');
    fake.reply(says('Done.'));
    await kernel.exec('kvcoder.message.edit', { sessionId, seq, text: 'safe', files: true });
    await kernel.clock.advance(0);
    const messages = await stored(kernel, sessionId);
    expect(messages.some((message) => message.kind === 'notice')).toBe(false);
    expect(await personTexts(kernel, sessionId)).toEqual(['safe']);
    expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
    expect(readAt(kernel, 'x.txt')).toBeUndefined();
  });

  it('QA77-E9 a repeated edit with the same sendId rewinds nothing and returns empty lists', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'first', says('One.'));
    const seq = await seqOf(kernel, sessionId, 'first');
    fake.reply(says('Two.'));
    await kernel.exec('kvcoder.message.edit', { sessionId, seq, text: 'second', files: true, sendId: 'edit-1' });
    await kernel.clock.advance(0);
    const before = await stored(kernel, sessionId);
    expect(await kernel.exec('kvcoder.message.edit', { sessionId, seq, text: 'second', files: true, sendId: 'edit-1' })).toEqual({ restored: [], deleted: [], left: [] });
    expect(await stored(kernel, sessionId)).toEqual(before);
  });
});
