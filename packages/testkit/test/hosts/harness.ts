import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  betterSqlite3Driver, createUlidGenerator, KernelRuntime, openKernelDatabase, recordExtension,
  type AdapterCommand, type Connection, type KernelIdentity, type LiveFrame, type LogRecord, type RegistryInput, type SchedulerTimers, type TimerHandle,
} from '@kvman/kernel';
import type { Capabilities, Json, JsonObject, Manifest, ReplyPayload } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { expect, vi } from 'vitest';
import audit from './fixtures/extensions/audit.ts';
import counter from './fixtures/extensions/counter.ts';
import drift from './fixtures/extensions/drift.ts';
import notes from './fixtures/extensions/notes.ts';

export const workspaceA = 'a'.repeat(64);
export const workspaceB = 'b'.repeat(64);
export const correlationId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';

// Tests with real worker threads pay for thread start and module load, which a loaded machine slows down.
export const workerTests = { timeout: 30_000 } as const;

// Scheduler wake-ups the test fires by moving the kernel's clock (retry backoffs); handlers keep real time.
export class ManualTimers implements SchedulerTimers {
  readonly time = { value: 1_790_000_000_000 };
  readonly #timers: Array<{ at: number; fire: () => void; cancelled: boolean }> = [];

  set(delayMs: number, fire: () => void): TimerHandle {
    const timer = { at: this.time.value + delayMs, fire, cancelled: false };
    this.#timers.push(timer);
    return { cancel: () => { timer.cancelled = true; } };
  }

  advance(milliseconds: number): void {
    const target = this.time.value + milliseconds;
    for (let due = this.#next(target); due !== undefined; due = this.#next(target)) {
      this.time.value = due.at;
      due.cancelled = true;
      due.fire();
    }
    this.time.value = target;
  }

  #next(target: number): { at: number; fire: () => void; cancelled: boolean } | undefined {
    return this.#timers.filter((timer) => !timer.cancelled && timer.at <= target).sort((left, right) => left.at - right.at)[0];
  }
}

type Fixture = { definition: ExtensionDefinition; file: string };

const fixtures: Record<string, Fixture> = {
  '@acme/notes': { definition: notes, file: 'notes.ts' },
  '@acme/counter': { definition: counter, file: 'counter.ts' },
  '@acme/audit': { definition: audit, file: 'audit.ts' },
  '@acme/drift': { definition: drift, file: 'drift.ts' },
};

export function entryOf(extension: string): string {
  const fixture = fixtures[extension];
  if (fixture === undefined) throw new Error(`no fixture ${extension}`);
  return fileURLToPath(new URL(`./fixtures/extensions/${fixture.file}`, import.meta.url));
}

function manifestOf(extension: string): Manifest {
  const fixture = fixtures[extension];
  if (fixture === undefined) throw new Error(`no fixture ${extension}`);
  const { manifest } = recordExtension(fixture.definition, { packageName: fixture.definition.meta.name, version: '1.0.0', correlationId });
  if (extension !== '@acme/drift') return manifest;
  return { ...manifest, types: manifest.types.map((entry) => ({ ...entry, description: 'Changed after recording.' })) };
}

export const defaultGrants: Record<string, Capabilities> = {
  '@acme/notes': { isolation: 'shared', requested: [{ name: 'calls', types: ['counter.*'] }], derived: { subscribes: [], providesLlm: [] } },
  '@acme/audit': { isolation: 'shared', requested: [], derived: { subscribes: ['notes.added', 'notes.touched'], providesLlm: [] }, },
};

export type HostFixture = {
  runtime: KernelRuntime;
  connection: Connection;
  databaseFile: string;
  grants: Record<string, Capabilities>;
  timers: ManualTimers;
  logged: LogRecord[];
  live: LiveFrame[];
  shutdownRequests: { count: number };
  close(): Promise<void>;
};

export function registryInput(): RegistryInput {
  const names = Object.keys(fixtures);
  return {
    extensions: names.map((name) => ({ manifest: manifestOf(name), quarantined: false })),
    enabled: new Map([[workspaceA, names], [workspaceB, names]]),
  };
}

type Shared = Pick<HostFixture, 'connection' | 'databaseFile' | 'grants' | 'timers' | 'logged' | 'live' | 'shutdownRequests'> & { poolSize: number };

async function startRuntime(shared: Shared): Promise<HostFixture> {
  const ids = createUlidGenerator(Date.now);
  const { connection, databaseFile, grants, timers, logged, live, shutdownRequests } = shared;
  const runtime = new KernelRuntime({
    databaseFile, connection, extensions: registryInput(), ids, now: () => timers.time.value, timers, poolSize: shared.poolSize,
    grants: { capabilities: (extension) => grants[extension] }, modules: { entry: entryOf }, logger: { write: (record) => logged.push(record) },
    defaultLocale: () => 'en', identity: fixtureIdentity(databaseFile, timers.time.value),
    requestShutdown: () => {
      shutdownRequests.count += 1;
    },
  });
  runtime.live.subscribe((frame) => live.push(frame));
  await runtime.start();
  return {
    runtime, connection, databaseFile, grants, timers, logged, live, shutdownRequests,
    close: async () => {
      await runtime.stop();
      connection.close();
    },
  };
}

// A runtime without a daemon still answers kernel.health.get; the daemon passes its lock's identity (ADR 0088).
function fixtureIdentity(databaseFile: string, startedAt: number): KernelIdentity {
  return { version: '0.0.0', instanceId: '0b5c7f2e-4a1d-4c3b-9e8f-1a2b3c4d5e6f', processStart: 'Thu Sep 25 10:00:00 2026', port: 4173, home: dirname(databaseFile), startedAt };
}

export function openHostFixture(options: { poolSize?: number } = {}): Promise<HostFixture> {
  const databaseFile = join(mkdtempSync(join(tmpdir(), 'kvman-hosts-')), 'kvman.db');
  const connection = openKernelDatabase(databaseFile, betterSqlite3Driver, createUlidGenerator(Date.now).next());
  connection.prepare('INSERT INTO workspaces (id, path, name, created_at) VALUES (?, ?, ?, ?)').run(workspaceA, '/w/a', 'A', 1);
  const shared = { connection, databaseFile, grants: { ...defaultGrants }, timers: new ManualTimers(), logged: [], live: [], shutdownRequests: { count: 0 } };
  return startRuntime({ ...shared, poolSize: options.poolSize ?? 1 });
}

// A kernel restart on the same database and clock: the runtime stops, and a new one rebuilds from SQLite (03 §3.9).
// Stopping without a drain leaves running rows as a crash does, so the new runtime recovers them (ADR 0091).
export async function restartRuntime(fixture: HostFixture): Promise<HostFixture> {
  await fixture.runtime.stop();
  const timers = new ManualTimers();
  timers.time.value = fixture.timers.time.value;
  return startRuntime({ ...fixture, timers, poolSize: 1 });
}

let keys = 0;

export async function send(fixture: HostFixture, type: string, payload: Json = {}, extra: Partial<AdapterCommand> = {}): Promise<string> {
  keys += 1;
  const submission = await fixture.runtime.submitCommand({ sender: { address: 'user:local' }, workspaceId: workspaceA, idempotencyKey: `key-${keys}`, type, payload, ...extra });
  if (!submission.ok) throw new Error(`${type} was not admitted: ${submission.problem.code}`);
  return submission.id;
}

export async function run(fixture: HostFixture, type: string, payload: Json = {}, extra: Partial<AdapterCommand> = {}): Promise<ReplyPayload> {
  return fixture.runtime.awaitReply(await send(fixture, type, payload, extra));
}

export async function value(fixture: HostFixture, type: string, payload: Json = {}): Promise<Json> {
  const reply = await run(fixture, type, payload);
  if (!reply.ok) throw new Error(`${type} failed: ${reply.problem.code}`);
  return reply.value;
}

export function row(fixture: HostFixture, id: string): Record<string, unknown> {
  const found = fixture.connection.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  if (found === undefined) throw new Error(`no row ${id}`);
  return found;
}

export function rows(fixture: HostFixture, sql: string, ...values: Array<string | number>): Array<Record<string, unknown>> {
  return fixture.connection.prepare(sql).all(...values);
}

export function kv(fixture: HostFixture, owner: string, key: string): unknown {
  const found = fixture.connection.prepare('SELECT value FROM kv WHERE owner = ? AND key = ?').get(owner, key);
  return found === undefined ? undefined : JSON.parse(String(found['value']));
}

export function replyOf(fixture: HostFixture, id: string): unknown {
  const stored = row(fixture, id)['result'];
  return typeof stored === 'string' ? JSON.parse(stored) : undefined;
}

// Workers run on their own threads: a state change they cause is awaited, never slept for.
export async function eventually(check: () => void): Promise<void> {
  await vi.waitFor(check, { timeout: 10_000, interval: 5 });
}

export async function pendingWithAttempts(fixture: HostFixture, id: string, attempts: number): Promise<void> {
  await eventually(() => expect(row(fixture, id)).toMatchObject({ state: 'pending', attempts }));
}

export function problemCode(reply: ReplyPayload): string {
  return reply.ok ? 'ok' : reply.problem.code;
}

export function objectOf(value: Json): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected a JSON object');
  return value;
}
