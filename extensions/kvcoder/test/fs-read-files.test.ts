import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from '@kvman/sdk';
import type { FakeReply } from '@kvman/testkit/fake-openai';
import { describe, expect, it } from 'vitest';
import { fsCommands } from '../src/connectors/fs.ts';
import { readOnlyAllows } from '../src/turns/read-only.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { fsCall, runs, says, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { useLooked } from './support/looked.ts';

const looked = useLooked();
const kvcoder = useKvcoder();

const unchanged = (file: string): string => `${file} is unchanged since you read these lines earlier in this conversation; that result is above.`;
// A result whose output is its text keeps no copy of it (ADR 0034, 7).
const storedOutput = z.object({ details: z.object({ output: z.string().optional() }) });

// A chat in a workspace with `entries`, whose model answers one message with `replies`, a step each.
async function chat(entries: Record<string, string>, replies: readonly FakeReply[]) {
  const { kernel, fake } = await kvcoder.start();
  files(entries)(kernel.homeFolder);
  const sessionId = await newSession(kernel);
  fake.reply(...replies);
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  const outputs = async (): Promise<string[]> => (await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 })).messages.filter((message) => message.kind === 'toolResult').map((message) => storedOutput.parse(message.content).details.output ?? '');
  return { kernel, fake, outputs };
}

const json = (text: string | undefined): unknown => JSON.parse(String(text));
const files = (entries: Record<string, string | Buffer>) => (folder: string): void => {
  for (const [name, content] of Object.entries(entries)) writeFileSync(path.join(folder, name), content);
};
const readFiles = (...paths: readonly (string | Record<string, unknown>)[]) => fsCall('read-files', { files: paths.map((entry) => (typeof entry === 'string' ? { path: entry } : entry)) });

describe('fs read-files (08 §8.5, ADR 0097, 1)', { timeout: 30_000 }, () => {
  it('QA65-H2 two files in one call, each under its header as numbered lines, and the JSON in the details', async () => {
    const { kernel, sessionId, results, outputs } = await looked(files({ 'a.txt': 'one\ntwo\n', 'b.txt': 'three\n' }), [readFiles('a.txt', { path: 'b.txt', fromLine: 1, lines: 5 })], { 'kvcoder.approval': 'ask' });
    expect(results[0]).toBe('a.txt · lines 1–2 of 2\n     1\tone\n     2\ttwo\n\nb.txt · line 1 of 1\n     1\tthree');
    expect(json(outputs[0])).toEqual({ files: [{ path: 'a.txt', fromLine: 1, totalLines: 2, content: 'one\ntwo\n', truncated: false }, { path: 'b.txt', fromLine: 1, totalLines: 1, content: 'three\n', truncated: false }] });
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', pending: [] });
  });

  it('QA65-H3 a file read-files read can be edited', async () => {
    const { kernel } = await chat({ 'a.txt': 'one\n' }, [runs(readFiles('a.txt')), runs(fsCall('edit', { path: 'a.txt', edits: [{ oldText: 'one', newText: '1' }] })), says('ok')]);
    expect(readFileSync(path.join(kernel.homeFolder, 'a.txt'), 'utf8')).toBe('1\n');
  });

  it('QA65-E1 three files of 20 KB share the 30 KB: whole, cut with where to read on, and not read', async () => {
    const twenty = `${'x'.repeat(1023)}\n`.repeat(20);
    const { results, outputs } = await looked(files({ 'a.txt': twenty, 'b.txt': twenty, 'c.txt': twenty }), [readFiles('a.txt', 'b.txt', 'c.txt')]);
    const [first, second, third] = String(results[0]).split('\n\n');
    expect(first).toMatch(/^a.txt · lines 1–20 of 20\n/);
    expect(second).toMatch(/^b.txt · lines 1–10 of 20 · read on with fromLine 11\n/);
    expect(third).toBe("c.txt · not read: the files before it used this call's 30 KB; read it in another call");
    expect((json(outputs[0]) as { files: unknown[] }).files[2]).toEqual({ path: 'c.txt', notRead: true });
  });

  it("QA65-E2 a missing file, a folder, a path outside, and bytes that aren't UTF-8 each say why, and the others are read", async () => {
    const prepare = (folder: string): void => {
      files({ 'ok.txt': 'fine\n', 'bytes.bin': Buffer.from([0x89, 0xff, 0xfe]) })(folder);
      mkdirSync(path.join(folder, 'folder'));
    };
    const { results } = await looked(prepare, [readFiles('missing.txt', 'folder', '../outside.txt', 'bytes.bin', 'ok.txt')]);
    expect(String(results[0]).split('\n\n')).toEqual([
      "missing.txt · error NOT_FOUND: missing.txt doesn't exist.",
      expect.stringMatching(/^folder · error VALIDATION_FAILED: folder is a folder/),
      '../outside.txt · error VALIDATION_FAILED: ../outside.txt is outside the workspace folder.',
      "bytes.bin · error VALIDATION_FAILED: bytes.bin isn't valid UTF-8 text, so it isn't read.",
      'ok.txt · line 1 of 1\n     1\tfine',
    ]);
  });

  it('QA65-E3 lines the chat already holds read as unchanged, both ways between read and read-files', async () => {
    const { fake, outputs } = await chat({ 'a.txt': 'one\n', 'b.txt': 'two\n' }, [runs(fsCall('read', { path: 'a.txt' })), runs(readFiles('a.txt', 'b.txt')), runs(fsCall('read', { path: 'b.txt' })), says('ok')]);
    const results = toolResults(fake);
    expect(String(results[1]).split('\n\n')).toEqual([unchanged('a.txt'), 'b.txt · line 1 of 1\n     1\ttwo']);
    expect((json((await outputs())[1]) as { files: unknown[] }).files[0]).toEqual({ path: 'a.txt', unchanged: true });
    expect(results[2]).toBe(unchanged('b.txt'));
  });

  it('QA65-E4 no file, 11 files, and an empty path fail the call with its signature', async () => {
    const eleven = Array.from({ length: 11 }, (_, index) => `f${String(index)}.txt`);
    const { results } = await looked(files({}), [fsCall('read-files', { files: [] }), readFiles(...eleven), readFiles('')]);
    for (const result of results) expect(result).toMatch(/^error VALIDATION_FAILED: .*The payload of fs read-files is\n\{ files: \[\{ path, fromLine\?, lines\? \}\] \}\n\n\S+ \S+: .*$/s);
  });

  it('QA65-E5 a read-only helper may run it, it never asks, and the index lists it after read', async () => {
    expect(readOnlyAllows('read-files', fsCommands['read-files'])).toBe(true);
    expect(fsCommands['read-files'].asks).toBe(false);
    const { fake } = await looked(files({}), [fsCall('list')]);
    expect(systemPrompt(fake, 0)).toContain('  read       { path, fromLine?, fromColumn?, lines? }\n  read-files { files: [{ path, fromLine?, lines? }] }\n');
  });
});
