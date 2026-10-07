import { describe, expect, it } from 'vitest';
import { useLooked } from './support/looked.ts';
import { fsCall } from './support/model-script.ts';

const looked = useLooked();

const lines = (count: number): string => Array.from({ length: count }, (_, index) => `line ${index + 1}\n`).join('');
const shown = (from: number, to: number, changed: Record<number, string> = {}): string => Array.from({ length: to - from + 1 }, (_, index) => `${changed[from + index] ?? `line ${from + index}`}\n`).join('');
const json = (text: string | undefined): unknown => JSON.parse(String(text));

describe('fs edit shows what it changed (08 §8.5, ADR 0034, 1)', { timeout: 30_000 }, () => {
  it('QA46-H1 an edit returns the lines around its change, as they now are', async () => {
    const { results } = await looked((folder) => looked.write(folder, 'forty.txt', lines(40)), [fsCall('edit', { path: 'forty.txt', edits: [{ oldText: 'line 20\n', newText: 'twenty\n' }] })]);
    expect(json(results[0])).toEqual({ path: 'forty.txt', replacements: 1, firstChangedLine: 20, fromLine: 17, content: shown(17, 23, { 20: 'twenty' }) });
  });

  it('QA46-E3 the lines start at the file, stop at 80, and count the last change in the edited file', async () => {
    const prepare = (folder: string): void => {
      looked.write(folder, 'top.txt', lines(10));
      looked.write(folder, 'far.txt', lines(300));
      looked.write(folder, 'grown.txt', lines(10));
    };
    const { results } = await looked(prepare, [
      fsCall('edit', { path: 'top.txt', edits: [{ oldText: 'line 1\n', newText: 'first\n' }] }),
      fsCall('edit', { path: 'far.txt', edits: [{ oldText: 'line 10\n', newText: 'ten\n' }, { oldText: 'line 210\n', newText: 'two hundred ten\n' }] }),
      fsCall('edit', { path: 'grown.txt', edits: [{ oldText: 'line 5\n', newText: 'a\nb\nc\n' }] }),
    ]);
    expect(json(results[0])).toMatchObject({ fromLine: 1, content: shown(1, 4, { 1: 'first' }) });
    expect(json(results[1])).toMatchObject({ firstChangedLine: 10, fromLine: 7, content: shown(7, 86, { 10: 'ten' }) });
    expect(json(results[2])).toMatchObject({ firstChangedLine: 5, fromLine: 2, content: 'line 2\nline 3\nline 4\na\nb\nc\nline 6\nline 7\nline 8\n' });
  });
});
