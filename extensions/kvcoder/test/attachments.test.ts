import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { safeName } from '../src/messages/attachments.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { requestMessages, says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const base64 = (text: string): string => Buffer.from(text).toString('base64');

const upload = async (kernel: TestKernel, name: string, type: string, content: string): Promise<string> => z.object({ id: z.string() }).parse(await kernel.exec('todo.file.write', { name, base64: content, type }, { as: '@test/todo' })).id;

const listSchema = z.object({ messages: z.array(z.object({ content: z.object({ content: z.unknown() }), fileIds: z.array(z.string()).nullable().optional() })) });

async function stored(kernel: TestKernel, sessionId: string) {
  return listSchema.parse(await kernel.exec('kvcoder.message.list', { sessionId, limit: 10 })).messages;
}

describe("a message's files that aren't images (08 §8.1, ADR 0018)", { timeout: 30_000 }, () => {
  it("QA25-H1 a file that isn't an image is saved into the workspace and named in the message, and QA25-E4 an extension's file stays its owner's", async () => {
    const { kernel, fake } = await kvcoder.start();
    const fileId = await upload(kernel, 'notes.md', 'text/markdown', base64('# Notes'));
    const sessionId = await newSession(kernel);
    fake.reply(says('Read.'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Fix it', fileIds: [fileId] });
    await kernel.clock.advance(0);
    expect(readFileSync(path.join(kernel.homeFolder, 'attachments', 'notes.md'), 'utf8')).toBe('# Notes');
    const text = 'Fix it\n\nAttached files:\n- attachments/notes.md';
    const [message] = await stored(kernel, sessionId);
    expect(message?.content.content).toBe(text);
    expect(message?.fileIds ?? null).toBeNull();
    expect(requestMessages(fake).find((sent) => sent.role === 'user')?.content).toBe(text);
    expect(await kernel.exec('todo.file.read', { id: fileId }, { as: '@test/todo' })).toEqual({ name: 'notes.md', text: '# Notes' });
  });

  it('QA25-H2 an image goes to the model and another file is saved, in one message', async () => {
    const { kernel, fake } = await kvcoder.start();
    const image = await upload(kernel, 'shot.png', 'image/png', png);
    const report = await upload(kernel, 'report.pdf', 'application/pdf', base64('%PDF'));
    const sessionId = await newSession(kernel);
    fake.reply(says('Seen.'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Look', fileIds: [image, report] });
    await kernel.clock.advance(0);
    expect(readdirSync(path.join(kernel.homeFolder, 'attachments'))).toEqual(['report.pdf']);
    expect((await kernel.exec('kvcoder.message.list', { sessionId, limit: 10 })).messages[0]).toMatchObject({ fileIds: [image] });
    const sent = JSON.stringify(requestMessages(fake).find((message) => message.role === 'user')?.content);
    expect(sent).toContain('image_url');
    expect(sent).toContain('- attachments/report.pdf');
  });

  it("QA25-E1 a name that exists isn't overwritten", async () => {
    const { kernel, fake } = await kvcoder.start();
    mkdirSync(path.join(kernel.homeFolder, 'attachments'));
    writeFileSync(path.join(kernel.homeFolder, 'attachments', 'notes.md'), 'mine');
    const sessionId = await newSession(kernel);
    fake.reply(says('Ok.'));
    const ids = [await upload(kernel, 'notes.md', 'text/markdown', base64('second')), await upload(kernel, 'notes.md', 'text/markdown', base64('third'))];
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'x', fileIds: ids });
    await kernel.clock.advance(0);
    const read = (name: string): string => readFileSync(path.join(kernel.homeFolder, 'attachments', name), 'utf8');
    expect([read('notes.md'), read('notes-2.md'), read('notes-3.md')]).toEqual(['mine', 'second', 'third']);
    expect((await stored(kernel, sessionId))[0]?.content.content).toBe('x\n\nAttached files:\n- attachments/notes-2.md\n- attachments/notes-3.md');
  });

  it('QA25-E2 a name is made safe', async () => {
    expect(['../../etc/pass wd?.txt', 'C:\\\\tmp\\\\a b.txt', '***', '', '..', 'ملف (1).txt'].map(safeName)).toEqual(['pass wd_.txt', 'a b.txt', '___', 'file', 'file', 'ملف (1).txt']);
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(says('Ok.'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'x', fileIds: [await upload(kernel, '../../etc/pass wd?.txt', 'text/plain', base64('p'))] });
    await kernel.clock.advance(0);
    expect(readdirSync(path.join(kernel.homeFolder, 'attachments'))).toEqual(['pass wd_.txt']);
  });

  it("QA25-E3 attachments can't lead outside the workspace folder", async () => {
    const { kernel } = await kvcoder.start();
    const outside = mkdtempSync(path.join(tmpdir(), 'kvcoder-outside-'));
    try {
      symlinkSync(outside, path.join(kernel.homeFolder, 'attachments'));
      const sessionId = await newSession(kernel);
      const fileId = await upload(kernel, 'notes.md', 'text/markdown', base64('# Notes'));
      await expect(kernel.exec('kvcoder.message.send', { sessionId, text: 'x', fileIds: [fileId] })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
      expect(readdirSync(outside)).toEqual([]);
      expect(await stored(kernel, sessionId)).toEqual([]);
      expect(existsSync(path.join(outside, 'notes.md'))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
