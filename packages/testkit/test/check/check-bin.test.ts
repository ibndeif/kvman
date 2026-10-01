import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { cleanSource, useProjects } from './projects.ts';

const project = useProjects();
const binFile = fileURLToPath(new URL('../../src/check-bin.ts', import.meta.url));
const findingsSchema = z.array(z.strictObject({ file: z.string().optional(), message: z.string(), hint: z.string().min(1) }));

function runBin(folder: string, options: string[]): { status: number | null; stdout: string } {
  const run = spawnSync(process.execPath, ['--conditions=@kvman/source', binFile, ...options], { cwd: folder, encoding: 'utf8' });
  return { status: run.status, stdout: run.stdout };
}

describe('the kvman-check bin (10, ADR 0009, 116)', () => {
  it('M2.5-E21 prints readable findings, or with --json the findings array on its last line, each with a hint', () => {
    const folder = project({ source: cleanSource.replace("description: 'Gives the greeting.', ", ''), locales: { en: { 'notes.title': 'Notes', 'notes.pages.hello': 'Hello' } } });
    const readable = runBin(folder, []);
    expect(readable.status).toBe(1);
    expect(readable.stdout).toContain("extension: The extension doesn't load:");
    const json = runBin(folder, ['--json']);
    expect(json.status).toBe(1);
    const findings = findingsSchema.parse(JSON.parse(json.stdout.trim().split('\n').at(-1) ?? ''));
    expect(findings).toEqual([{ message: expect.stringMatching(/^The extension doesn't load:/), hint: expect.any(String) }]);
  });

  it('M2.5-E21 a clean project exits 0, and an unknown option exits 1', () => {
    const folder = project({ source: cleanSource });
    expect(runBin(folder, ['--json'])).toEqual({ status: 0, stdout: '[]\n' });
    expect(runBin(folder, ['--fix']).status).toBe(1);
  });
});
