import { join } from 'node:path';
import { derivedCapabilities, packBuiltins, readBuiltinDigests, type LogRecord } from '@kvman/kernel';
import { jsonObjectSchema, type Json } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { temporaryHome } from '../daemon/harness.ts';
import { bootHome, type BootedHome } from '../first-run/builtins.ts';
import { workspaceA } from '../hosts/harness.ts';
import { applyTestPreset } from '../install/fixture-presets.ts';
import { closedRegistry } from '../install/fixture-snapshots.ts';
import { person } from '../install/harness.ts';
import { temporary, writePackage } from '../install/packages.ts';

const upgradeTests = { timeout: 240_000 } as const;

type Builtin = { name: string; version: string; body: string; extra?: string };

function source(builtin: Builtin): string {
  const namespace = builtin.name.slice('@acme/'.length);
  return `import { defineExtension, z } from '@kvman/sdk';
${builtin.extra ?? ''}
export default defineExtension({ name: '${builtin.name}', namespace: '${namespace}', title: 'Builtin', description: 'A builtin for the upgrade tests.' }, (ext) => {
  ext.registerCommand('${namespace}.put', { description: 'Stores a value.', input: z.object({}), handle: async (_input, ctx) => { ctx.store.kv.set('k', 'v'); return {}; } });
  ${builtin.body}
});
`;
}

// Builtin tarballs packed the way `pnpm build` packs extensions/* (ADR 0115).
async function packed(builtins: readonly Builtin[]): Promise<string> {
  const extensions = temporary('upgrade-extensions');
  for (const builtin of builtins) {
    writePackage({ name: builtin.name, version: builtin.version, files: { 'dist/extension.js': source(builtin) } }, join(extensions, builtin.name.slice('@acme/'.length)));
  }
  const builtin = join(temporary('upgrade-builtin'), 'builtin');
  await packBuiltins(extensions, builtin, { registry: closedRegistry, environment: process.env, kvmanVersion: '0.0.0' });
  return builtin;
}

const wrapStep = "ext.registerDataVersion(2, { migrations: [{ to: 2, up: async (m) => m.kv.each(({ value }) => ({ v: 2, value })) }] });";
const failingStep = "ext.registerDataVersion(2, { migrations: [{ to: 2, up: async () => { throw new Error('the step broke'); } }] });";

const firstRelease: Builtin[] = [
  { name: '@acme/first', version: '1.0.0', body: '' }, { name: '@acme/second', version: '1.0.0', body: '' },
  { name: '@acme/third', version: '1.0.0', body: '' }, { name: '@acme/fourth', version: '1.0.0', body: '' },
];

function nextRelease(firstStep: string): Builtin[] {
  return [
    { name: '@acme/first', version: '2.0.0', body: firstStep }, { name: '@acme/second', version: '2.0.0', body: '' },
    { name: '@acme/third', version: '2.0.0', body: "ext.requestCapability('process', { reason: 'Runs tools.' });" },
    { name: '@acme/fourth', version: '0.9.0', body: '' }, { name: '@acme/fifth', version: '1.0.0', body: '' },
  ];
}

let submissions = 0;

async function sent(booted: BootedHome, type: string, payload: Json, workspaceId?: string): Promise<Json> {
  submissions += 1;
  const submission = await booted.kernel.runtime.submitCommand({ sender: person, idempotencyKey: `upgrade-${submissions}`, type, payload, ...(workspaceId === undefined ? {} : { workspaceId }) });
  if (!submission.ok) throw new Error(`${type}: ${submission.problem.code}`);
  const reply = await booted.kernel.runtime.awaitReply(submission.id);
  if (!reply.ok) throw new Error(`${type}: ${reply.problem.code} ${reply.problem.detail ?? ''}`);
  return reply.value;
}

// A first run on the first release; first, third, and fourth enabled in A, and first's kv entry written. The recorded
// kvman version is then made older than the running kernel's.
async function upgradedHome(): Promise<string> {
  const home = temporaryHome();
  const booted = await bootHome(home, { builtin: await packed(firstRelease) });
  try {
    applyTestPreset(booted.kernel.connection, { workspaceId: workspaceA, path: '/w/a', name: 'A' });
    booted.kernel.runtime.registry.refresh();
    for (const name of ['@acme/first', '@acme/third', '@acme/fourth']) {
      const manifest = booted.kernel.runtime.registry.current().manifestOf(name);
      if (manifest === undefined) throw new Error(`${name} is not installed`);
      await sent(booted, 'kernel.extension.enable', { workspaceId: workspaceA, name, grants: { isolation: 'shared', ...derivedCapabilities(manifest) } });
    }
    await sent(booted, 'first.put', {}, workspaceA);
  } finally {
    await booted.close();
  }
  return home;
}

function recordOlderVersion(booted: BootedHome): void {
  booted.kernel.connection.prepare("UPDATE kernel_settings SET value = ? WHERE key = 'kvman.version'").run(JSON.stringify('0.0.0-0'));
}

function activeDigests(booted: BootedHome): Record<string, { active: unknown; pending: unknown }> {
  const found: Record<string, { active: unknown; pending: unknown }> = {};
  for (const row of booted.kernel.connection.prepare('SELECT name, active_digest, pending_digest FROM extensions ORDER BY name').all()) {
    found[String(row['name'])] = { active: row['active_digest'], pending: row['pending_digest'] };
  }
  return found;
}

describe('the upgrade boot path (plan 03 §3.9, ADRs 0089, 0145)', upgradeTests, () => {
  it('M2.7-E28 an upgrade boot installs newer builtins and activates higher versions', async () => {
    const home = await upgradedHome();
    const before = await bootHome(home);
    const oldDigests = activeDigests(before);
    recordOlderVersion(before);
    await before.close();
    const builtin = await packed(nextRelease(wrapStep));
    const bundled = await readBuiltinDigests(builtin);
    const digestOf = (name: string): string => bundled[name]?.digest ?? '';
    const booted = await bootHome(home, { builtin });
    try {
      const { connection } = booted.kernel;
      expect(activeDigests(booted)).toEqual({
        '@acme/fifth': { active: digestOf('@acme/fifth'), pending: null },
        '@acme/first': { active: digestOf('@acme/first'), pending: null },
        '@acme/fourth': { active: oldDigests['@acme/fourth']?.active, pending: null },
        '@acme/second': { active: digestOf('@acme/second'), pending: null },
        '@acme/third': { active: oldDigests['@acme/third']?.active, pending: digestOf('@acme/third') },
      });
      expect(connection.prepare("SELECT value FROM kv WHERE owner = '@acme/first'").all().map((row) => jsonObjectSchema.parse(JSON.parse(String(row['value']))))).toEqual([{ v: 2, value: 'v' }]);
      expect(connection.prepare("SELECT version FROM schema_versions WHERE owner = '@acme/first'").all()).toEqual([{ version: 2 }]);
      expect(connection.prepare("SELECT workspace_id FROM events WHERE type = 'kernel.extension.reloaded'").all()).toEqual([{ workspace_id: workspaceA }]);
      expect(connection.prepare("SELECT COUNT(*) AS count FROM extension_versions WHERE name = '@acme/fourth'").all()).toEqual([{ count: 2 }]);
      expect(connection.prepare("SELECT value FROM kernel_settings WHERE key = 'kvman.version'").all()).toEqual([{ value: JSON.stringify(booted.kernel.identity.version) }]);
    } finally {
      await booted.close();
    }
    const again = await bootHome(home, { builtin });
    try {
      expect(again.kernel.connection.prepare('SELECT COUNT(*) AS count FROM extension_versions').all()).toEqual([{ count: 9 }]);
      expect(again.kernel.connection.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'kernel.extension.reloaded'").all()).toEqual([{ count: 1 }]);
    } finally {
      await again.close();
    }
  });

  it('M2.7-E29 a builtin that fails at the upgrade boot is logged, and boot continues', async () => {
    const home = await upgradedHome();
    const before = await bootHome(home);
    const oldDigests = activeDigests(before);
    recordOlderVersion(before);
    await before.close();
    const builtin = await packed(nextRelease(failingStep));
    const logged: LogRecord[] = [];
    const booted = await bootHome(home, { builtin, logged });
    try {
      const bundled = await readBuiltinDigests(builtin);
      expect(activeDigests(booted)['@acme/first']).toEqual({ active: oldDigests['@acme/first']?.active, pending: null });
      expect(activeDigests(booted)['@acme/second']).toEqual({ active: bundled['@acme/second']?.digest, pending: null });
      expect(logged.filter((record) => record.level === 'warn').map((record) => record.fields)).toContainEqual({ extension: '@acme/first', code: 'MIGRATION_FAILED' });
      expect(booted.kernel.runtime.health().status).toBe('ok');
    } finally {
      await booted.close();
    }
  });
});
