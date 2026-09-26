import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { packBuiltins } from '@kvman/kernel';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eventually } from '../hosts/harness.ts';
import { closedRegistry } from './fixture-snapshots.ts';
import { startGitServer, type GitServer } from './git-server.ts';
import { command, installed, installTests, openInstallFixture, problemOf, staged, stagingTrees, type InstallFixture } from './harness.ts';
import { packPackage, samplePackage, temporary, writePackage } from './packages.ts';
import { silentRegistry, startRegistry, staticRegistry, type LocalRegistry } from './registries.ts';

let registry: LocalRegistry;
let git: GitServer;
let fixture: InstallFixture | undefined;

beforeAll(async () => {
  registry = await startRegistry();
  git = await startGitServer();
  await registry.publish(await packPackage(writePackage(samplePackage())));
  await registry.publish(await packPackage(writePackage({ name: 'tiny-dependency', main: 'index.js', peerDependencies: {}, files: { 'index.js': 'export default 1;\n' } })));
});
afterAll(async () => {
  git.close();
  await registry.close();
});
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function stageProblem(current: InstallFixture, source: string): Promise<{ code: string; detail?: string }> {
  return problemOf(await command(current, 'kernel.extension.stage', { source }));
}

describe('sources (plan 06 §6.1–§6.2, ADRs 0116, 0118)', installTests, () => {
  it('M2.2-E1 a loose range, a bare name, and a file: git URL fail VALIDATION_FAILED with the source rule', async () => {
    fixture = await openInstallFixture();
    const rules = ['npm sources name an exact version, e.g. npm:@acme/pdf@1.4.2', 'npm sources name an exact version, e.g. npm:@acme/pdf@1.4.2', 'git sources use https, ssh, or git and a 40-character commit, e.g. git:https://host/repo.git#<commit>'];
    const sources = ['npm:@acme/sample@^1', 'npm:@acme/sample', `git:file:///x#${'a'.repeat(40)}`];
    for (const [index, source] of sources.entries()) {
      expect(await stageProblem(fixture, source)).toMatchObject({ code: 'VALIDATION_FAILED', detail: rules[index] });
    }
    expect(stagingTrees(fixture)).toEqual([]);
  });

  it('M2.2-E2 a version the registry does not have', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    expect(await stageProblem(fixture, 'npm:@acme/sample@9.9.9')).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: 'npm has no version 9.9.9 of @acme/sample' });
    expect(stagingTrees(fixture)).toEqual([]);
  });

  it('M2.2-E3 a tarball that does not match its integrity', async () => {
    const lying = await staticRegistry('@acme/sample', await packPackage(writePackage(samplePackage())), 'wrong');
    fixture = await openInstallFixture({ registry: lying.url });
    expect(await stageProblem(fixture, 'npm:@acme/sample@1.0.0')).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: 'the tarball of @acme/sample@1.0.0 does not match its integrity' });
    await lying.close();
  });

  it('M2.2-E4 a tarball whose package has another name', async () => {
    const other = await staticRegistry('@acme/other', await packPackage(writePackage(samplePackage())));
    fixture = await openInstallFixture({ registry: other.url });
    expect(await stageProblem(fixture, 'npm:@acme/other@1.0.0')).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: 'the package is named @acme/sample, not @acme/other' });
    await other.close();
  });

  it('M2.2-E5 a commit the repository does not have', async () => {
    git.commit('missing', writePackage(samplePackage()));
    fixture = await openInstallFixture();
    const commit = 'f'.repeat(40);
    expect(await stageProblem(fixture, `git:${git.url('missing')}#${commit}`)).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: `the repository has no commit ${commit}` });
  });

  it('M2.2-E6 a fetch still running after 5 minutes of kernel clock is killed', async () => {
    const silent = await silentRegistry();
    fixture = await openInstallFixture({ registry: silent.url });
    const current = fixture;
    const reply = command(current, 'kernel.extension.stage', { source: 'npm:@acme/sample@1.0.0' });
    await eventually(() => expect(silent.requests.count).toBe(1));
    current.timers.advance(5 * 60_000);
    expect(problemOf(await reply)).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: 'fetching the source took longer than 5 minutes' });
    expect(stagingTrees(current)).toEqual([]);
    await silent.close();
  });

  it('M2.2-E7 a dev version nothing recorded', async () => {
    fixture = await openInstallFixture();
    expect(await stageProblem(fixture, 'dev:acme-sample@1')).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: 'no dev version acme-sample@1 is recorded' });
  });

  it('M2.2-E8 the folder pipeline installs dependencies and leaves only the package tree', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const folder = writePackage(samplePackage({ dependencies: { 'tiny-dependency': '1.0.0' }, fields: { files: ['dist'] }, files: { 'dist/extension.js': readFileSync(join(writePackage(samplePackage()), 'dist', 'extension.js'), 'utf8'), 'notes.txt': 'not published' } }));
    const version = await fixture.runtime.install.stageFolder(folder, 'dev:acme-sample@1', '01JAZ3K4M5N6P7Q8R9S0T1V2W3', new AbortController().signal);
    expect(version).toMatchObject({ source: 'dev:acme-sample@1' });
    expect(version.integrity).toBeUndefined();
    expect(readdirSync(version.tree).sort()).toEqual(['node_modules']);
    expect(readdirSync(join(version.tree, 'node_modules')).sort()).toEqual(['@acme', 'tiny-dependency']);
    expect(readdirSync(join(version.tree, 'node_modules', '@acme', 'sample')).sort()).toEqual(['dist', 'package.json']);
  });

  it('M2.2-E9 local: stages an existing snapshot; an unknown digest is refused', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const { digest } = await installed(fixture, 'npm:@acme/sample@1.0.0');
    const local = await staged(fixture, `local:${digest}`);
    expect(local).toMatchObject({ source: `local:${digest}`, digest, name: '@acme/sample' });
    expect(local.integrity).toBeUndefined();
    const unknown = 'e'.repeat(64);
    expect(await stageProblem(fixture, `local:${unknown}`)).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: `no snapshot ${unknown} is installed` });
  });

  it('M2.2-E10 an unknown builtin, and a builtin that does not match digests.json', async () => {
    const extensions = temporary('builtin-sources');
    writePackage(samplePackage(), join(extensions, 'sample'));
    const builtin = join(temporary('builtin'), 'builtin');
    await packBuiltins(extensions, builtin, { registry: closedRegistry, environment: process.env });
    const digests = join(builtin, 'digests.json');
    writeFileSync(digests, readFileSync(digests, 'utf8').replace(/"digest": "[0-9a-f]{64}"/, `"digest": "${'0'.repeat(64)}"`));
    fixture = await openInstallFixture({ builtin });
    expect(await stageProblem(fixture, 'builtin:@acme/none')).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: 'no builtin @acme/none' });
    expect(await stageProblem(fixture, 'builtin:@acme/sample')).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: 'the builtin @acme/sample does not match digests.json' });
  });
});
