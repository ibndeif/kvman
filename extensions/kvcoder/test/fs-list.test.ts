import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useLooked } from './support/looked.ts';
import { fsCall } from './support/model-script.ts';

const looked = useLooked();

const json = (text: string | undefined): unknown => JSON.parse(String(text));

describe('fs list (08 §8.5, ADR 0011, 8)', { timeout: 30_000 }, () => {
  it('QA18-H13 list returns one folder\'s entries by name with their kind and size, and the workspace folder by default', async () => {
    const prepare = (folder: string): void => {
      mkdirSync(path.join(folder, 'src', 'inner'), { recursive: true });
      writeFileSync(path.join(folder, 'src', 'b.ts'), 'bb');
      writeFileSync(path.join(folder, 'src', 'a.ts'), 'a');
      writeFileSync(path.join(folder, 'src', 'inner', 'deep.ts'), 'deep');
    };
    const { results } = await looked(prepare, [fsCall('list', { path: 'src' }), fsCall('list')]);
    expect(json(results[0])).toEqual({ path: 'src', entries: [{ name: 'a.ts', kind: 'file', bytes: 1 }, { name: 'b.ts', kind: 'file', bytes: 2 }, { name: 'inner', kind: 'folder', bytes: 0 }], truncated: false });
    const home = json(results[1]) as { path: string; entries: { name: string; kind: string }[] };
    expect(home.path).toBe('.');
    expect(home.entries).toContainEqual({ name: 'src', kind: 'folder', bytes: 0 });
  });

  it('QA18-E18 list stops at 1000 entries, and refuses a file, a missing folder, and a path outside the workspace', async () => {
    const prepare = (folder: string): void => {
      mkdirSync(path.join(folder, 'many'));
      for (let index = 0; index < 1001; index += 1) writeFileSync(path.join(folder, 'many', `f${String(index).padStart(4, '0')}`), '');
      writeFileSync(path.join(folder, 'plain.txt'), 'x');
    };
    const { results } = await looked(prepare, [fsCall('list', { path: 'many' }), fsCall('list', { path: 'missing' }), fsCall('list', { path: 'plain.txt' }), fsCall('list', { path: '..' })]);
    const many = json(results[0]) as { entries: { name: string }[]; truncated: boolean };
    expect(many.entries).toHaveLength(1000);
    expect(many.entries.at(-1)?.name).toBe('f0999');
    expect(many.truncated).toBe(true);
    expect(results[1]).toBe("error NOT_FOUND: missing doesn't exist.");
    expect(results[2]).toMatch(/^error VALIDATION_FAILED: plain.txt is a file/);
    expect(results[3]).toBe('error VALIDATION_FAILED: .. is outside the workspace folder.');
  });
});
