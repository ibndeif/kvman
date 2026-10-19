import { execFileSync } from 'node:child_process';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useLooked } from './support/looked.ts';
import { command } from './support/model-script.ts';

const looked = useLooked();

const json = (text: string | undefined): unknown => JSON.parse(String(text));
const find = (payload: Record<string, unknown>) => command('fs', 'find', payload);

// A file whose modification time is `minutes` after a fixed moment, so the newest-first order is known.
function write(folder: string, name: string, minutes = 0): void {
  const file = path.join(folder, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, 'x\n');
  const at = new Date(Date.UTC(2026, 9, 19, 12, minutes));
  utimesSync(file, at, at);
}

describe('fs find (08 §8.5, ADR 0090, 2)', { timeout: 30_000 }, () => {
  it('QA58-H3 lists the files whose name or path matches, newest first, relative to the workspace folder', async () => {
    const prepare = (folder: string): void => {
      write(folder, 'src/a.ts', 1);
      write(folder, 'src/deep/b.ts', 5);
      write(folder, 'docs/c.md', 9);
      write(folder, 'src/same-1.ts', 3);
      write(folder, 'src/same-0.ts', 3);
    };
    const { results } = await looked(prepare, [find({ pattern: '*.ts' }), find({ pattern: 'src/**/*.ts' }), find({ pattern: 'deep/*.ts', path: 'src' }), find({ pattern: 'deep/*.ts' })]);
    const all = ['src/deep/b.ts', 'src/same-0.ts', 'src/same-1.ts', 'src/a.ts'];
    expect(json(results[0])).toEqual({ paths: all, truncated: false });
    expect(json(results[1])).toEqual({ paths: all, truncated: false });
    expect(json(results[2])).toEqual({ paths: ['src/deep/b.ts'], truncated: false });
    expect(json(results[3])).toEqual({ paths: [], truncated: false });
  });

  it('QA58-E5 skips dependency and dot folders, and what Git ignores', async () => {
    const prepare = (folder: string): void => {
      write(folder, 'kept.ts');
      write(folder, 'node_modules/x/index.ts');
      write(folder, '.cache/c.ts');
      write(folder, 'build/out.ts');
      writeFileSync(path.join(folder, '.gitignore'), 'build/\n');
      execFileSync('git', ['init', '--quiet'], { cwd: folder });
    };
    const { results } = await looked(prepare, [find({ pattern: '**/*.ts' })]);
    expect(json(results[0])).toEqual({ paths: ['kept.ts'], truncated: false });
  });

  it('QA58-E6 stops at 200 paths', async () => {
    const prepare = (folder: string): void => {
      for (let index = 0; index < 201; index += 1) write(folder, `many/${String(index).padStart(3, '0')}.txt`);
    };
    const { results } = await looked(prepare, [find({ pattern: '*.txt' })]);
    const found = json(results[0]) as { paths: string[]; truncated: boolean };
    expect(found.paths).toHaveLength(200);
    expect(found.truncated).toBe(true);
  });

  it('QA58-E7 refuses a file, a missing folder, and a path outside the workspace', async () => {
    const { results } = await looked((folder) => write(folder, 'a.ts'), [find({ pattern: '*', path: 'a.ts' }), find({ pattern: '*', path: 'missing' }), find({ pattern: '*', path: '..' }), find({ pattern: '' })]);
    expect(results[0]).toBe('error VALIDATION_FAILED: a.ts is a file; fs find looks under a folder.');
    expect(results[1]).toBe("error NOT_FOUND: missing doesn't exist.");
    expect(results[2]).toMatch(/^error VALIDATION_FAILED: /);
    expect(results[3]).toMatch(/^error VALIDATION_FAILED: pattern: /);
  });
});
