import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { fsCall, runs, says } from './support/model-script.ts';
import { readAt, seqOf, stored, turnOf, writeAt } from './support/rewind.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// Undoing the latest message (plan 08 §8.6, ADR 0118, 1 and 6): the chat rewinds to just before it, and the message
// comes back for the send box, its typed text, images, and attached files apart.

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const upload = async (kernel: TestKernel, name: string, type: string, content: string): Promise<string> => z.object({ id: z.string() }).parse(await kernel.exec('todo.file.write', { name, base64: content, type }, { as: '@test/todo' })).id;

describe('undoing a message (ADR 0118)', { timeout: 60_000 }, () => {
  it('QA77-H3 an undo returns the typed text, the images, and the attached files, and takes the change back', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeAt(kernel, 'a.txt', 'one\n');
    const image = await upload(kernel, 'shot.png', 'image/png', png);
    const notes = await upload(kernel, 'notes.txt', 'text/plain', Buffer.from('notes').toString('base64'));
    const sessionId = await newSession(kernel);
    fake.reply(runs(fsCall('read', { path: 'a.txt' })), runs(fsCall('edit', { path: 'a.txt', edits: [{ oldText: 'one', newText: 'two' }] })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Fix it', fileIds: [image, notes] });
    await kernel.clock.advance(0);
    const result = await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect(result).toEqual({ text: 'Fix it', fileIds: [image], fileNames: ['shot.png'], attachments: ['attachments/notes.txt'], restored: ['a.txt'], deleted: [], left: [] });
    expect(readAt(kernel, 'a.txt')).toBe('one\n');
    expect(await stored(kernel, sessionId)).toEqual([]);
  });

  it('QA77-H4 conversation only keeps the files, and a later rewind to an earlier message still takes them back', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'first', says('ok'));
    await turnOf(kernel, fake, sessionId, 'second', runs(fsCall('write', { path: 'x.txt', content: 'x\n' })), says('ok'));
    expect(await kernel.exec('kvcoder.message.undo', { sessionId, files: false })).toMatchObject({ text: 'second', restored: [], deleted: [] });
    expect(readAt(kernel, 'x.txt')).toBe('x\n');
    const seq = await seqOf(kernel, sessionId, 'first');
    fake.reply(says('ok'));
    expect((await kernel.exec('kvcoder.message.edit', { sessionId, seq, text: 'first again', files: true })).deleted).toEqual(['x.txt']);
    await kernel.clock.advance(0);
    expect(readAt(kernel, 'x.txt')).toBeUndefined();
  });

  it("QA77-H17 a slash command's message is undone, with a kvcoder hint after it", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'typed', says('ok'));
    fake.reply(says('started'), says('noted'));
    await kernel.exec('kvcoder.message.inject', { sessionId, text: 'Run the video guide.' }, { as: '@test/todo' });
    await kernel.clock.advance(0);
    await kernel.exec('kvcoder.message.inject', { sessionId, text: '[kvman: a hint]' }, { as: '@kvman/kvcoder' });
    await kernel.clock.advance(0);
    const result = await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect(result.text).toBe('Run the video guide.');
    expect((await stored(kernel, sessionId)).map((message) => message.content['content'])).toEqual(['typed', [{ type: 'text', text: 'ok' }]]);
  });

  it('QA77-E12 undoing the first message leaves an empty chat with its title and no marks', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await turnOf(kernel, fake, sessionId, 'only', says('ok'));
    await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect(await stored(kernel, sessionId)).toEqual([]);
    const session = await kernel.exec('kvcoder.session.get', { sessionId });
    expect(session.title).toBe('Test');
    expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).toEqual([]);
  });
});
