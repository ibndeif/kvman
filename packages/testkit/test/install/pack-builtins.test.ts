import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { packBuiltins } from '@kvman/kernel';
import { builtinDigestsSchema } from '@kvman/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closedRegistry } from './fixture-snapshots.ts';
import { installed, installTests, openInstallFixture } from './harness.ts';
import { extensionSource, packPackage, temporary, writePackage } from './packages.ts';
import { startRegistry, type LocalRegistry } from './registries.ts';

const script = fileURLToPath(new URL('../../../../scripts/pack-builtins.ts', import.meta.url));
let registry: LocalRegistry;

beforeAll(async () => {
  registry = await startRegistry();
  await registry.publish(await packPackage(writePackage({ name: 'tiny-dependency', main: 'index.js', peerDependencies: {}, files: { 'index.js': 'export default 1;\n' } })));
});
afterAll(async () => {
  await registry.close();
});

function packBuiltinsScript(extensions: string, out: string): Promise<{ stdout: string }> {
  return promisify(execFile)(process.execPath, ['--conditions=@kvman/source', script, '--extensions', extensions, '--out', out], { env: { ...process.env, KVMAN_NPM_REGISTRY: registry.url } });
}

describe('scripts/pack-builtins (plan 06 §6.9, ADR 0115)', installTests, () => {
  it('M2.2-H2 scripts/pack-builtins produces the builtin tarballs and digests.json', async () => {
    const extensions = temporary('pack-extensions');
    writePackage({ name: '@acme/alpha', files: { 'dist/extension.js': extensionSource('@acme/alpha', 'alpha') } }, join(extensions, 'alpha'));
    writePackage({ name: '@acme/beta', dependencies: { 'tiny-dependency': '1.0.0' }, files: { 'dist/extension.js': extensionSource('@acme/beta', 'beta') } }, join(extensions, 'beta'));
    const out = join(temporary('pack-out'), 'builtin');
    expect((await packBuiltinsScript(extensions, out)).stdout).toBe('packed 2 builtin extension(s)\n');
    expect(readdirSync(out).sort()).toEqual(['acme-alpha.tgz', 'acme-beta.tgz', 'digests.json']);
    const digests = builtinDigestsSchema.parse(JSON.parse(readFileSync(join(out, 'digests.json'), 'utf8')));
    expect(digests).toEqual({ '@acme/alpha': { file: 'acme-alpha.tgz', digest: expect.stringMatching(/^[0-9a-f]{64}$/) }, '@acme/beta': { file: 'acme-beta.tgz', digest: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    const fixture = await openInstallFixture({ builtin: out });
    try {
      const beta = await installed(fixture, 'builtin:@acme/beta');
      expect(beta.digest).toBe(digests['@acme/beta']?.digest);
      expect(existsSync(join(fixture.home, 'extensions', 'snapshots', beta.digest, 'node_modules', 'tiny-dependency', 'index.js'))).toBe(true);
    } finally {
      await fixture.close();
    }
    const emptyOut = join(temporary('pack-out'), 'builtin');
    await packBuiltinsScript(join(temporary('no-extensions'), 'extensions'), emptyOut);
    expect(JSON.parse(readFileSync(join(emptyOut, 'digests.json'), 'utf8'))).toEqual({});
  });

  it('M2.8-E5 packBuiltins packs builtin presets and names an invalid file', async () => {
    const presets = join(temporary('pack-presets'), 'presets');
    mkdirSync(presets, { recursive: true });
    const coding = {
      presetVersion: 1, id: 'coding', name: 'Coding', revision: 3, app: { title: 'Coding', home: '/' },
      extensions: {
        '@acme/first': {
          source: 'builtin:@acme/first', integrity: 'builtin:0.0.1', enabled: true,
          grants: { isolation: 'shared', requested: [], derived: { subscribes: [], providesLlm: [] } },
        },
      },
    };
    writeFileSync(join(presets, 'coding.json'), JSON.stringify(coding));
    const extensions = join(temporary('pack-presets-empty'), 'extensions');
    mkdirSync(extensions, { recursive: true });
    const out = join(temporary('pack-presets-out'), 'builtin');
    await packBuiltins(extensions, out, { registry: closedRegistry, environment: process.env, presets, kvmanVersion: '0.0.0' });
    const packed = JSON.parse(readFileSync(join(out, 'presets', 'coding.json'), 'utf8'));
    expect(packed.extensions['@acme/first'].integrity).toBe('builtin:0.0.0');
    expect(packed.revision).toBe(3);
    writeFileSync(join(presets, 'broken.json'), 'not json at all');
    await expect(packBuiltins(extensions, join(temporary('pack-presets-out'), 'builtin'), { registry: closedRegistry, environment: process.env, presets, kvmanVersion: '0.0.0' }))
      .rejects.toThrow('broken.json');
  });
});
