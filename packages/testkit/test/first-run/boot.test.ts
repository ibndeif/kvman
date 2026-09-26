import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { betterSqlite3Driver, createUlidGenerator, openKernelDatabase, ProblemError } from '@kvman/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { temporaryHome } from '../daemon/harness.ts';
import { enabledWorkspaces, eventually, installHostFixtures, workspaceA } from '../hosts/harness.ts';
import { prepareHome } from '../install/fixture-snapshots.ts';
import { command, installed, installTests, openInstallFixture, person, problemOf, sharedGrants as installGrants } from '../install/harness.ts';
import { packPackage, samplePackage, writePackage } from '../install/packages.ts';
import { startRegistry, type LocalRegistry } from '../install/registries.ts';
import { bootHome, builtinNames, packedBuiltins } from './builtins.ts';

let registry: LocalRegistry;

beforeAll(async () => {
  registry = await startRegistry();
  await registry.publish(await packPackage(writePackage(samplePackage())));
});
afterAll(async () => {
  await registry.close();
});

function readRows(home: string, sql: string): Array<Record<string, unknown>> {
  const connection = openKernelDatabase(join(home, 'kvman.db'), betterSqlite3Driver, createUlidGenerator(Date.now).next());
  try {
    return connection.prepare(sql).all();
  } finally {
    connection.close();
  }
}

// Changes one byte of an installed fixture's entry module.
function tamper(home: string, name: string, file: string): void {
  const [row] = readRows(home, `SELECT active_digest FROM extensions WHERE name = '${name}'`);
  appendFileSync(join(home, 'extensions', 'snapshots', String(row?.['active_digest']), 'node_modules', name, file), ' ');
}

describe('snapshots at boot (plan 03 §3.9 steps 4–5, 06 §6.5, 06 §6.9)', installTests, () => {
  it('M2.2-H3 a tampered snapshot is quarantined', async () => {
    const home = temporaryHome();
    await prepareHome(home, installHostFixtures);
    tamper(home, '@acme/counter', 'counter.js');
    const booted = await bootHome(home, { enabled: enabledWorkspaces() });
    try {
      expect(booted.kernel.connection.prepare("SELECT name, quarantine_reason FROM extensions WHERE status = 'quarantined'").all()).toEqual([{ name: '@acme/counter', quarantine_reason: 'EXT_INTEGRITY' }]);
      expect(booted.kernel.connection.prepare("SELECT payload FROM events WHERE type = 'kernel.extension.quarantined'").all()).toEqual([{ payload: JSON.stringify({ name: '@acme/counter', reason: 'EXT_INTEGRITY' }) }]);
      expect(booted.kernel.runtime.health().status).toBe('degraded');
      booted.kernel.connection.prepare('INSERT INTO workspaces (id, path, name, created_at) VALUES (?, ?, ?, ?)').run(workspaceA, '/w/a', 'A', 1);
      const submission = await booted.kernel.runtime.submitCommand({ sender: person, idempotencyKey: 'h3', type: 'counter.increment', payload: {}, workspaceId: workspaceA });
      expect(submission.ok ? 'admitted' : submission.problem.code).toBe('HANDLER_UNAVAILABLE');
      expect(booted.kernel.runtime.hosts.workers().some((worker) => worker.loaded.has('@acme/counter'))).toBe(false);
    } finally {
      await booted.close();
    }
  });

  it('M2.2-E42 a snapshot tampered with before its first load fails that message and quarantines the extension', async () => {
    const fixture = await openInstallFixture({ registry: registry.url, enabled: [[workspaceA, ['@acme/sample']]] });
    fixture.grants['@acme/sample'] = installGrants;
    try {
      const { digest } = await installed(fixture, 'npm:@acme/sample@1.0.0');
      appendFileSync(join(fixture.home, 'extensions', 'snapshots', digest, 'node_modules', '@acme', 'sample', 'dist', 'extension.js'), ' ');
      expect(problemOf(await command(fixture, 'sample.echo', { text: 'x' }, person, workspaceA))).toMatchObject({ code: 'EXT_INTEGRITY' });
      await eventually(() => expect(fixture.connection.prepare("SELECT status, quarantine_reason FROM extensions WHERE name = '@acme/sample'").get()).toEqual({ status: 'quarantined', quarantine_reason: 'EXT_INTEGRITY' }));
    } finally {
      await fixture.close();
    }
  });

  it('M2.2-E43 boot does not rehash an extension that is not enabled', async () => {
    const home = temporaryHome();
    await prepareHome(home, installHostFixtures);
    tamper(home, '@acme/audit', 'audit.js');
    const booted = await bootHome(home, { enabled: new Map([[workspaceA, ['@acme/notes', '@acme/counter']]]) });
    try {
      expect(booted.kernel.connection.prepare("SELECT name FROM extensions WHERE status = 'quarantined'").all()).toEqual([]);
    } finally {
      await booted.close();
    }
  });

  it('M2.2-E44 an installed extension routes and runs after a restart', async () => {
    const home = join(temporaryHome(), 'home');
    const fixture = await openInstallFixture({ registry: registry.url, home });
    await installed(fixture, 'npm:@acme/sample@1.0.0');
    await fixture.close();
    const booted = await bootHome(home, { enabled: new Map([[workspaceA, ['@acme/sample']]]) });
    try {
      const submission = await booted.kernel.runtime.submitCommand({ sender: person, idempotencyKey: 'e44', type: 'sample.echo', payload: { text: 'again' }, workspaceId: workspaceA });
      if (!submission.ok) throw new Error(submission.problem.code);
      expect(await booted.kernel.runtime.awaitReply(submission.id)).toEqual({ ok: true, value: { text: 'again' } });
    } finally {
      await booted.close();
    }
  });

  it('M2.2-E45 a second boot installs no builtin again', async () => {
    const builtin = await packedBuiltins();
    const home = temporaryHome();
    await (await bootHome(home, { builtin })).close();
    const first = readRows(home, 'SELECT name, digest, installed_at FROM extension_versions ORDER BY name');
    expect(first.map((row) => row['name'])).toEqual(builtinNames);
    await (await bootHome(home, { builtin })).close();
    expect(readRows(home, 'SELECT name, digest, installed_at FROM extension_versions ORDER BY name')).toEqual(first);
  });

  it('M2.2-E46 a first run whose builtin does not match digests.json refuses to start and leaves no database', async () => {
    const builtin = await packedBuiltins();
    const digests = join(builtin, 'digests.json');
    writeFileSync(digests, readFileSync(digests, 'utf8').replace(/"digest": "[0-9a-f]{64}"/, `"digest": "${'0'.repeat(64)}"`));
    const home = temporaryHome();
    const refused = await bootHome(home, { builtin }).then(() => undefined, (error: unknown) => error);
    expect(refused).toBeInstanceOf(ProblemError);
    expect(refused instanceof ProblemError ? refused.problem : undefined).toMatchObject({ code: 'EXT_SOURCE_INVALID', detail: 'the builtin @acme/first does not match digests.json' });
    for (const file of ['kvman.db', 'kvman.db-wal', 'daemon.lock']) expect(existsSync(join(home, file))).toBe(false);
  });
});
