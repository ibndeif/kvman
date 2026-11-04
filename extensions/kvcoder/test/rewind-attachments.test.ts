import { mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says } from './support/model-script.ts';
import { seqOf, stored } from './support/rewind.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// Files named again (plan 08 §8.6, ADR 0118, 6): a send names files already saved under `attachments/` without copying
// them, and an edit keeps some of its message's images and files.

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const upload = async (kernel: TestKernel, name: string, type: string, content: string): Promise<string> => z.object({ id: z.string() }).parse(await kernel.exec('todo.file.write', { name, base64: content, type }, { as: '@test/todo' })).id;
const saved = (kernel: TestKernel, name: string, content = 'saved'): void => {
  mkdirSync(path.join(kernel.homeFolder, 'attachments'), { recursive: true });
  writeFileSync(path.join(kernel.homeFolder, 'attachments', name), content);
};
const lastUser = async (kernel: TestKernel, sessionId: string) => (await stored(kernel, sessionId)).filter((message) => message.kind === 'user').at(-1);

describe('files named again (ADR 0118)', { timeout: 60_000 }, () => {
  it('QA77-H18 a send names a saved file after a newly saved one, without copying it', async () => {
    const { kernel, fake } = await kvcoder.start();
    saved(kernel, 'notes.txt');
    const report = await upload(kernel, 'report.txt', 'text/plain', Buffer.from('r').toString('base64'));
    const sessionId = await newSession(kernel);
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Look', fileIds: [report], attachments: ['attachments/notes.txt'] });
    await kernel.clock.advance(0);
    expect((await lastUser(kernel, sessionId))?.content['content']).toBe('Look\n\nAttached files:\n- attachments/report.txt\n- attachments/notes.txt');
    expect(readdirSync(path.join(kernel.homeFolder, 'attachments')).sort()).toEqual(['notes.txt', 'report.txt']);
  });

  it('QA77-H19 an edit keeps one image and one attached file of two', async () => {
    const { kernel, fake } = await kvcoder.start();
    const images = [await upload(kernel, 'one.png', 'image/png', png), await upload(kernel, 'two.png', 'image/png', png)];
    const files = [await upload(kernel, 'a.txt', 'text/plain', 'YQ=='), await upload(kernel, 'b.txt', 'text/plain', 'Yg==')];
    const sessionId = await newSession(kernel);
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Both', fileIds: [...images, ...files] });
    await kernel.clock.advance(0);
    const seq = await seqOf(kernel, sessionId, 'Both\n\nAttached files:\n- attachments/a.txt\n- attachments/b.txt');
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.edit', { sessionId, seq, text: 'One', fileIds: [images[1] ?? ''], attachments: ['attachments/a.txt'], files: true });
    await kernel.clock.advance(0);
    const message = await lastUser(kernel, sessionId);
    expect(message?.content['content']).toBe('One\n\nAttached files:\n- attachments/a.txt');
    expect(message?.fileIds).toEqual([images[1]]);
  });

  it('QA77-E6 a path outside attachments/, one that leaves it, a missing file, and a folder are refused', async () => {
    const { kernel } = await kvcoder.start();
    saved(kernel, 'ok.txt');
    writeFileSync(path.join(kernel.homeFolder, 'secret.txt'), 'secret');
    mkdirSync(path.join(kernel.homeFolder, 'attachments', 'folder'));
    symlinkSync(path.join(kernel.homeFolder, 'secret.txt'), path.join(kernel.homeFolder, 'attachments', 'link.txt'));
    const sessionId = await newSession(kernel);
    for (const name of ['secret.txt', 'attachments/../secret.txt', 'attachments/missing.txt', 'attachments/folder', 'attachments/link.txt']) {
      await expect(kernel.exec('kvcoder.message.send', { sessionId, text: 'x', attachments: [name] })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    }
    expect(await stored(kernel, sessionId)).toEqual([]);
  });
});
