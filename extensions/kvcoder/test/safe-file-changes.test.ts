import { chmodSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { fsCall, runs, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const inHome = (kernel: TestKernel, file: string) => path.join(kernel.homeFolder, file);
const read = (file: string) => fsCall('read', { path: file });
const edit = (file: string, oldText: string, newText: string) => fsCall('edit', { path: file, edits: [{ oldText, newText }] });
const write = (file: string, content: string) => fsCall('write', { path: file, content });
async function send(kernel: TestKernel, sessionId: string, text = 'go'): Promise<void> {
  await kernel.exec('kvcoder.message.send', { sessionId, text });
  await kernel.clock.advance(0);
}

describe('a chat changes a file only as it last saw it (KVC-12 and KVC-13, ADR 0053)', { timeout: 30_000 }, () => {
  it('M2.4-E156 an existing file is read before it is changed, and a new file needs no read', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    writeFileSync(inHome(kernel, 'a.txt'), 'old');
    fake.reply(runs(write('a.txt', 'new'), edit('a.txt', 'old', 'new'), write('fresh.txt', 'x')), runs(read('a.txt')), runs(edit('a.txt', 'old', 'new')), says('done'));
    await send(kernel, sessionId);
    const refused = toolResults(fake, 1);
    expect(refused[0]).toMatch(/^error VALIDATION_FAILED: a\.txt exists and this chat hasn't read it\. Read it first/);
    expect(refused[1]).toMatch(/^error VALIDATION_FAILED: a\.txt exists and this chat hasn't read it/);
    expect(JSON.parse(String(refused[2]))).toEqual({ path: 'fresh.txt', created: true, bytes: 1 });
    expect(toolResults(fake).at(-1)).toContain('"replacements":1');
    expect(readFileSync(inHome(kernel, 'a.txt'), 'utf8')).toBe('new');
  });

  it('M2.4-E157 a file changed outside kvman since the chat read it is not overwritten', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    writeFileSync(inHome(kernel, 'a.txt'), 'one two');
    fake.reply(runs(read('a.txt')), says('read'));
    await send(kernel, sessionId);
    writeFileSync(inHome(kernel, 'a.txt'), 'one two, and the person’s line');
    fake.reply(runs(write('a.txt', 'rewritten'), edit('a.txt', 'one', '1')), runs(read('a.txt')), runs(edit('a.txt', 'one', '1')), says('done'));
    await send(kernel, sessionId, 'again');
    for (const result of toolResults(fake, 3).slice(-2)) expect(result).toMatch(/^error VALIDATION_FAILED: a\.txt changed since this chat read it\. Read it again/);
    expect(readFileSync(inHome(kernel, 'a.txt'), 'utf8')).toBe('1 two, and the person’s line');
  });

  it('M2.4-E158 two chats editing one file at once: one wins whole, the other is told, and a link is the same file', async () => {
    const { kernel, fake } = await kvcoder.start();
    const [first, second] = [await newSession(kernel), await newSession(kernel)];
    writeFileSync(inHome(kernel, 'a.txt'), 'alpha\nbeta\n');
    symlinkSync(inHome(kernel, 'a.txt'), inHome(kernel, 'link.txt'));
    fake.reply(runs(read('link.txt')), says('read'), runs(read('a.txt')), says('read'));
    await send(kernel, first);
    await send(kernel, second);
    fake.reply(runs(edit('a.txt', 'alpha', 'ALPHA')), runs(edit('a.txt', 'beta', 'BETA')), says('done'), says('done'));
    await Promise.all([kernel.exec('kvcoder.message.send', { sessionId: first, text: 'edit' }), kernel.exec('kvcoder.message.send', { sessionId: second, text: 'edit' })]);
    await kernel.clock.advance(0);
    const results = [toolResults(fake, 6).at(-1), toolResults(fake, 7).at(-1)].map(String);
    expect(results.filter((result) => result.includes('"replacements":1'))).toHaveLength(1);
    expect(results.filter((result) => /^error VALIDATION_FAILED: a\.txt changed since this chat read it/.test(result))).toHaveLength(1);
    expect(['ALPHA\nbeta\n', 'alpha\nBETA\n']).toContain(readFileSync(inHome(kernel, 'a.txt'), 'utf8'));
  });

  it('M2.4-E159 a change keeps the permission bits and leaves no file beside it', async () => {
    if (process.platform === 'win32') throw new Error('Permission bits are checked on Linux and macOS.');
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    writeFileSync(inHome(kernel, 'run.sh'), 'echo one\n');
    chmodSync(inHome(kernel, 'run.sh'), 0o750);
    fake.reply(runs(read('run.sh')), runs(edit('run.sh', 'one', 'two')), runs(write('run.sh', 'echo three\n')), says('done'));
    await send(kernel, sessionId);
    expect(readFileSync(inHome(kernel, 'run.sh'), 'utf8')).toBe('echo three\n');
    expect(statSync(inHome(kernel, 'run.sh')).mode & 0o777).toBe(0o750);
    expect(readdirSync(kernel.homeFolder).filter((name) => name.includes('kvman-tmp'))).toEqual([]);
  });
});
