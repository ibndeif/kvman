import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fingerprintOf } from '../../src/files/file-change.ts';
import { readLines, type FileRead } from '../../src/files/read-file.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
function workspace(files: Record<string, string>): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'kvcoder-read-on-'));
  folders.push(folder);
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(folder, name), content);
  return folder;
}

describe('reading on from where a read was cut (KVC-29, ADR 0055)', () => {
  it('M2.4-E166 one very long line is read in pieces that end on whole characters and join back', async () => {
    const line = 'مرحبا 🙂 hello '.repeat(12_000);
    const folder = workspace({ 'long.txt': `${line}\nlast\n` });
    const pieces: FileRead[] = [];
    for (let next: FileRead['next'] = { fromLine: 1 }; next !== undefined; next = pieces.at(-1)?.next) pieces.push(await readLines(folder, { path: 'long.txt', ...next }));
    expect(pieces.length).toBeGreaterThan(3);
    expect(pieces.map((piece) => piece.content).join('')).toBe(`${line}\nlast\n`);
    for (const piece of pieces) expect(Buffer.byteLength(piece.content)).toBeLessThanOrEqual(30 * 1024);
    expect(pieces.slice(0, -1).every((piece) => piece.truncated)).toBe(true);
    expect(pieces.at(-1)).toMatchObject({ truncated: false });
    expect(pieces.at(-1)).not.toHaveProperty('next');
    expect(pieces[0]?.next).toEqual({ fromLine: 1, fromColumn: expect.any(Number) as unknown });
  });

  it('M2.4-E166 a file of many lines stops at a whole line and names the next, and a read that fits is not truncated', async () => {
    const folder = workspace({ 'many.txt': Array.from({ length: 5000 }, (_, index) => `line ${index + 1}\n`).join(''), 'small.txt': 'one\ntwo\n' });
    expect(await readLines(folder, { path: 'small.txt' })).toEqual({ path: 'small.txt', fromLine: 1, totalLines: 2, content: 'one\ntwo\n', truncated: false });
    const first = await readLines(folder, { path: 'many.txt' });
    expect(first).toMatchObject({ fromLine: 1, totalLines: 5000, truncated: true, next: { fromLine: 2001 } });
    expect(first.content.endsWith('line 2000\n')).toBe(true);
    expect(await readLines(folder, { path: 'many.txt', fromLine: 4999 })).toEqual({ path: 'many.txt', fromLine: 4999, totalLines: 5000, content: 'line 4999\nline 5000\n', truncated: false });
    expect(await readLines(folder, { path: 'small.txt', fromLine: 1, lines: 1 })).toEqual({ path: 'small.txt', fromLine: 1, totalLines: 2, content: 'one\n', truncated: true, next: { fromLine: 2 } });
  });

  it('M2.4-E167 reading on inside a line fails when the file is no longer what the chat saw', async () => {
    const folder = workspace({ 'a.txt': 'abcdef\n' });
    const seen = fingerprintOf(Buffer.from('abcdef\n'));
    expect(await readLines(folder, { path: 'a.txt', fromLine: 1, fromColumn: 4 }, async () => seen)).toMatchObject({ content: 'def\n', truncated: false });
    expect(await readLines(folder, { path: 'a.txt', fromLine: 1, fromColumn: 4 }, async () => undefined)).toMatchObject({ content: 'def\n' });
    writeFileSync(path.join(folder, 'a.txt'), 'changed\n');
    await expect(readLines(folder, { path: 'a.txt', fromLine: 1, fromColumn: 4 }, async () => seen)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', message: 'a.txt changed since you started reading it. Read it again from its start.' } });
    expect(await readLines(folder, { path: 'a.txt' }, async () => seen)).toMatchObject({ content: 'changed\n' });
  });
});
