import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useLooked } from './support/looked.ts';
import { fsCall } from './support/model-script.ts';

const looked = useLooked();
const json = (text: string | undefined): unknown => JSON.parse(String(text));

describe('an empty path means the workspace folder (08 §8.5, ADR 0012, 12)', { timeout: 30_000 }, () => {
  it('QA19-H13 an empty path is the workspace folder', async () => {
    const prepare = (folder: string): void => {
      writeFileSync(path.join(folder, 'a.txt'), 'needle\n');
      writeFileSync(path.join(folder, 'b.txt'), 'nothing\n');
    };
    const { results } = await looked(prepare, [fsCall('list'), fsCall('list', { path: '' }), fsCall('search', { pattern: 'needle' }), fsCall('search', { pattern: 'needle', path: '' })]);
    expect(json(results[1])).toEqual(json(results[0]));
    expect(json(results[3])).toEqual(json(results[2]));
  });

  it('QA19-E11 an empty path elsewhere', async () => {
    const { results, kernel } = await looked(() => undefined, [fsCall('read', { path: '' }), fsCall('write', { path: '', content: 'x' }), fsCall('edit', { path: '', edits: [{ oldText: 'a', newText: 'b' }] })]);
    expect(results[0]).toBe('error VALIDATION_FAILED: path: Too small: expected string to have >=1 characters. The payload of fs read is\n{ path, fromLine?, lines? }');
    expect(results[1]).toBe('error VALIDATION_FAILED: path: Too small: expected string to have >=1 characters. The payload of fs write is\n{ path, content, risky? }');
    expect(results[2]).toBe('error VALIDATION_FAILED: path: Too small: expected string to have >=1 characters. The payload of fs edit is\n{ path, edits: [{ oldText, newText }], risky? }');
    expect(readdirSync(kernel.homeFolder)).toEqual([]);
  });
});
