import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createConnection } from 'node:net';
import { basename, join } from 'node:path';
import { groupAlive, socketPathOf, SocketAdapter, workspaceIdOf, writeKvShim, type Sender } from '@kvman/kernel';
import { processesListResultSchema, type Isolation, type Json, type JsonObject, type ProcessesListResult } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { expect, vi } from 'vitest';
import { applyTestPreset } from '../install/fixture-presets.ts';
import { installFixture } from '../install/fixture-snapshots.ts';
import { command, openInstallFixture, person, sendAs, type InstallFixture } from '../install/harness.ts';
import { grantsOf, query, rows, temporaryFolder, valueOf } from '../workspaces/harness.ts';
import delegator from './fixtures/extensions/delegator.ts';
import runner from './fixtures/extensions/runner.ts';
import target from './fixtures/extensions/target.ts';

export const processTests = { timeout: 60_000 } as const;

const folder = new URL('./fixtures/extensions/', import.meta.url).pathname;

const fixtures: Array<{ definition: ExtensionDefinition; entry: string }> = [
  { definition: runner, entry: 'runner.ts' }, { definition: target, entry: 'target.ts' }, { definition: delegator, entry: 'delegator.ts' },
];

export type ProcessesFixture = InstallFixture & { root: string; workspaceId: string; socket: string; close(): Promise<void> };

export type ProcessesOptions = { isolation?: Isolation };

// A real folder as workspace A, with Runner, Target, and Delegator installed and enabled there, kernel.sock served
// on <home>/kernel.sock, and the kv shim in <home>/bin, as the daemon does at start (ADRs 0140, 0141).
export async function openProcessesFixture(options: ProcessesOptions = {}): Promise<ProcessesFixture> {
  const root = realpathSync.native(temporaryFolder('workspace'));
  const fixture = await openInstallFixture();
  for (const { definition, entry } of fixtures) await installFixture(fixture.connection, fixture.home, { definition, folder, entry });
  const workspaceId = workspaceIdOf(root);
  applyTestPreset(fixture.connection, { workspaceId, path: root, name: basename(root) });
  fixture.runtime.registry.refresh();
  for (const { definition } of fixtures) fixture.enable(workspaceId, definition.meta.name, grantsOf(fixture, definition.meta.name, options.isolation ?? 'sandboxed'));
  writeKvShim(fixture.home);
  const socket = socketPathOf(fixture.home);
  const adapter = new SocketAdapter({ path: socket, requests: fixture.runtime.socket, logger: { write: (record) => fixture.logged.push(record) }, ids: { next: () => `socket-${Date.now()}` } });
  await adapter.listen();
  return {
    ...fixture, root, workspaceId, socket,
    close: async () => {
      await adapter.close();
      await fixture.close();
    },
  };
}

export function objectOf(value: Json | undefined): JsonObject {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) throw new Error(`expected an object, got ${JSON.stringify(value)}`);
  return value;
}

// runner.run (or another Runner command) as the person in A: `{ value }` or `{ code, params? }`.
export async function runAs(fixture: ProcessesFixture, type: string, payload: JsonObject, sender: Sender = person): Promise<JsonObject> {
  return objectOf(valueOf(await command(fixture, type, payload, sender, fixture.workspaceId)));
}

export async function spawned(fixture: ProcessesFixture, spawn: JsonObject, extra: JsonObject = {}): Promise<JsonObject> {
  const answer = await runAs(fixture, 'runner.run', { spawn, ...extra });
  if (!('value' in answer)) throw new Error(`the spawn failed: ${JSON.stringify(answer)}`);
  return objectOf(answer['value']);
}

export async function sent(fixture: ProcessesFixture, type: string, payload: JsonObject): Promise<string> {
  return sendAs(fixture, person, type, payload, fixture.workspaceId);
}

export function processRow(fixture: ProcessesFixture, processId: string): Record<string, unknown> {
  const [row] = rows(fixture, 'SELECT * FROM processes WHERE id = ?', processId);
  if (row === undefined) throw new Error(`no process ${processId}`);
  return row;
}

export function pidOf(fixture: ProcessesFixture, processId: string): number {
  return Number(processRow(fixture, processId)['pid']);
}

// What Runner's onExit command recorded, read with its own query.
export async function exitsRecorded(fixture: ProcessesFixture): Promise<JsonObject[]> {
  const answer = objectOf(await queried(fixture, 'runner.exits.list', {}));
  const value = answer['value'];
  return Array.isArray(value) ? value.map(objectOf) : [];
}

export async function queried(fixture: ProcessesFixture, type: string, payload: JsonObject, sender: Sender = person): Promise<Json> {
  const answer = await query(fixture, type, payload, sender, fixture.workspaceId);
  return JSON.parse(JSON.stringify(answer));
}

export async function processesListed(fixture: ProcessesFixture, payload: JsonObject, sender: Sender = person): Promise<ProcessesListResult> {
  const answer = objectOf(await queried(fixture, 'kernel.processes.list', payload, sender));
  if (answer['ok'] !== true) throw new Error(`kernel.processes.list failed: ${JSON.stringify(answer)}`);
  return processesListResultSchema.parse(answer['value']);
}

export async function gone(pid: number): Promise<void> {
  await vi.waitFor(() => expect(groupAlive(pid), `process group ${pid}`).toBe(false), { timeout: 15_000, interval: 10 });
}

export async function ended(fixture: ProcessesFixture, processId: string): Promise<Record<string, unknown>> {
  return vi.waitFor(() => {
    const row = processRow(fixture, processId);
    expect(row['state']).not.toBe('running');
    return row;
  }, { timeout: 15_000, interval: 10 });
}

export async function logShows(fixture: ProcessesFixture, processId: string, text: string): Promise<void> {
  const path = join(fixture.home, 'jobs', `${processId}.log`);
  await vi.waitFor(() => expect(existsSync(path) && readFileSync(path, 'utf8').includes(text), `${path} shows ${text}`).toBe(true), { timeout: 15_000, interval: 10 });
}

// One raw request on kernel.sock, as a process would send it.
export function socketRequest(socket: string, line: string): Promise<JsonObject> {
  return new Promise((resolve, reject) => {
    const connection = createConnection(socket);
    const chunks: Buffer[] = [];
    connection.on('data', (chunk: Buffer) => chunks.push(chunk));
    connection.on('error', reject);
    connection.on('end', () => resolve(objectOf(JSON.parse(Buffer.concat(chunks).toString('utf8')))));
    connection.end(line.endsWith('\n') ? line : `${line}\n`);
  });
}

export type TokenProcess = { processId: string; token: string };

const printsToken = { command: 'sh', args: ['-c', 'printf "token=%s\\n" "$KVMAN_TOKEN"; sleep 1000'], detached: true, onExit: 'runner.finish' };

// A detached process that prints its job token and keeps it alive, spawned by `type` (runner.run, or delegator.start
// for a delegated token) as `sender`; the token is read from its log.
export async function tokenProcess(fixture: ProcessesFixture, token: JsonObject, type = 'runner.run', sender: Sender = person): Promise<TokenProcess> {
  const answer = await runAs(fixture, type, { spawn: { ...printsToken, token } }, sender);
  const spawnedBy = type === 'runner.run' ? answer['value'] : objectOf(answer['value'])['value'];
  const processId = String(objectOf(spawnedBy)['processId']);
  await logShows(fixture, processId, '\n');
  const line = readFileSync(join(fixture.home, 'jobs', `${processId}.log`), 'utf8').split('\n')[0] ?? '';
  return { processId, token: line.slice('token='.length) };
}

export function frame(token: string, request: JsonObject): string {
  return JSON.stringify({ token, ...request });
}
