import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, runs, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const inHome = (kernel: TestKernel, file: string) => path.join(kernel.homeFolder, file);
const undo = (file: string) => command('fs', 'undo', { path: file, risky: false });
const edit = (file: string, oldText: string, newText: string) => fsCall('edit', { path: file, edits: [{ oldText, newText }] });
const write = (file: string, content: string) => fsCall('write', { path: file, content });
async function send(kernel: TestKernel, sessionId: string, text = 'go'): Promise<void> {
  await kernel.exec('kvcoder.message.send', { sessionId, text });
  await kernel.clock.advance(0);
}

describe("a chat takes back its own change (KVC-13, ADR 0053)", { timeout: 60_000 }, () => {
  it('M2.4-E160 undo restores the previous content, goes one change back each time, and removes a file it created', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    writeFileSync(inHome(kernel, 'a.txt'), 'zero');
    fake.reply(runs(fsCall('read', { path: 'a.txt' })), runs(edit('a.txt', 'zero', 'one'), edit('a.txt', 'one', 'two'), write('new.txt', 'made')), runs(undo('a.txt')), runs(undo('a.txt'), undo('new.txt')), runs(undo('a.txt')), says('done'));
    await send(kernel, sessionId);
    expect(JSON.parse(String(toolResults(fake, 3).at(-1)))).toEqual({ path: 'a.txt', removed: false, bytes: 3 });
    expect(JSON.parse(String(toolResults(fake, 4).at(-1)))).toEqual({ path: 'new.txt', removed: true, bytes: 0 });
    expect(toolResults(fake, 5).at(-1)).toMatch(/^error NOT_FOUND: This chat has no change of a\.txt to undo\./);
    expect(readFileSync(inHome(kernel, 'a.txt'), 'utf8')).toBe('zero');
    expect(existsSync(inHome(kernel, 'new.txt'))).toBe(false);
  });

  it('M2.4-E160 undo changes nothing when the file changed since', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(write('a.txt', 'mine')), says('written'));
    await send(kernel, sessionId);
    writeFileSync(inHome(kernel, 'a.txt'), 'the person changed it');
    fake.reply(runs(undo('a.txt')), says('done'));
    await send(kernel, sessionId, 'undo');
    expect(toolResults(fake, 3).at(-1)).toMatch(/^error VALIDATION_FAILED: a\.txt changed since that change, so it isn't undone\./);
    expect(readFileSync(inHome(kernel, 'a.txt'), 'utf8')).toBe('the person changed it');
  });

  it('M2.4-E161 a chat keeps its newest 20 copies', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const versions = Array.from({ length: 22 }, (_, index) => `v${index}`);
    fake.reply(runs(...versions.map((content) => write('a.txt', content))), runs(...Array.from({ length: 21 }, () => undo('a.txt'))), says('done'));
    await send(kernel, sessionId);
    const undone = toolResults(fake, 2).slice(-21);
    expect(undone.slice(0, 20).every((result) => result.includes('"removed":false'))).toBe(true);
    expect(undone[20]).toMatch(/^error NOT_FOUND:/);
    expect(readFileSync(inHome(kernel, 'a.txt'), 'utf8')).toBe('v1');
  });

  it('M2.4-E161 a previous content over 1 MB saves no copy, and the change still happens', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    writeFileSync(inHome(kernel, 'big.txt'), 'x'.repeat(1024 * 1024 + 1));
    fake.reply(runs(fsCall('read', { path: 'big.txt' })), runs(write('big.txt', 'small')), runs(undo('big.txt')), says('done'));
    await send(kernel, sessionId);
    expect(readFileSync(inHome(kernel, 'big.txt'), 'utf8')).toBe('small');
    expect(toolResults(fake).at(-1)).toMatch(/^error NOT_FOUND: This chat has no change of big\.txt to undo\./);
  });
});
