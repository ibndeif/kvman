import { spawn } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Message } from '@kvman/protocol';
import { vi } from 'vitest';
import {
  BlobStore, groupAlive, inertFaults, insertWorkspace, JobTokens, LiveBus, ProcessCalls, ProcessSupervisor, type ActiveInvocation, type Claim, type LogRecord, type PoolWorker,
} from '../../src/index.ts';
import { fakeThreads } from '../hosts/fake-threads.ts';
import { causeMessage, openRouterFixture, workspaceA, type RouterFixture } from '../router/harness.ts';
import { ManualTimers } from '../scheduler/doubles.ts';
import { now, temporaryBlobFiles, ulids } from '../storage/harness.ts';

export type ProcessFixture = RouterFixture & {
  home: string;
  root: string;
  store: BlobStore;
  timers: ManualTimers;
  tokens: JobTokens;
  supervisor: ProcessSupervisor;
  calls: ProcessCalls;
  logged: LogRecord[];
  worker: PoolWorker;
};

export function temporaryFolder(prefix: string): string {
  return realpathSync.native(mkdtempSync(join(tmpdir(), `kvman-${prefix}-`)));
}

// The router fixture with a supervisor, the process calls, a real workspace folder for A, and a manual clock.
export function openProcessFixture(): ProcessFixture {
  const fixture = openRouterFixture();
  const home = temporaryFolder('process-home');
  const root = temporaryFolder('process-workspace');
  insertWorkspace(fixture.connection, { workspaceId: workspaceA, path: root, name: 'A' }, now());
  const store = new BlobStore({ connection: fixture.connection, files: temporaryBlobFiles(), now, faults: inertFaults });
  const timers = new ManualTimers({ value: now() });
  const tokens = new JobTokens();
  const logged: LogRecord[] = [];
  const supervisor = new ProcessSupervisor({
    home, connection: fixture.connection, pipeline: fixture.pipeline, store, live: new LiveBus(), tokens, environment: process.env, timers, now,
    logger: { write: (record) => logged.push(record) }, faults: inertFaults,
  });
  const calls = new ProcessCalls({ connection: fixture.connection, registry: () => fixture.registry, grants: fixture.grants, supervisor, tokens, ids: ulids, home });
  const { start } = fakeThreads();
  const worker: PoolWorker = { id: 1, host: 'shared', thread: start({ frame: () => undefined, failed: () => undefined, exit: () => undefined }), inFlight: 0, loaded: new Set(), idle: undefined };
  return { ...fixture, home, root, store, timers, tokens, supervisor, calls, logged, worker };
}

export function grantProcess(fixture: ProcessFixture, extension: string): void {
  fixture.grants.grant(extension, workspaceA, { requested: [{ name: 'process' }] });
}

export async function invocationOf(fixture: ProcessFixture, extension: string, type: string): Promise<ActiveInvocation> {
  const message: Message = await causeMessage(fixture, type);
  const claim: Claim = { message, extension, handler: `command:${type}`, attempt: 1, stored: true, deadlineAt: now() + 60_000 };
  return { id: ulids.next(), claim, worker: fixture.worker, live: new Map(), received: new Set() };
}

// A process group the test starts itself, outside the supervisor.
export function startedGroup(): number {
  const child = spawn('sleep', ['1000'], { detached: true, stdio: 'ignore' });
  child.unref();
  if (child.pid === undefined) throw new Error('sleep did not start');
  return child.pid;
}

export async function gone(pid: number): Promise<void> {
  await vi.waitFor(() => {
    if (groupAlive(pid)) throw new Error(`process group ${pid} is still alive`);
  }, { timeout: 10_000, interval: 10 });
}
