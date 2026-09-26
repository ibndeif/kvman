import { fileURLToPath } from 'node:url';
import { createUlidGenerator, Kernel, type Connection } from '@kvman/kernel';
import { ManualTimers, workspaceA, workspaceB } from '../hosts/harness.ts';
import { temporaryHome } from '../daemon/harness.ts';
import { closedRegistry, installFixture, noBuiltins, prepareHome } from '../install/fixture-snapshots.ts';
import broken from './fixtures/extensions/broken.ts';
import files from './fixtures/extensions/files.ts';
import idle from './fixtures/extensions/idle.ts';
import notes from './fixtures/extensions/notes.ts';

export const unknownWorkspace = 'c'.repeat(64);

const folder = fileURLToPath(new URL('./fixtures/extensions/', import.meta.url));

// `@acme/files` is enabled in A only, with an internal command and a secret config field; `@acme/notes` in B only;
// `@acme/idle` nowhere; `@acme/broken` is quarantined.
async function installSchemaFixtures(connection: Connection, home: string): Promise<void> {
  await installFixture(connection, home, { definition: files, folder, entry: 'files.ts' });
  await installFixture(connection, home, { definition: notes, folder, entry: 'notes.ts' });
  await installFixture(connection, home, { definition: idle, folder, entry: 'idle.ts' });
  await installFixture(connection, home, { definition: broken, folder, entry: 'broken.ts' });
  connection.prepare("UPDATE extensions SET status = 'quarantined', quarantine_reason = 'HOST_FAILURES' WHERE name = '@acme/broken'").run();
}

export type SchemaFixture = { kernel: Kernel; port: number; close(): Promise<void> };

export async function bootSchemaFixture(): Promise<SchemaFixture> {
  const timers = new ManualTimers();
  const home = temporaryHome();
  await prepareHome(home, installSchemaFixtures);
  const kernel = await Kernel.boot({
    home, enabled: new Map([[workspaceA, ['@acme/files', '@acme/broken']], [workspaceB, ['@acme/notes']]]), grants: { capabilities: () => undefined },
    builtin: noBuiltins(home), npmRegistry: closedRegistry, environment: {}, poolSize: 1, ids: createUlidGenerator(Date.now), now: () => timers.time.value, timers,
    openLogger: () => ({ write: () => undefined, close: () => undefined }), defaultLocale: () => 'en',
  });
  const insert = kernel.connection.prepare('INSERT INTO workspaces (id, path, name, created_at) VALUES (?, ?, ?, ?)');
  insert.run(workspaceA, '/w/a', 'A', 1);
  insert.run(workspaceB, '/w/b', 'B', 1);
  return {
    kernel, port: kernel.identity.port,
    close: async () => {
      const stopped = kernel.shutdown();
      timers.advance(10_000);
      await stopped;
    },
  };
}
