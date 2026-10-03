import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { scaffoldVersions } from '../../src/new/scaffold-versions.ts';
import { npmEnvironment } from '../support/npm-environment.ts';
import { runBin } from '../support/run-bin.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const manifestSchema = z.object({ scripts: z.record(z.string(), z.string()), devDependencies: z.record(z.string(), z.string()), kvman: z.record(z.string(), z.unknown()) }).loose();
const read = (folder: string, file: string): string => readFileSync(path.join(folder, file), 'utf8');

describe('kvman-new --web adds the web template (09 §9.2, ADR 0010, 2)', () => {
  it('QA17-H10 the web files and scripts exist, and web:build builds hello.js and hello.css', async () => {
    const parent = mkdtempSync(path.join(tmpdir(), 'kvman-new-web-'));
    roots.push(parent);
    const run = await runBin('new/new-bin.js', ['apps/cards', '--name', '@me/cards', '--namespace', 'cards', '--web', '--json'], { cwd: parent, env: npmEnvironment() });
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toBe('');
    const output = z.object({ folder: z.string(), name: z.string(), namespace: z.string(), web: z.boolean() }).parse(JSON.parse(run.stdout));
    const folder = path.join(parent, 'apps', 'cards');
    expect(output).toEqual({ folder, name: '@me/cards', namespace: 'cards', web: true });
    expect(run.stdout).toBe(`${JSON.stringify(output)}\n`);
    const manifest = manifestSchema.parse(JSON.parse(read(folder, 'package.json')));
    expect(manifest.kvman).toEqual({ namespace: 'cards', source: 'src/index.ts', dependencies: {}, web: 'dist/web' });
    expect(manifest.devDependencies).toEqual({
      '@kvman/sdk': scaffoldVersions.sdk,
      '@kvman/testkit': scaffoldVersions.testkit,
      '@types/node': scaffoldVersions.typesNode,
      typescript: scaffoldVersions.typescript,
      vite: scaffoldVersions.vite,
      '@vitejs/plugin-vue': scaffoldVersions.pluginVue,
      vue: scaffoldVersions.vue,
    });
    expect(manifest.scripts).toMatchObject({ 'web:build': 'node web-build.ts', 'web:watch': 'node web-build.ts --watch' });
    expect(read(folder, 'web/components/Hello.vue')).toContain("kvman?.t('cards.hello.text')");
    expect(read(folder, 'src/index.ts')).toContain("{ type: 'custom', component: 'cards.hello', props: {} }");
    expect(existsSync(path.join(folder, 'node_modules', 'vite'))).toBe(true);
    execFileSync('npm', ['run', 'web:build'], { cwd: folder, env: { ...process.env, ...npmEnvironment() }, stdio: 'pipe' });
    expect(existsSync(path.join(folder, 'dist', 'web', 'components', 'hello.js'))).toBe(true);
    expect(existsSync(path.join(folder, 'dist', 'web', 'components', 'hello.css'))).toBe(true);
  });
});
