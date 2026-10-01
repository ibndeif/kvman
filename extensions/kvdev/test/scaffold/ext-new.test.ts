import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { scaffoldVersions } from '../../src/ext/scaffold-versions.ts';
import { useKvdev } from '../support/kvdev-kernel.ts';
import { npmEnvironment } from '../support/npm-environment.ts';

const kvdev = useKvdev();
const saved = { ...process.env };
beforeEach(() => Object.assign(process.env, npmEnvironment()));
afterEach(() => {
  process.env = { ...saved };
});

const manifestSchema = z.object({ main: z.string(), scripts: z.record(z.string(), z.string()), peerDependencies: z.record(z.string(), z.string()), devDependencies: z.record(z.string(), z.string()), kvman: z.record(z.string(), z.unknown()) }).loose();
const read = (folder: string, file: string) => readFileSync(path.join(folder, file), 'utf8');
const base = { '@kvman/sdk': scaffoldVersions.sdk, '@kvman/testkit': scaffoldVersions.testkit, '@types/node': scaffoldVersions.typesNode, typescript: scaffoldVersions.typescript };

describe('ext new writes the scaffold and installs it (09 §9.2, ADR 0009, 118, 127, 128)', () => {
  it('M2.5-E1 the plain scaffold, into an existing empty folder', async () => {
    const world = await kvdev.start();
    mkdirSync(path.join(world.workspace, 'notes'));
    expect(await world.kernel.exec('kvdev.ext.new', { name: 'notes', namespace: 'notes', folder: 'notes' })).toEqual({ folder: 'notes', name: 'notes', namespace: 'notes', web: false });
    const folder = path.join(world.workspace, 'notes');
    const manifest = manifestSchema.parse(JSON.parse(read(folder, 'package.json')));
    expect(manifest).toMatchObject({ main: 'dist/index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, devDependencies: base, kvman: { namespace: 'notes', source: 'src/index.ts', dependencies: {} } });
    expect(manifest.scripts).toEqual({ build: 'tsc -p tsconfig.build.json', check: 'kvman-check', test: 'node --test "test/**/*.test.ts"' });
    for (const file of ['src/index.ts', 'locales/en.json', 'locales/ar.json', 'test/extension.test.ts', 'tsconfig.json', 'README.md']) expect(existsSync(path.join(folder, file)), file).toBe(true);
    expect(read(folder, 'src/index.ts')).toContain("'notes.greeting.get'");
    expect(existsSync(path.join(folder, 'node_modules', '@kvman', 'testkit', 'dist', 'check-bin.js'))).toBe(true);
    expect(existsSync(path.join(folder, 'web'))).toBe(false);
  });

  it('M2.5-E2 web: true adds the component, its build, and a page that shows it', async () => {
    const world = await kvdev.start();
    expect(await world.kernel.exec('kvdev.ext.new', { name: '@me/cards', namespace: 'cards', folder: 'apps/cards', web: true })).toEqual({ folder: 'apps/cards', name: '@me/cards', namespace: 'cards', web: true });
    const folder = path.join(world.workspace, 'apps', 'cards');
    const manifest = manifestSchema.parse(JSON.parse(read(folder, 'package.json')));
    expect(manifest.kvman).toEqual({ namespace: 'cards', source: 'src/index.ts', dependencies: {}, web: 'dist/web' });
    expect(manifest.devDependencies).toEqual({ ...base, vite: scaffoldVersions.vite, '@vitejs/plugin-vue': scaffoldVersions.pluginVue, vue: scaffoldVersions.vue });
    expect(manifest.scripts).toMatchObject({ 'web:build': 'node web-build.ts', 'web:watch': 'node web-build.ts --watch' });
    expect(read(folder, 'web/components/Hello.vue')).toContain("kvman?.t('cards.hello.text')");
    expect(read(folder, 'src/index.ts')).toContain("{ type: 'custom', component: 'cards.hello', props: {} }");
    expect(existsSync(path.join(folder, 'node_modules', 'vite'))).toBe(true);
  });
});
