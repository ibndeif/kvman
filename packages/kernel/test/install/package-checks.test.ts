import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { buildFileList, checkPackage, readPackageJson } from '../../src/index.ts';
import { describe, expect, it } from 'vitest';
import { failure, tree } from './trees.ts';

const complete: Record<string, unknown> = { name: '@acme/sample', version: '1.0.0', description: 'A sample.', main: 'dist/extension.js', peerDependencies: { '@kvman/sdk': '*' } };

async function checked(packageJson: Record<string, unknown>, sdkVersion = '0.0.0'): Promise<unknown> {
  const folder = tree({ 'package.json': JSON.stringify(packageJson), 'dist/extension.js': 'export default 1;' });
  return checkPackage(folder, await readPackageJson(folder), sdkVersion);
}

describe('package checks (plan 06 §6.2 step 2, ADR 0117)', () => {
  it('M2.2-E11 each missing identity field is named', async () => {
    for (const field of ['name', 'version', 'description', 'main']) {
      const { [field]: removed, ...rest } = complete;
      expect(removed).toBeDefined();
      expect(await failure(checked(rest))).toMatchObject({ code: 'EXT_SOURCE_INVALID', details: { detail: `package.json has no ${field}`, params: { field } } });
    }
    expect(await failure(checked({ ...complete, main: 'dist/missing.js' }))).toMatchObject({ details: { detail: 'main dist/missing.js does not exist; publish or commit the built files' } });
  });

  it('M2.2-E12 a symlink leaving the tree is refused; one inside it is recorded as a link', async () => {
    const outside = tree({ 'node_modules/a/index.js': 'x' });
    symlinkSync('/etc', join(outside, 'node_modules', 'a', 'etc'));
    expect(await failure(buildFileList(outside))).toMatchObject({ code: 'EXT_SOURCE_INVALID', details: { detail: 'node_modules/a/etc links outside the package' } });
    const inside = tree({ 'node_modules/a/index.js': 'x' });
    symlinkSync('index.js', join(inside, 'node_modules', 'a', 'main.js'));
    expect(await buildFileList(inside)).toEqual([
      { path: 'node_modules/a/index.js', size: 1, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { path: 'node_modules/a/main.js', link: 'index.js' },
    ]);
  });

  it('M2.2-E13 the SDK peer range must accept the running SDK', async () => {
    expect(await failure(checked({ ...complete, peerDependencies: { '@kvman/sdk': '>=99' } }))).toMatchObject({ code: 'EXT_SOURCE_INVALID', details: { detail: 'needs @kvman/sdk >=99; this kvman has 0.0.0' } });
    expect(await checked(complete)).toMatchObject({ name: '@acme/sample', main: 'dist/extension.js' });
  });

  it('M2.2-E14 the SDK is never a dependency', async () => {
    expect(await failure(checked({ ...complete, dependencies: { '@kvman/sdk': '0.0.0' } }))).toMatchObject({ code: 'EXT_SOURCE_INVALID', details: { detail: 'declare @kvman/sdk in peerDependencies' } });
  });
});
