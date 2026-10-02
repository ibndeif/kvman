import { mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { calls, fsCommand, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// The model's `fs` calls through a real turn, on the real file system in the workspace folder (08 §8.5).
async function run(commands: readonly string[]): Promise<{ results: string[]; folder: string }> {
  const { kernel, fake } = await kvcoder.start();
  const sessionId = await newSession(kernel);
  fake.reply(calls(...commands), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return { results: toolResults(fake), folder: kernel.homeFolder };
}

// Runs the commands in a workspace that `prepare` filled first.
async function runWith(prepare: (folder: string) => void, commands: readonly string[]): Promise<{ results: string[]; folder: string }> {
  const { kernel, fake } = await kvcoder.start();
  prepare(kernel.homeFolder);
  const sessionId = await newSession(kernel);
  fake.reply(calls(...commands), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return { results: toolResults(fake), folder: kernel.homeFolder };
}

const json = (text: string | undefined): unknown => JSON.parse(String(text).replace(/\n\[exit code \d+\]$/, ''));
const read = (folder: string, file: string): string => readFileSync(path.join(folder, file), 'utf8');

describe('the fs connector (08 §8.5, ADR 0009, 157 to 160)', { timeout: 30_000 }, () => {
  it('QA4-H1 write creates the file and its parent folders', async () => {
    const { results, folder } = await run([fsCommand('write', { path: 'notes/todo.md', content: '- one\n' })]);
    expect(json(results[0])).toEqual({ path: 'notes/todo.md', created: true, bytes: 6 });
    expect(results[0]).toMatch(/\n\[exit code 0\]$/);
    expect(read(folder, 'notes/todo.md')).toBe('- one\n');
  });

  it('QA4-H2 write replaces a file and counts the bytes of non-ASCII text', async () => {
    const { results, folder } = await runWith((home) => writeFileSync(path.join(home, 'a.txt'), 'old content that is longer'), [fsCommand('write', { path: 'a.txt', content: 'جديد' })]);
    expect(json(results[0])).toEqual({ path: 'a.txt', created: false, bytes: 8 });
    expect(read(folder, 'a.txt')).toBe('جديد');
  });

  it('QA4-H3 edit changes only the named text', async () => {
    const { results, folder } = await runWith((home) => writeFileSync(path.join(home, 'list.txt'), 'one\ntwo\nthree\nfour\nfive\n'), [fsCommand('edit', { path: 'list.txt', edits: [{ oldText: 'three', newText: '3' }] })]);
    expect(json(results[0])).toEqual({ path: 'list.txt', replacements: 1, firstChangedLine: 3 });
    expect(read(folder, 'list.txt')).toBe('one\ntwo\n3\nfour\nfive\n');
  });

  it('QA4-H5 a CRLF file with a BOM stays CRLF with its BOM after an edit', async () => {
    const { folder } = await runWith((home) => writeFileSync(path.join(home, 'win.txt'), '﻿one\r\ntwo\r\n'), [fsCommand('edit', { path: 'win.txt', edits: [{ oldText: 'one\ntwo', newText: 'one\n2' }] })]);
    expect(read(folder, 'win.txt')).toBe('﻿one\r\n2\r\n');
  });

  it('QA4-H7 fs -h lists write and edit', async () => {
    const { results } = await run(['fs -h']);
    expect(results[0]).toMatch(/^fs: Create, replace, or edit a file inside the workspace folder\.\n\nCommands:\n {2}write {2}.*\n {2}edit {3}/);
  });

  it('QA4-H12 two edits of one file in one reply both land', async () => {
    const { results, folder } = await runWith((home) => writeFileSync(path.join(home, 'two.txt'), 'one\ntwo\nthree\n'), [
      fsCommand('edit', { path: 'two.txt', edits: [{ oldText: 'one', newText: '1' }] }),
      fsCommand('edit', { path: './two.txt', edits: [{ oldText: 'three', newText: '3' }] }),
      fsCommand('edit', { path: 'two.txt', edits: [{ oldText: 'two', newText: '2' }] }),
    ]);
    expect(results.map((result) => result.endsWith('[exit code 0]'))).toEqual([true, true, true]);
    expect(read(folder, 'two.txt')).toBe('1\n2\n3\n');
  });

  it('QA4-E1 a path outside the workspace writes nothing and says so', async () => {
    const { results, folder } = await run([fsCommand('write', { path: '../outside.txt', content: 'x' }), fsCommand('write', { path: '/tmp/kvcoder-never.txt', content: 'x' })]);
    expect(results[0]).toBe('error VALIDATION_FAILED: ../outside.txt is outside the workspace folder.\n[exit code 1]');
    expect(results[1]).toBe('error VALIDATION_FAILED: /tmp/kvcoder-never.txt is outside the workspace folder.\n[exit code 1]');
    expect(() => statSync(path.join(folder, '..', 'outside.txt'))).toThrow();
    expect(() => statSync('/tmp/kvcoder-never.txt')).toThrow();
  });

  it('QA4-E2 a symlink out of the workspace is refused through a turn too', async () => {
    const { results } = await runWith((home) => symlinkSync('/tmp', path.join(home, 'link')), [fsCommand('write', { path: 'link/kvcoder-never.txt', content: 'x' })]);
    expect(results[0]).toBe('error VALIDATION_FAILED: link/kvcoder-never.txt is outside the workspace folder.\n[exit code 1]');
    expect(() => statSync('/tmp/kvcoder-never.txt')).toThrow();
  });

  it('QA4-E4 editing a missing file fails NOT_FOUND', async () => {
    const { results } = await run([fsCommand('edit', { path: 'missing.txt', edits: [{ oldText: 'a', newText: 'b' }] })]);
    expect(results[0]).toBe("error NOT_FOUND: missing.txt doesn't exist.\n[exit code 1]");
  });

  it('QA4-E5 a failed edit among several writes nothing, and the error names it', async () => {
    const { results, folder } = await runWith((home) => writeFileSync(path.join(home, 'keep.txt'), 'alpha beta\n'), [
      fsCommand('edit', { path: 'keep.txt', edits: [{ oldText: 'alpha', newText: 'A' }, { oldText: 'gamma', newText: 'G' }] }),
    ]);
    expect(results[0]).toMatch(/^error VALIDATION_FAILED: edits\[1\] was not found; .*\n\[exit code 1\]$/);
    expect(read(folder, 'keep.txt')).toBe('alpha beta\n');
  });

  it('QA4-E9 an edit that changes nothing leaves the file alone', async () => {
    const { results, folder } = await runWith((home) => writeFileSync(path.join(home, 'same.txt'), 'same\n'), [fsCommand('edit', { path: 'same.txt', edits: [{ oldText: 'same', newText: 'same' }] })]);
    expect(results[0]).toBe('error VALIDATION_FAILED: The edits change nothing in the file.\n[exit code 1]');
    expect(read(folder, 'same.txt')).toBe('same\n');
  });

  it('QA4-E10 bad input is an error result naming the problem', async () => {
    const { results } = await run([
      'fs nope',
      "fs write '{\"content\":\"x\"}'",
      fsCommand('edit', { path: 'a.txt', edits: [] }),
      fsCommand('write', { path: 'a.txt', content: 'x', mode: 'append' }),
      "fs write '{nope'",
      'fs',
    ]);
    expect(results[0]).toBe('error NOT_FOUND: fs has no command nope; run `fs -h`.\n[exit code 1]');
    expect(results[1]).toMatch(/^error VALIDATION_FAILED: path: .*\n\[exit code 1\]$/);
    expect(results[2]).toMatch(/^error VALIDATION_FAILED: edits: .*\n\[exit code 1\]$/);
    expect(results[3]).toMatch(/^error VALIDATION_FAILED: input: .*mode.*\n\[exit code 1\]$/);
    expect(results[4]).toMatch(/^error VALIDATION_FAILED: The input isn't JSON/);
    expect(results[5]).toMatch(/^error VALIDATION_FAILED: Name a command/);
  });

  it('QA4-E11 a file that is not UTF-8 text is not edited', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00]);
    const { results, folder } = await runWith((home) => writeFileSync(path.join(home, 'logo.png'), bytes), [fsCommand('edit', { path: 'logo.png', edits: [{ oldText: 'PNG', newText: 'JPG' }] })]);
    expect(results[0]).toBe("error VALIDATION_FAILED: logo.png isn't valid UTF-8 text, so it isn't edited.\n[exit code 1]");
    expect(readFileSync(path.join(folder, 'logo.png'))).toEqual(bytes);
  });

  it('QA4-E12 writing onto a folder, or below a file, is an error result', async () => {
    const { results } = await runWith(
      (home) => {
        mkdirSync(path.join(home, 'folder'));
        writeFileSync(path.join(home, 'plain.txt'), 'x');
      },
      [fsCommand('write', { path: 'folder', content: 'x' }), fsCommand('write', { path: 'plain.txt/inner.txt', content: 'x' })],
    );
    expect(results[0]).toBe('error VALIDATION_FAILED: folder is a folder.\n[exit code 1]');
    expect(results[1]).toMatch(/^error VALIDATION_FAILED: ENOTDIR: .*\n\[exit code 1\]$/);
  });
});
