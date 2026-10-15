import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { installedExtensions, useDependencyProjects } from '../support/dependency-projects.ts';

const projects = useDependencyProjects();
const binFile = fileURLToPath(new URL('../../src/check-bin.ts', import.meta.url));
const findingsSchema = z.array(z.strictObject({ file: z.string().optional(), message: z.string(), hint: z.string().min(1) }));

function checkJson(folder: string): { status: number | null; findings: z.output<typeof findingsSchema> } {
  const run = spawnSync(process.execPath, ['--conditions=@kvman/source', binFile, '--json'], { cwd: folder, encoding: 'utf8' });
  return { status: run.status, findings: findingsSchema.parse(JSON.parse(run.stdout.trim().split('\n').at(-1) ?? '')) };
}

describe('kvman-check with kvman dependencies (10, ADR 0080, 4)', () => {
  it('QA51-H7 a project whose dependency is installed passes', () => {
    expect(checkJson(projects.project({ '@test/base': '^0.1.0' }, installedExtensions))).toEqual({ status: 0, findings: [] });
  });

  it('QA51-E5 each dependency that is not installed is an error naming the npm line, with no load finding', () => {
    const { status, findings } = checkJson(projects.project({ '@test/missing': '^0.1.0', '@test/other': '^1.0.0' }, []));
    expect(status).toBe(1);
    expect(findings).toEqual([
      { message: "notes depends on @test/missing, which isn't installed in this project.", hint: expect.stringContaining('npm install --save-dev --save-exact @test/missing@') },
      { message: "notes depends on @test/other, which isn't installed in this project.", hint: expect.stringContaining('npm install --save-dev --save-exact @test/other@') },
    ]);
  });
});
