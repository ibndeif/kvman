import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useLooked } from './support/looked.ts';
import { fsCall } from './support/model-script.ts';

const looked = useLooked();

const json = (text: string | undefined): unknown => JSON.parse(String(text));

function write(folder: string, name: string, content: string | Buffer): void {
  mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
  writeFileSync(path.join(folder, name), content);
}

describe('fs search (08 §8.5, ADR 0011, 8)', { timeout: 30_000 }, () => {
  it('QA18-H14 search finds matching lines in path order, skipping dependency and dot folders and binary files', async () => {
    const prepare = (folder: string): void => {
      write(folder, 'src/b.ts', "one\nctx.registerQuery('b');\n");
      write(folder, 'src/a.ts', "ctx.registerCommand('a');\nregisterNothing();\n");
      write(folder, 'node_modules/x/index.js', "registerCommand('dep');\n");
      write(folder, '.git/config', 'registerCommand\n');
      write(folder, '.cache/c.txt', 'registerCommand\n');
      write(folder, 'src/logo.bin', Buffer.concat([Buffer.from('registerCommand'), Buffer.from([0xff, 0xfe])]));
    };
    const { results } = await looked(prepare, [fsCall('search', { pattern: 'register(Command|Query)' }), fsCall('search', { pattern: 'register', path: 'src/a.ts' })]);
    expect(json(results[0])).toEqual({ files: [{ path: 'src/a.ts', matches: [{ line: 1, text: "ctx.registerCommand('a');" }] }, { path: 'src/b.ts', matches: [{ line: 2, text: "ctx.registerQuery('b');" }] }], truncated: false });
    expect(json(results[1])).toEqual({ files: [{ path: 'src/a.ts', matches: [{ line: 1, text: "ctx.registerCommand('a');" }, { line: 2, text: 'registerNothing();' }] }], truncated: false });
  });

  it('QA18-E19 search stops at 200 matches, cuts long lines, and refuses a bad pattern or path', async () => {
    const prepare = (folder: string): void => {
      write(folder, 'many.txt', 'hit\n'.repeat(201));
      write(folder, 'wide/wide.txt', `needle${'w'.repeat(800)}\n`);
    };
    const { results } = await looked(prepare, [
      fsCall('search', { pattern: 'hit', path: 'many.txt' }),
      fsCall('search', { pattern: 'needle', path: 'wide' }),
      fsCall('search', { pattern: '(' }),
      fsCall('search', { pattern: 'x', path: 'missing' }),
      fsCall('search', { pattern: 'x', path: '..' }),
      fsCall('search', { pattern: 'nothing-has-this' }),
    ]);
    const many = json(results[0]) as { files: { matches: unknown[] }[]; truncated: boolean };
    expect(many.files[0]?.matches).toHaveLength(200);
    expect(many.truncated).toBe(true);
    const wide = json(results[1]) as { files: { matches: { text: string }[] }[] };
    expect(wide.files[0]?.matches[0]?.text).toBe(`needle${'w'.repeat(494)}`);
    expect(results[2]).toMatch(/^error VALIDATION_FAILED: The pattern isn't a regular expression: /);
    expect(results[3]).toBe("error NOT_FOUND: missing doesn't exist.");
    expect(results[4]).toBe('error VALIDATION_FAILED: .. is outside the workspace folder.');
    expect(json(results[5])).toEqual({ files: [], truncated: false });
  });
});
