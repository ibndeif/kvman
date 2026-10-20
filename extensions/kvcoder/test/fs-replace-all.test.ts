import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useLooked } from './support/looked.ts';
import { command, fsCall } from './support/model-script.ts';

const looked = useLooked();

const json = (text: string | undefined): unknown => JSON.parse(String(text));

describe('replaceAll through the connectors (08 §8.5, ADR 0090, 1)', { timeout: 30_000 }, () => {
  it('QA58-H1 fs edit with replaceAll changes every occurrence and counts them', async () => {
    let folder = '';
    const { results, outputs } = await looked(
      (prepared) => {
        folder = prepared;
        looked.write(prepared, 'config.ts', 'x = 1\ny = 0\nx = 1\nx = 1\n');
      },
      [fsCall('edit', { path: 'config.ts', edits: [{ oldText: 'x = 1', newText: 'x = 2', replaceAll: true }, { oldText: 'y = 0', newText: 'y = 9' }] })],
      {},
      ['config.ts'],
    );
    expect(json(outputs[0])).toMatchObject({ path: 'config.ts', replacements: 4, firstChangedLine: 1 });
    expect(results[0]).toMatch(/^config\.ts · 4 replacements · lines 1–4 now read:\n/);
    expect(readFileSync(path.join(folder, 'config.ts'), 'utf8')).toBe('x = 2\ny = 9\nx = 2\nx = 2\n');
  });

  it('QA58-H2 artifact edit takes replaceAll, and the version rises by one', async () => {
    const { results } = await looked(() => undefined, [
      command('artifact', 'write', { id: 'notes', title: 'Notes', content: 'old and old' }),
      command('artifact', 'edit', { id: 'notes', edits: [{ oldText: 'old', newText: 'new', replaceAll: true }] }),
      command('artifact', 'get', { id: 'notes' }),
    ]);
    expect(json(results[1])).toMatchObject({ id: 'notes', version: 2, replacements: 2 });
    expect(json(results[2])).toMatchObject({ content: 'new and new', version: 2 });
  });
});
