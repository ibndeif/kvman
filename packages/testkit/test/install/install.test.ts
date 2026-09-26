import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { startGitServer, type GitServer } from './git-server.ts';
import { command, openInstallFixture, installTests, sharedGrants, staged, type InstallFixture } from './harness.ts';
import { extensionSource, packPackage, samplePackage, writePackage } from './packages.ts';
import { startRegistry, type LocalRegistry } from './registries.ts';

let registry: LocalRegistry;
let git: GitServer;
let fixture: InstallFixture | undefined;

beforeAll(async () => {
  registry = await startRegistry();
  git = await startGitServer();
});
afterAll(async () => {
  git.close();
  await registry.close();
});
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe('installing from npm and git (plan 06 §6.1–§6.2, ADR 0116)', installTests, () => {
  it('M2.2-H1 a sample extension installs from the local test registry and from a git commit', async () => {
    await registry.publish(await packPackage(writePackage(samplePackage())));
    const gitPackage = writePackage(samplePackage({ name: '@acme/sample-git', files: { 'dist/extension.js': extensionSource('@acme/sample-git', 'sample-git') } }));
    const commit = git.commit('sample', gitPackage);
    fixture = await openInstallFixture({ registry: registry.url, enabled: [[workspaceA, ['@acme/sample', '@acme/sample-git']]] });
    fixture.grants['@acme/sample'] = sharedGrants;
    fixture.grants['@acme/sample-git'] = sharedGrants;
    const sources = [
      { source: 'npm:@acme/sample@1.0.0', name: '@acme/sample', integrity: expect.stringMatching(/^sha512-/), echo: 'sample.echo' },
      { source: `git:${git.url('sample')}#${commit}`, name: '@acme/sample-git', integrity: `git:${commit}`, echo: 'sample-git.echo' },
    ];
    for (const { source, name, integrity, echo } of sources) {
      const stage = await staged(fixture, source);
      expect(stage).toMatchObject({ name, version: '1.0.0', source, integrity, digest: expect.stringMatching(/^[0-9a-f]{64}$/), expiresAt: fixture.timers.time.value + 600_000 });
      expect(await command(fixture, 'kernel.extension.install', { confirmationToken: stage.confirmationToken })).toEqual({ ok: true, value: { name, digest: stage.digest } });
      const snapshot = join(fixture.home, 'extensions', 'snapshots', stage.digest);
      for (const file of ['manifest.json', 'files.json', join('node_modules', name, 'dist', 'extension.js')]) expect(existsSync(join(snapshot, file))).toBe(true);
      expect(fixture.connection.prepare('SELECT source, integrity FROM extension_versions WHERE name = ?').all(name)).toEqual([{ source, integrity: stage.integrity }]);
      expect(fixture.connection.prepare('SELECT active_digest FROM extensions WHERE name = ?').get(name)).toEqual({ active_digest: stage.digest });
      expect(fixture.connection.prepare("SELECT payload FROM events WHERE type = 'kernel.extension.installed' AND payload LIKE ?").all(`%"${name}"%`)).toEqual([{ payload: JSON.stringify({ name, digest: stage.digest }) }]);
      expect(await command(fixture, echo, { text: 'hello' }, undefined, workspaceA)).toEqual({ ok: true, value: { text: 'hello' } });
    }
  });
});
