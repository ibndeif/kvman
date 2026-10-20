import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fsCall } from './support/model-script.ts';
import { turnState } from './support/turns.ts';
import { useLooked } from './support/looked.ts';

const looked = useLooked();

const json = (text: string | undefined): unknown => JSON.parse(String(text));
const file = (name: string, content: string | Buffer) => (folder: string) => writeFileSync(path.join(folder, name), content);

describe('fs read (08 §8.5, ADR 0011, 8)', { timeout: 30_000 }, () => {
  it('QA18-H12 read returns the whole file with its line count, or a range of lines, and never asks', async () => {
    const { kernel, sessionId, results, outputs } = await looked(file('five.txt', 'one\ntwo\nthree\nfour\nfive\n'), [fsCall('read', { path: 'five.txt' }), fsCall('read', { path: 'five.txt', fromLine: 2, lines: 2 })], { 'kvcoder.approval': 'ask' });
    expect(json(outputs[0])).toEqual({ path: 'five.txt', fromLine: 1, totalLines: 5, content: 'one\ntwo\nthree\nfour\nfive\n', truncated: false });
    expect(json(outputs[1])).toEqual({ path: 'five.txt', fromLine: 2, totalLines: 5, content: 'two\nthree\n', truncated: true, next: { fromLine: 4 } });
    // QA65-H4: the model reads numbered lines, and the details keep the JSON (ADR 0097, 2).
    expect(results[0]).toBe('five.txt · lines 1–5 of 5\n     1\tone\n     2\ttwo\n     3\tthree\n     4\tfour\n     5\tfive');
    expect(results[1]).toBe('five.txt · lines 2–3 of 5 · read on with fromLine 4\n     2\ttwo\n     3\tthree');
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', pending: [] });
  });

  it('QA18-E17 and QA58-H6 read is bounded by lines and bytes, and refuses what it cannot read', async () => {
    const prepare = (folder: string): void => {
      writeFileSync(path.join(folder, 'long.txt'), Array.from({ length: 3000 }, (_, index) => `line ${String(index + 1)}\n`).join(''));
      writeFileSync(path.join(folder, 'wide.txt'), `${'w'.repeat(20_000)}\n${'x'.repeat(20_000)}\nlast`);
      writeFileSync(path.join(folder, 'huge-line.txt'), 'h'.repeat(40_000));
      writeFileSync(path.join(folder, 'bytes.bin'), Buffer.from([0x89, 0x50, 0xff, 0xfe, 0x00]));
      writeFileSync(path.join(folder, 'bom.txt'), '﻿with a mark\n');
      mkdirSync(path.join(folder, 'folder'));
      symlinkSync('/etc', path.join(folder, 'out'));
    };
    const { results, outputs } = await looked(prepare, [
      fsCall('read', { path: 'long.txt' }),
      fsCall('read', { path: 'long.txt', lines: 2001 }),
      fsCall('read', { path: 'wide.txt' }),
      fsCall('read', { path: 'long.txt', fromLine: 3001 }),
      fsCall('read', { path: 'missing.txt' }),
      fsCall('read', { path: 'folder' }),
      fsCall('read', { path: 'bytes.bin' }),
      fsCall('read', { path: '../outside.txt' }),
      fsCall('read', { path: 'out/hostname' }),
      fsCall('read', { path: 'huge-line.txt' }),
      fsCall('read', { path: 'bom.txt' }),
    ]);
    const long = json(outputs[0]) as { totalLines: number; content: string };
    expect(long.totalLines).toBe(3000);
    expect(long.content.split('\n')).toHaveLength(2001);
    expect(long.content.endsWith('line 2000\n')).toBe(true);
    // QA58-H6: a larger number of lines is cut to 2000 (ADR 0090, 4).
    expect((json(outputs[1]) as { content: string }).content.split('\n')).toHaveLength(2001);
    expect(json(outputs[2])).toEqual({ path: 'wide.txt', fromLine: 1, totalLines: 3, content: `${'w'.repeat(20_000)}\n`, truncated: true, next: { fromLine: 2 } });
    expect(json(outputs[3])).toEqual({ path: 'long.txt', fromLine: 3001, totalLines: 3000, content: '', truncated: false });
    expect(results[4]).toBe("error NOT_FOUND: missing.txt doesn't exist.");
    expect(results[5]).toMatch(/^error VALIDATION_FAILED: folder is a folder/);
    expect(results[6]).toBe("error VALIDATION_FAILED: bytes.bin isn't valid UTF-8 text, so it isn't read.");
    expect(results[7]).toBe('error VALIDATION_FAILED: ../outside.txt is outside the workspace folder.');
    expect(results[8]).toBe('error VALIDATION_FAILED: out/hostname is outside the workspace folder.');
    expect(json(outputs[9])).toEqual({ path: 'huge-line.txt', fromLine: 1, totalLines: 1, content: 'h'.repeat(30 * 1024), truncated: true, next: { fromLine: 1, fromColumn: 30 * 1024 + 1 } });
    expect(json(outputs[10])).toMatchObject({ content: 'with a mark\n' });
  });
});
