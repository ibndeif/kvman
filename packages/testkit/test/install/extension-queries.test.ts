import type { Capabilities, Json } from '@kvman/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { installed, installTests, openInstallFixture, person, type InstallFixture } from './harness.ts';
import { extensionSource, packPackage, writePackage } from './packages.ts';
import { startRegistry, type LocalRegistry } from './registries.ts';

let registry: LocalRegistry;
let fixture: InstallFixture | undefined;

beforeAll(async () => {
  registry = await startRegistry();
  for (const namespace of ['alpha', 'beta', 'gamma']) {
    for (const version of ['1.0.0', '1.1.0']) {
      await registry.publish(await packPackage(writePackage({ name: `@acme/${namespace}`, version, files: { 'dist/extension.js': extensionSource(`@acme/${namespace}`, namespace) } })));
    }
  }
});
afterAll(async () => {
  await registry.close();
});
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function query(current: InstallFixture, type: string, payload: Json): Promise<unknown> {
  return current.runtime.query({ sender: person, type, payload, cause: undefined, workspaceId: undefined });
}

const sandboxed: Capabilities = { isolation: 'sandboxed', requested: [], derived: { subscribes: [], providesLlm: [] } };

describe('kernel.extensions.list and kernel.extension.get (plan 03 §3.8, ADR 0119)', installTests, () => {
  it('M2.2-E47 the installed extensions with their status, enabled workspaces, and isolation', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const alpha = await installed(fixture, 'npm:@acme/alpha@1.0.0');
    fixture.enable(workspaceA, '@acme/alpha', sandboxed);
    const beta = await installed(fixture, 'npm:@acme/beta@1.0.0');
    const gamma = await installed(fixture, 'npm:@acme/gamma@1.0.0');
    fixture.connection.prepare("UPDATE extensions SET status = 'quarantined', quarantine_reason = 'HOST_FAILURES' WHERE name = '@acme/beta'").run();
    fixture.connection.prepare('UPDATE extensions SET pending_digest = ? WHERE name = ?').run('f'.repeat(64), '@acme/gamma');
    const listing = { title: 'Sample', description: 'A sample extension.', version: '1.0.0' };
    expect(await query(fixture, 'kernel.extensions.list', {})).toEqual({
      ok: true,
      value: [
        { ...listing, name: '@acme/alpha', namespace: 'alpha', activeDigest: alpha.digest, status: 'active', isolation: { [workspaceA]: 'sandboxed' }, enabledIn: [workspaceA] },
        { ...listing, name: '@acme/beta', namespace: 'beta', activeDigest: beta.digest, status: 'quarantined', quarantineReason: 'HOST_FAILURES', isolation: {}, enabledIn: [] },
        { ...listing, name: '@acme/gamma', namespace: 'gamma', activeDigest: gamma.digest, status: 'needs-approval', isolation: {}, enabledIn: [] },
      ],
    });
    expect(await query(fixture, 'kernel.extensions.list', { workspaceId: workspaceA })).toMatchObject({ ok: true, value: [{ name: '@acme/alpha' }] });
    expect(await query(fixture, 'kernel.extensions.list', { workspaceId: 'c'.repeat(64) })).toMatchObject({ ok: false, problem: { code: 'WORKSPACE_INVALID' } });
  });

  it('M2.2-E48 one extension: its versions newest first, its active manifest, and its grants', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const first = await installed(fixture, 'npm:@acme/alpha@1.0.0');
    fixture.enable(workspaceA, '@acme/alpha', sandboxed);
    fixture.timers.advance(1_000);
    const second = await installed(fixture, 'npm:@acme/alpha@1.1.0');
    const answer = await query(fixture, 'kernel.extension.get', { name: '@acme/alpha' });
    expect(answer).toMatchObject({
      ok: true,
      value: {
        versions: [{ digest: second.digest, version: '1.1.0', source: 'npm:@acme/alpha@1.1.0' }, { digest: first.digest, version: '1.0.0', source: 'npm:@acme/alpha@1.0.0' }],
        manifest: { meta: { name: '@acme/alpha', version: '1.0.0' } },
        grants: { [workspaceA]: sandboxed },
      },
    });
    expect(await query(fixture, 'kernel.extension.get', { name: '@acme/none' })).toMatchObject({ ok: false, problem: { code: 'NOT_FOUND', detail: 'no extension @acme/none is installed' } });
  });
});
