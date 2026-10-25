import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useLooked } from './support/looked.ts';
import { fsCall } from './support/model-script.ts';

const looked = useLooked();

const json = (text: string | undefined): unknown => JSON.parse(String(text));
const numbered = (count: number, hits: Record<number, string> = {}): string => Array.from({ length: count }, (_line, index) => hits[index + 1] ?? `line ${index + 1}`).join('\n') + '\n';

function write(folder: string, name: string, content: string): void {
  mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
  writeFileSync(path.join(folder, name), content);
}

describe('fs search context and filesOnly (08 §8.5, ADR 0090, 3)', { timeout: 30_000 }, () => {
  it('QA58-H4 context adds the lines around each match once, in order, marked context', async () => {
    const { results } = await looked((folder) => write(folder, 'a.txt', numbered(12, { 5: 'hit five', 7: 'hit seven' })), [fsCall('search', { pattern: 'hit', path: 'a.txt', context: 2 })]);
    const lines = (json(results[0]) as { files: { matches: { line: number; context?: true }[] }[] }).files[0]?.matches;
    expect(lines?.map((line) => line.line)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(lines?.filter((line) => line.context !== true).map((line) => line.line)).toEqual([5, 7]);
    expect(lines?.find((line) => line.line === 6)).toEqual({ line: 6, text: 'line 6', context: true });
  });

  it('QA58-H5 filesOnly gives each file and its count of matching lines, in path order', async () => {
    const prepare = (folder: string): void => {
      write(folder, 'b.ts', 'hit\nhit\n');
      write(folder, 'a.ts', 'hit\nmiss\n');
      write(folder, 'c.ts', 'miss\n');
    };
    const { results } = await looked(prepare, [fsCall('search', { pattern: 'hit', filesOnly: true })]);
    expect(json(results[0])).toEqual({ files: [{ path: 'a.ts', count: 1 }, { path: 'b.ts', count: 2 }], truncated: false });
  });

  it("QA58-E9 context stops at a file's edges, is cut to 10, cuts long lines, and only matches count toward 200", async () => {
    const prepare = (folder: string): void => {
      write(folder, 'edges.txt', numbered(4, { 1: 'hit first', 4: 'hit last' }));
      write(folder, 'wide.txt', `${'w'.repeat(800)}\nhit\n`);
      write(folder, 'far.txt', numbered(40, { 20: 'hit' }));
      write(folder, 'many.txt', 'hit\n'.repeat(201));
    };
    const { results } = await looked(prepare, [
      fsCall('search', { pattern: 'hit', path: 'edges.txt', context: 3 }),
      fsCall('search', { pattern: 'hit', path: 'wide.txt', context: 1 }),
      fsCall('search', { pattern: 'hit', path: 'far.txt', context: 50 }),
      fsCall('search', { pattern: 'hit', path: 'many.txt', context: 1 }),
    ]);
    const lines = (index: number) => (json(results[index]) as { files: { matches: { line: number; text: string; context?: true }[] }[]; truncated: boolean });
    expect(lines(0).files[0]?.matches.map((line) => line.line)).toEqual([1, 2, 3, 4]);
    expect(lines(1).files[0]?.matches[0]).toEqual({ line: 1, text: 'w'.repeat(500), context: true });
    expect(lines(2).files[0]?.matches.map((line) => line.line)).toEqual(Array.from({ length: 21 }, (_line, index) => index + 10));
    const many = lines(3);
    expect(many.files[0]?.matches.filter((line) => line.context !== true)).toHaveLength(200);
    expect(many.truncated).toBe(true);
  });

  // Superseded by QA67-H23: filesOnly ignores context (ADR 0102, 13).
  it('QA58-E10 QA67-H23 filesOnly with context gives the counts', async () => {
    const { results } = await looked((folder) => write(folder, 'a.txt', 'hit\n'), [fsCall('search', { pattern: 'hit', context: 2, filesOnly: true })]);
    expect(json(results[0])).toEqual({ files: [{ path: 'a.txt', count: 1 }], truncated: false });
  });

  it('QA58-E11 filesOnly stops at 200 files', async () => {
    const prepare = (folder: string): void => {
      for (let index = 0; index < 201; index += 1) write(folder, `f/${String(index).padStart(3, '0')}.txt`, 'hit\n');
    };
    const { results } = await looked(prepare, [fsCall('search', { pattern: 'hit', filesOnly: true })]);
    const found = json(results[0]) as { files: unknown[]; truncated: boolean; reason?: string };
    expect(found.files).toHaveLength(200);
    expect(found).toMatchObject({ truncated: true, reason: 'matches' });
  });
});
