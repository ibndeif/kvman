import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { command, installTests, openInstallFixture, problemOf } from './harness.ts';
import { extensionSource, packPackage, writePackage } from './packages.ts';
import { startRegistry, type LocalRegistry } from './registries.ts';

let registry: LocalRegistry;

beforeAll(async () => {
  registry = await startRegistry();
  const addon = "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\nexport default require('./build/addon.node');\n";
  await registry.publish(await packPackage(writePackage({ name: 'fake-native', main: 'index.js', peerDependencies: {}, files: { 'index.js': addon, 'build/addon.node': 'not really compiled' } })));
  await registry.publish(await packPackage(writePackage({ name: '@acme/undeclared', files: { 'dist/extension.js': extensionSource('@acme/undeclared', 'undeclared', "import lodash from 'lodash';\nconsole.log(lodash);") } })));
  await registry.publish(await packPackage(writePackage({ name: '@acme/mainless', files: { 'dist/other.js': extensionSource('@acme/mainless', 'mainless') } })));
  await registry.publish(await packPackage(writePackage({
    name: '@acme/native', dependencies: { 'fake-native': '1.0.0' }, files: { 'dist/extension.js': extensionSource('@acme/native', 'native', "import addon from 'fake-native';\nconsole.log(addon);") },
  })));
});
afterAll(async () => {
  await registry.close();
});

describe('package checks through stage (plan 06 §6.2)', installTests, () => {
  it('M2.2-H6 an undeclared import, a missing built main, or a top-level native import fails with EXT_SOURCE_INVALID naming the cause', async () => {
    const fixture = await openInstallFixture({ registry: registry.url });
    const stage = async (name: string) => problemOf(await command(fixture, 'kernel.extension.stage', { source: `npm:${name}@1.0.0` }));
    expect(await stage('@acme/undeclared')).toMatchObject({
      code: 'EXT_SOURCE_INVALID', detail: 'dist/extension.js imports lodash, which package.json does not declare', params: { file: 'dist/extension.js', specifier: 'lodash' },
    });
    expect(await stage('@acme/mainless')).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: 'main dist/extension.js does not exist; publish or commit the built files' });
    expect(await stage('@acme/native')).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: 'import native dependency fake-native inside a handler' });
    await fixture.close();
  });
});
