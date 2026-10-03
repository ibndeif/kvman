import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { scaffoldVersions } from '../../src/new/scaffold-versions.ts';
import { npmEnvironment } from '../support/npm-environment.ts';
import { runBin } from '../support/run-bin.ts';

// `kvman-new` runs against the in-test registry (plan 12 §12.1): each test scaffolds into its own temporary folder,
// removed after the test, and installs from the registry the global setup serves.

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const manifestSchema = z
  .object({
    main: z.string(),
    files: z.array(z.string()),
    scripts: z.record(z.string(), z.string()),
    peerDependencies: z.record(z.string(), z.string()),
    devDependencies: z.record(z.string(), z.string()),
    kvman: z.record(z.string(), z.unknown()),
  })
  .loose();

const outputSchema = z.object({ folder: z.string(), name: z.string(), namespace: z.string(), web: z.boolean() });

const base = { '@kvman/sdk': scaffoldVersions.sdk, '@kvman/testkit': scaffoldVersions.testkit, '@types/node': scaffoldVersions.typesNode, typescript: scaffoldVersions.typescript };

function makeParent(): string {
  const parent = mkdtempSync(path.join(tmpdir(), 'kvman-new-'));
  roots.push(parent);
  return parent;
}

function scaffolded(parent: string): Promise<{ folder: string }> {
  return runBin('new/new-bin.js', ['notes', '--name', '@me/notes', '--namespace', 'notes', '--json'], { cwd: parent, env: npmEnvironment() }).then((run) => {
    expect(run.exitCode).toBe(0);
    return { folder: path.join(parent, 'notes') };
  });
}

function checkClean(folder: string): void {
  execFileSync('npm', ['test'], { cwd: folder, env: { ...process.env, ...npmEnvironment() }, stdio: 'pipe' });
  const check = execFileSync('npm', ['run', 'check', '--', '--json'], { cwd: folder, env: { ...process.env, ...npmEnvironment() }, stdio: 'pipe', encoding: 'utf8' });
  expect(check.trim().split('\n').at(-1)).toBe('[]');
}

describe('kvman-new scaffolds a project (09 §9.2, ADR 0010, 2, 9, 18)', () => {
  it('QA17-H8 the plain scaffold holds every file, installs, passes, and prints one JSON line', async () => {
    const parent = makeParent();
    const run = await runBin('new/new-bin.js', ['notes', '--name', '@me/notes', '--namespace', 'notes', '--json'], { cwd: parent, env: npmEnvironment() });
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toBe('');
    const output = outputSchema.parse(JSON.parse(run.stdout));
    const folder = path.join(parent, 'notes');
    expect(output).toEqual({ folder, name: '@me/notes', namespace: 'notes', web: false });
    expect(run.stdout).toBe(`${JSON.stringify(output)}\n`);
    const manifest = manifestSchema.parse(JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8')));
    expect(manifest).toMatchObject({
      main: 'dist/index.js',
      files: ['dist', 'locales', 'extension-docs'],
      peerDependencies: { '@kvman/sdk': '^0.1.0' },
      devDependencies: base,
      kvman: { namespace: 'notes', source: 'src/index.ts', dependencies: {} },
    });
    expect(manifest.scripts).toEqual({ build: 'tsc -p tsconfig.build.json', check: 'kvman-check', test: 'node --test "test/**/*.test.ts"' });
    for (const file of ['package.json', 'src/index.ts', 'src/docs.ts', 'locales/en.json', 'locales/ar.json', 'test/extension.test.ts', 'tsconfig.json', 'tsconfig.build.json', 'README.md', 'AGENTS.md', 'CLAUDE.md', 'docs/sdk.md', 'docs/i18n.md', 'docs/presets.md', 'extension-docs/usage.md']) {
      expect(existsSync(path.join(folder, file)), file).toBe(true);
    }
    expect(existsSync(path.join(folder, 'web'))).toBe(false);
    expect(existsSync(path.join(folder, 'node_modules', '@kvman', 'testkit', 'dist', 'check-bin.js'))).toBe(true);
    checkClean(folder);
  });

  it('QA17-H27 the scaffold documents itself: docs.list and docs.get are public over extension-docs/, and check passes', async () => {
    const parent = makeParent();
    const { folder } = await scaffolded(parent);
    const source = readFileSync(path.join(folder, 'src', 'index.ts'), 'utf8');
    expect(source).toMatch(/registerQuery\('notes\.docs\.list'[\s\S]*?public: true/);
    expect(source).toMatch(/registerQuery\('notes\.docs\.get'[\s\S]*?public: true/);
    const sample = readFileSync(path.join(folder, 'test', 'extension.test.ts'), 'utf8');
    expect(sample).toContain('docs.list');
    expect(sample).toContain('docs.get');
    checkClean(folder);
  });
});
