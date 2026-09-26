import { appendFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bootFixture, temporaryHome } from '../daemon/harness.ts';
import { fixtureFolder, installHostFixtures, workspaceA } from '../hosts/harness.ts';
import audit from '../hosts/fixtures/extensions/audit.ts';
import { installFixture, prepareHome } from './fixture-snapshots.ts';
import { command, extensionActor, installTests, openInstallFixture, problemOf, sendAs, staged, stagingTrees, type InstallFixture } from './harness.ts';
import { packPackage, samplePackage, writePackage } from './packages.ts';
import { startRegistry, type LocalRegistry } from './registries.ts';

let registry: LocalRegistry;
let fixture: InstallFixture | undefined;

beforeAll(async () => {
  registry = await startRegistry();
  await registry.publish(await packPackage(writePackage(samplePackage())));
  await registry.publish(await packPackage(writePackage(samplePackage({ version: '1.1.0' }))));
});
afterAll(async () => {
  await registry.close();
});
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function install(current: InstallFixture, confirmationToken: string): ReturnType<typeof command> {
  return command(current, 'kernel.extension.install', { confirmationToken });
}

function count(current: InstallFixture, sql: string): number {
  return current.connection.prepare(sql).all().length;
}

describe('stage and install (plan 06 §6.2, ADR 0118)', installTests, () => {
  it('M2.2-E32 an unknown, expired, or used token fails CONFIRMATION_EXPIRED', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    expect(problemOf(await install(fixture, 'no-such-token'))).toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
    const expired = await staged(fixture, 'npm:@acme/sample@1.0.0');
    fixture.timers.advance(10 * 60_000);
    expect(problemOf(await install(fixture, expired.confirmationToken))).toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
    expect(stagingTrees(fixture)).toEqual([]);
    const used = await staged(fixture, 'npm:@acme/sample@1.0.0');
    expect(await install(fixture, used.confirmationToken)).toMatchObject({ ok: true });
    expect(problemOf(await install(fixture, used.confirmationToken))).toMatchObject({ code: 'CONFIRMATION_EXPIRED' });
  });

  it('M2.2-E33 staged files changed before install', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const stage = await staged(fixture, 'npm:@acme/sample@1.0.0');
    const [tree] = stagingTrees(fixture);
    appendFileSync(join(fixture.home, 'extensions', 'staging', tree ?? '', 'tree', 'node_modules', '@acme', 'sample', 'dist', 'extension.js'), '\n// changed');
    expect(problemOf(await install(fixture, stage.confirmationToken))).toMatchObject({ code: 'CONFIRMATION_EXPIRED', detail: 'the staged files changed after staging' });
    expect(count(fixture, 'SELECT * FROM extension_versions')).toBe(0);
    expect(existsSync(join(fixture.home, 'extensions', 'snapshots', stage.digest))).toBe(false);
  });

  it('M2.2-E34 installing an installed digest again changes nothing', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const first = await staged(fixture, 'npm:@acme/sample@1.0.0');
    const second = await staged(fixture, 'npm:@acme/sample@1.0.0');
    expect(second.digest).toBe(first.digest);
    await install(fixture, first.confirmationToken);
    expect(await install(fixture, second.confirmationToken)).toEqual({ ok: true, value: { name: '@acme/sample', digest: first.digest } });
    expect(count(fixture, 'SELECT * FROM extension_versions')).toBe(1);
    expect(count(fixture, "SELECT * FROM events WHERE type = 'kernel.extension.installed'")).toBe(1);
  });

  it('M2.2-E35 a second version adds a row and keeps the active digest', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const first = await staged(fixture, 'npm:@acme/sample@1.0.0');
    await install(fixture, first.confirmationToken);
    const second = await staged(fixture, 'npm:@acme/sample@1.1.0');
    expect(await install(fixture, second.confirmationToken)).toMatchObject({ ok: true });
    expect(count(fixture, 'SELECT * FROM extension_versions')).toBe(2);
    expect(fixture.connection.prepare('SELECT active_digest FROM extensions').get()).toEqual({ active_digest: first.digest });
    expect(count(fixture, "SELECT * FROM events WHERE type = 'kernel.extension.installed'")).toBe(2);
  });

  it('M2.2-E36 stage and install are admin; uninstall is for people', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const plain = extensionActor('@acme/plain');
    const admin = extensionActor('@acme/audit');
    await installFixture(fixture.connection, fixture.home, { definition: audit, folder: fixtureFolder, entry: 'audit.ts' });
    fixture.enable(workspaceA, '@acme/audit', { isolation: 'shared', requested: [{ name: 'kernel.admin' }], derived: { subscribes: [], providesLlm: [] } });
    const source = { source: 'npm:@acme/sample@1.0.0' };
    expect(problemOf(await command(fixture, 'kernel.extension.stage', source, plain, workspaceA))).toMatchObject({ code: 'CAPABILITY_DENIED' });
    expect(problemOf(await command(fixture, 'kernel.extension.install', { confirmationToken: 'x' }, plain, workspaceA))).toMatchObject({ code: 'CAPABILITY_DENIED' });
    expect(await command(fixture, 'kernel.extension.stage', source, admin, workspaceA)).toMatchObject({ ok: true, value: { name: '@acme/sample' } });
    await expect(sendAs(fixture, admin, 'kernel.extension.uninstall', { name: '@acme/sample' }, workspaceA)).rejects.toThrow('CALLER_NOT_ALLOWED');
  });

  it('M2.2-E37 boot deletes a left staging tree; a failed stage deletes its own', async () => {
    const home = temporaryHome();
    await prepareHome(home, installHostFixtures);
    mkdirSync(join(home, 'extensions', 'staging', 'left-behind', 'tree'), { recursive: true });
    const daemon = await bootFixture({ home });
    expect(readdirSync(join(home, 'extensions', 'staging'))).toEqual([]);
    await daemon.close();
    fixture = await openInstallFixture({ registry: registry.url });
    expect(problemOf(await command(fixture, 'kernel.extension.stage', { source: 'npm:@acme/sample@7.0.0' }))).toMatchObject({ code: 'EXT_SOURCE_INVALID' });
    expect(stagingTrees(fixture)).toEqual([]);
  });
});
