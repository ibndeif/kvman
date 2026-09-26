import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivedCapabilities, type Sender } from '@kvman/kernel';
import { jsonObjectSchema, workspaceOpenResultSchema, type Capabilities, type Isolation, type Json, type JsonObject, type ReplyPayload } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { installFixture } from '../install/fixture-snapshots.ts';
import { command, openInstallFixture, person, sendAs, type InstallFixture } from '../install/harness.ts';
import { workspaceA } from '../hosts/harness.ts';
import asker from './fixtures/extensions/asker.ts';
import desk from './fixtures/extensions/desk.ts';
import gate from './fixtures/extensions/gate.ts';
import pdfA from './fixtures/extensions/pdf-a.ts';
import pdfB from './fixtures/extensions/pdf-b.ts';
import reader from './fixtures/extensions/reader.ts';
import relay from './fixtures/extensions/relay.ts';
import steward from './fixtures/extensions/steward.ts';
import watcher from './fixtures/extensions/watcher.ts';

// Runtimes with worker threads and a real home folder.
export const workspaceTests = { timeout: 60_000 } as const;

const folder = fileURLToPath(new URL('./fixtures/extensions/', import.meta.url));

const fixtures: Array<{ definition: ExtensionDefinition; entry: string }> = [
  { definition: desk, entry: 'desk.ts' }, { definition: pdfA, entry: 'pdf-a.ts' }, { definition: pdfB, entry: 'pdf-b.ts' },
  { definition: reader, entry: 'reader.ts' }, { definition: watcher, entry: 'watcher.ts' }, { definition: asker, entry: 'asker.ts' },
  { definition: steward, entry: 'steward.ts' }, { definition: relay, entry: 'relay.ts' }, { definition: gate, entry: 'gate.ts' },
];

// Workspaces A and B, each with an empty applied preset (ADR 0124), and every workspace fixture installed, none enabled.
export async function openWorkspaceFixture(options: { home?: string } = {}): Promise<InstallFixture> {
  const fixture = await openInstallFixture(options.home === undefined ? {} : { home: options.home });
  for (const { definition, entry } of fixtures) await installFixture(fixture.connection, fixture.home, { definition, folder, entry });
  fixture.runtime.registry.refresh();
  return fixture;
}

// Exactly what an installed extension requests and derives, at the isolation given (05 §5.7).
export function grantsOf(fixture: InstallFixture, name: string, isolation: Isolation = 'sandboxed'): Capabilities {
  const manifest = fixture.runtime.registry.current().manifestOf(name);
  if (manifest === undefined) throw new Error(`${name} is not installed`);
  return { isolation, ...derivedCapabilities(manifest) };
}

export function enable(fixture: InstallFixture, workspaceId: string, name: string, grants: Capabilities = grantsOf(fixture, name), sender: Sender = person): Promise<ReplyPayload> {
  return command(fixture, 'kernel.extension.enable', { workspaceId, name, grants }, sender);
}

export function disable(fixture: InstallFixture, workspaceId: string, name: string, sender: Sender = person): Promise<ReplyPayload> {
  return command(fixture, 'kernel.extension.disable', { workspaceId, name }, sender);
}

// A command in a workspace, as the person sends it.
export function run(fixture: InstallFixture, type: string, payload: Json = {}, workspaceId: string = workspaceA): Promise<ReplyPayload> {
  return command(fixture, type, payload, person, workspaceId);
}

export function start(fixture: InstallFixture, type: string, payload: Json = {}, workspaceId: string = workspaceA): Promise<string> {
  return sendAs(fixture, person, type, payload, workspaceId);
}

export function valueOf(reply: ReplyPayload): Json {
  if (!reply.ok) throw new Error(`expected a value, got ${reply.problem.code}: ${reply.problem.detail ?? ''}`);
  return reply.value;
}

export function query(fixture: InstallFixture, type: string, payload: Json, sender: Sender = person, workspaceId?: string): Promise<unknown> {
  return fixture.runtime.query({ sender, type, payload, cause: undefined, workspaceId });
}

export function rows(fixture: InstallFixture, sql: string, ...parameters: Array<string | number>): Array<Record<string, unknown>> {
  return fixture.connection.prepare(sql).all(...parameters);
}

export function presetRow(fixture: InstallFixture, workspaceId: string = workspaceA): { revision: number; extensions: JsonObject } {
  const [row] = rows(fixture, 'SELECT preset, revision FROM workspace_presets WHERE workspace_id = ?', workspaceId);
  const preset = jsonObjectSchema.parse(JSON.parse(String(row?.['preset'])));
  return { revision: Number(row?.['revision']), extensions: jsonObjectSchema.parse(preset['extensions']) };
}

export function eventsOf(fixture: InstallFixture, type: string): Array<{ workspaceId: string | null; payload: Json }> {
  return rows(fixture, 'SELECT workspace_id, payload FROM events WHERE type = ? ORDER BY seq', type)
    .map((row) => ({ workspaceId: row['workspace_id'] === null ? null : String(row['workspace_id']), payload: jsonObjectSchema.parse(JSON.parse(String(row['payload']))) }));
}

export function temporaryFolder(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `kvman-${prefix}-`));
}

let submissions = 0;

// The code admission refused a command with, or `admitted`.
export async function admission(fixture: InstallFixture, type: string, payload: Json, sender: Sender = person, workspaceId: string | undefined = workspaceA): Promise<string> {
  submissions += 1;
  const submission = await fixture.runtime.submitCommand({ sender, idempotencyKey: `admission-${submissions}`, type, payload, ...(workspaceId === undefined ? {} : { workspaceId }) });
  return submission.ok ? 'admitted' : submission.problem.code;
}

// kernel.workspace.open as the person sends it; the new workspace's id.
export async function openFolderAsWorkspace(fixture: InstallFixture, path: string): Promise<string> {
  return workspaceOpenResultSchema.parse(valueOf(await run(fixture, 'kernel.workspace.open', { path }))).workspaceId;
}
