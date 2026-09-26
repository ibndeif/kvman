import type { Message, StoreRead } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultReadPoolSize, ReadPool, readThreadStarter, serveStoreRead, type ActiveInvocation, type HostThread, type PoolWorker, type StoreReadOutcome,
} from '../../src/index.ts';
import { invocationMessage, openTestStore, workspaceId, type TestStore } from '../storage/harness.ts';

const pools: ReadPool[] = [];
afterEach(() => {
  for (const pool of pools.splice(0)) pool.close();
});

function poolOf(store: TestStore, size: number): ReadPool {
  const pool = new ReadPool(size, readThreadStarter(store.file));
  pools.push(pool);
  return pool;
}

function workerWith(thread: Partial<HostThread>): PoolWorker {
  return {
    id: 1, host: 'sandboxed:@acme/a:1', inFlight: 1, loaded: new Set(), idle: undefined,
    thread: { identity: { pid: 1, threadId: 0 }, post: () => undefined, terminate: () => undefined, ...thread },
  };
}

function invocationOf(message: Message, worker: PoolWorker): ActiveInvocation {
  return { id: 'invocation', worker, live: new Map(), claim: { message, extension: '@acme/a', handler: 'command:a.run', attempt: 1, stored: true, deadlineAt: Number.MAX_SAFE_INTEGER } };
}

function valueOf(outcome: StoreReadOutcome): unknown {
  return outcome.ok ? JSON.parse(new TextDecoder().decode(outcome.value)) : outcome.problem.code;
}

function kvRow(store: TestStore, owner: string, ws: string, value: string): void {
  store.connection.prepare('INSERT INTO kv (owner, ws, key, value, version, updated_at) VALUES (?, ?, ?, ?, 1, 0)').run(owner, ws, 'k', JSON.stringify(value));
}

const workspaceRead: StoreRead = { op: 'kv.get', scope: 'workspace', key: 'k' };
const globalRead: StoreRead = { op: 'kv.get', scope: 'global', key: 'k' };

describe('the read pool (plan 04 §4.1, ADR 0131)', () => {
  it('M2.4-E20 the kernel chooses the owner and workspace of every pool read', async () => {
    const store = openTestStore({ 'a.run': '@acme/a' });
    kvRow(store, '@acme/a', workspaceId, 'a in A');
    kvRow(store, '@acme/a', '', 'a global');
    kvRow(store, '@acme/b', workspaceId, 'b in A');
    kvRow(store, '@acme/a', 'b'.repeat(64), 'a in B');
    const pool = poolOf(store, 1);
    const worker = workerWith({ postValue: () => undefined });
    const { workspaceId: _stored, ...global } = await invocationMessage(store, 'a.run');
    const inWorkspace = invocationOf({ ...global, workspaceId }, worker);
    expect(valueOf(await serveStoreRead(pool, worker, inWorkspace, workspaceRead))).toEqual({ value: 'a in A', version: 1 });
    expect(valueOf(await serveStoreRead(pool, worker, inWorkspace, globalRead))).toEqual({ value: 'a global', version: 1 });
    expect(valueOf(await serveStoreRead(pool, worker, invocationOf(global, worker), workspaceRead))).toBe('WORKSPACE_INVALID');
  });

  it('M2.4-E21 shared and dedicated hosts do not read through the pool', async () => {
    const store = openTestStore({ 'a.run': '@acme/a' });
    const worker = workerWith({});
    const message = { ...(await invocationMessage(store, 'a.run')), workspaceId };
    expect(valueOf(await serveStoreRead(poolOf(store, 1), worker, invocationOf(message, worker), workspaceRead))).toBe('CAPABILITY_DENIED');
  });

  it('M2.4-E22 the pool runs readPoolSize threads, started when first needed', async () => {
    const store = openTestStore();
    kvRow(store, '@acme/a', '', 'a global');
    for (const [size, threads] of [[defaultReadPoolSize, 2], [1, 1]] as const) {
      const pool = poolOf(store, size);
      expect(pool.threadCount()).toBe(0);
      const answers = await Promise.all([pool.read('@acme/a', '', globalRead), pool.read('@acme/a', '', globalRead)]);
      expect(pool.threadCount()).toBe(threads);
      expect(answers.map((answer) => (answer.ok ? JSON.parse(new TextDecoder().decode(answer.value)) : answer.code))).toEqual([
        { value: 'a global', version: 1 }, { value: 'a global', version: 1 },
      ]);
    }
  });
});
