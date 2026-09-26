import { createUlidGenerator, Kernel, recordExtension, type InstalledExtension } from '@kvman/kernel';
import { defineExtension, z, type Ext } from '@kvman/sdk';
import { entryOf, ManualTimers, workspaceA, workspaceB } from '../hosts/harness.ts';
import { temporaryHome } from '../daemon/harness.ts';

export const correlationId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';
export const unknownWorkspace = 'c'.repeat(64);

const handle = async (): Promise<null> => null;
const input = z.object({});

function installed(namespace: string, setup: (ext: Ext) => void, quarantined = false): InstalledExtension {
  const name = `@acme/${namespace}`;
  const definition = defineExtension({ name, namespace, title: `The ${namespace} extension`, description: `Keeps ${namespace}.` }, setup);
  return { manifest: recordExtension(definition, { packageName: name, version: '1.0.0', correlationId }).manifest, quarantined };
}

// `@acme/files` is enabled in A only, with an internal command and a secret config field; `@acme/notes` in B only;
// `@acme/idle` nowhere; `@acme/broken` is quarantined.
export const extensions: InstalledExtension[] = [
  installed('files', (ext) => {
    ext.registerCommand('files.add', { description: 'Adds a file.', input, handle });
    ext.registerCommand('files.prune', { description: 'Prunes old files.', input, access: 'internal', handle });
    ext.registerConfig({ scope: 'workspace', schema: z.object({ token: z.string().describe('The API token.').meta({ secret: true }) }) });
  }),
  installed('notes', (ext) => ext.registerCommand('notes.add', { description: 'Adds a note.', input, handle })),
  installed('idle', (ext) => ext.registerCommand('idle.wait', { description: 'Waits.', input, handle })),
  installed('broken', (ext) => ext.registerCommand('broken.run', { description: 'Runs.', input, handle }), true),
];

export type SchemaFixture = { kernel: Kernel; port: number; close(): Promise<void> };

export async function bootSchemaFixture(): Promise<SchemaFixture> {
  const timers = new ManualTimers();
  const kernel = await Kernel.boot({
    home: temporaryHome(), extensions: { extensions, enabled: new Map([[workspaceA, ['@acme/files', '@acme/broken']], [workspaceB, ['@acme/notes']]]) },
    grants: { capabilities: () => undefined }, modules: { entry: entryOf }, poolSize: 1, ids: createUlidGenerator(Date.now), now: () => timers.time.value, timers,
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
