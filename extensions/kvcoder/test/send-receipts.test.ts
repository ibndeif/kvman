import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { sendReceiptDocSchema } from '../src/schemas/records.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const invalid = { problem: { code: 'VALIDATION_FAILED' } };
const listSchema = z.object({ messages: z.array(z.object({ kind: z.string(), content: z.object({ content: z.unknown() }) })) });

async function userTexts(kernel: TestKernel, sessionId: string): Promise<unknown[]> {
  const { messages } = listSchema.parse(await kernel.exec('kvcoder.message.list', { sessionId, limit: 50 }));
  return messages.filter((message) => message.kind === 'user').map((message) => message.content.content);
}

describe('send receipts (KVC-19, ADR 0048)', { timeout: 30_000 }, () => {
  it('M2.4-E136 a repeated send with its sendId is acknowledged and adds nothing', async () => {
    const { kernel, fake } = await kvcoder.start();
    const fileId = z.object({ id: z.string() }).parse(await kernel.exec('todo.file.write', { name: 'notes.md', base64: Buffer.from('# Notes').toString('base64'), type: 'text/markdown' }, { as: '@test/todo' })).id;
    const sessionId = await newSession(kernel);
    const message = { sessionId, text: 'Fix it', fileIds: [fileId], sendId: 'send-1' };
    fake.reply(says('Done.'));
    expect(await kernel.exec('kvcoder.message.send', message)).toEqual({});
    await kernel.clock.advance(0);
    expect(await kernel.exec('kvcoder.message.send', message)).toEqual({});
    await kernel.clock.advance(0);
    expect(await userTexts(kernel, sessionId)).toEqual(['Fix it\n\nAttached files:\n- attachments/notes.md']);
    expect(fake.requests()).toHaveLength(1);
    expect(readdirSync(path.join(kernel.homeFolder, 'attachments'))).toEqual(['notes.md']);
    expect(Object.keys(sendReceiptDocSchema.shape).sort()).toEqual(['createdAt', 'messageFingerprint', 'sendId', 'sessionId']);
  });

  it('M2.4-E137 a sendId reused for another message or session fails, and a send without one repeats', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const other = await newSession(kernel);
    fake.reply(says('One.'), says('Two.'), says('Three.'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'private first', sendId: 'send-1' });
    await kernel.clock.advance(0);
    const changed = await kernel.exec('kvcoder.message.send', { sessionId, text: 'private second', sendId: 'send-1' }).catch((error: unknown) => error);
    expect(changed).toMatchObject(invalid);
    expect(JSON.stringify(changed)).not.toContain('private');
    await expect(kernel.exec('kvcoder.message.send', { sessionId: other, text: 'private first', sendId: 'send-1' })).rejects.toMatchObject(invalid);
    expect(await userTexts(kernel, sessionId)).toEqual(['private first']);
    expect(await userTexts(kernel, other)).toEqual([]);
    for (const sendId of ['', 'x'.repeat(101)]) await expect(kernel.exec('kvcoder.message.send', { sessionId, text: 'go', sendId })).rejects.toMatchObject(invalid);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await kernel.clock.advance(0);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await kernel.clock.advance(0);
    expect(await userTexts(kernel, sessionId)).toEqual(['private first', 'again', 'again']);
    expect(fake.requests()).toHaveLength(3);
  });

  it('M2.4-E138 two sends at once accept one message, and receipts go with their session', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const kept = await newSession(kernel);
    fake.reply(says('One.'), says('Kept.'), says('Reused.'));
    const message = { sessionId, text: 'Once', sendId: 'send-1' };
    expect(await Promise.all([kernel.exec('kvcoder.message.send', message), kernel.exec('kvcoder.message.send', message)])).toEqual([{}, {}]);
    await kernel.clock.advance(0);
    expect(await userTexts(kernel, sessionId)).toEqual(['Once']);
    await kernel.exec('kvcoder.message.send', { sessionId: kept, text: 'Stay', sendId: 'send-2' });
    await kernel.clock.advance(0);
    await kernel.exec('kvcoder.session.delete', { sessionId });
    const next = await newSession(kernel);
    expect(await kernel.exec('kvcoder.message.send', { sessionId: next, text: 'Other', sendId: 'send-1' })).toEqual({});
    await kernel.clock.advance(0);
    expect(await userTexts(kernel, next)).toEqual(['Other']);
    await expect(kernel.exec('kvcoder.message.send', { sessionId: next, text: 'Other', sendId: 'send-2' })).rejects.toMatchObject(invalid);
  });
});
