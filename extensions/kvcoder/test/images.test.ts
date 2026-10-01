import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { requestMessages, says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');

const upload = async (kernel: TestKernel, name: string, type: string): Promise<string> => z.object({ id: z.string() }).parse(await kernel.exec('todo.file.write', { name, base64: png, type }, { as: '@test/todo' })).id;

const imageParts = (content: unknown): unknown[] => (Array.isArray(content) ? content.filter((part: unknown) => typeof part === 'object' && part !== null && 'type' in part && part.type === 'image_url') : []);

describe('image attachments (08 §8.1, ADR 0009, 103)', { timeout: 30_000 }, () => {
  it('M2.4-H11 an image reaches an image model, and fails VALIDATION_FAILED for a text-only one', async () => {
    const { kernel, fake } = await kvcoder.start();
    const fileId = await upload(kernel, 'shot.png', 'image/png');
    const sessionId = await newSession(kernel);
    fake.reply(says('I see it'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'look', fileIds: [fileId] });
    await kernel.clock.advance(0);
    const user = requestMessages(fake).find((message) => message.role === 'user');
    expect(imageParts(user?.content)).toEqual([{ type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } }]);

    const textOnly = await newSession(kernel);
    await kernel.exec('kvcoder.session.configure', { sessionId: textOnly, model: 'fake/m2' });
    await expect(kernel.exec('kvcoder.message.send', { sessionId: textOnly, text: 'look', fileIds: [fileId] })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect(await kernel.exec('kvcoder.message.list', { sessionId: textOnly, limit: 10 })).toEqual({ messages: [], omitted: 0 });
  });

  it('M2.4-E14 a non-image or unknown file fails, and an image deleted after sending reaches the model as a note', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const text = await upload(kernel, 'notes.txt', 'text/plain');
    await expect(kernel.exec('kvcoder.message.send', { sessionId, text: 'x', fileIds: [text] })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(kernel.exec('kvcoder.message.send', { sessionId, text: 'x', fileIds: ['nope'] })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
    const image = await upload(kernel, 'gone.png', 'image/png');
    fake.reply(says('first'), says('second'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'look', fileIds: [image] });
    await kernel.clock.advance(0);
    await kernel.exec('todo.file.unlink', { id: image }, { as: '@test/todo' });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await kernel.clock.advance(0);
    const first = requestMessages(fake).find((message) => message.role === 'user');
    expect(JSON.stringify(first?.content)).toContain('[image gone.png was deleted]');
  });
});
