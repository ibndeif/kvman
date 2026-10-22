import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';

const kvcoder = useKvcoder();

// A file as fs edit or fs write would leave it (08 §8.6, ADR 0100, 16), for "Open diff" on an approval.
const problem = (code: string) => ({ problem: expect.objectContaining({ code }) as unknown });

describe('the preview of a file change (08 §8.6, ADR 0100, 16)', { timeout: 60_000 }, () => {
  it('M4.5-H2 the preview gives the edited file, or the written content, with its real path, and writes nothing', async () => {
    const { kernel } = await kvcoder.start();
    const folder = kernel.homeFolder;
    writeFileSync(path.join(folder, 'notes.txt'), 'a\nb\n');
    const edited = await kernel.exec('kvcoder.file.preview.get', { path: 'notes.txt', edits: [{ oldText: 'b', newText: 'c' }] });
    expect(edited).toEqual({ path: realpathSync(path.join(folder, 'notes.txt')), after: 'a\nc\n' });
    const written = await kernel.exec('kvcoder.file.preview.get', { path: 'fresh.txt', content: 'new\n' });
    expect(written).toEqual({ path: path.join(realpathSync(folder), 'fresh.txt'), after: 'new\n' });
    expect(readFileSync(path.join(folder, 'notes.txt'), 'utf8')).toBe('a\nb\n');
    expect(existsSync(path.join(folder, 'fresh.txt'))).toBe(false);
  });

  it('M4.5-E1 the preview fails as fs edit would, and writes nothing', async () => {
    const { kernel } = await kvcoder.start();
    const folder = kernel.homeFolder;
    writeFileSync(path.join(folder, 'notes.txt'), 'a\nb\n');
    writeFileSync(path.join(folder, 'binary.bin'), Buffer.from([0xff, 0xfe, 0x00]));
    await expect(kernel.exec('kvcoder.file.preview.get', { path: 'notes.txt', edits: [{ oldText: 'zzz', newText: 'c' }] })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    await expect(kernel.exec('kvcoder.file.preview.get', { path: 'never.txt', edits: [{ oldText: 'a', newText: 'c' }] })).rejects.toMatchObject(problem('NOT_FOUND'));
    await expect(kernel.exec('kvcoder.file.preview.get', { path: '../outside.txt', content: 'x' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    await expect(kernel.exec('kvcoder.file.preview.get', { path: 'binary.bin', edits: [{ oldText: 'a', newText: 'c' }] })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    expect(readFileSync(path.join(folder, 'notes.txt'), 'utf8')).toBe('a\nb\n');
  });
});
