import type { Message } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import {
  betterSqlite3Driver, HostFailures, HostManager, KernelRegistry, openKernelDatabase, RecordedValueStore,
  type ActiveInvocation, type Claim, type InvocationSink, type LogRecord,
} from '../../src/index.ts';
import { command, manifest, workspaceA } from '../registry/manifests.ts';
import { temporaryDatabaseFile, ulids } from '../storage/harness.ts';
import { fakeThreads } from './fake-threads.ts';

const notes = manifest('@acme/notes', 'notes', { types: [command('notes.add')] });

function claimFor(id: string): Claim {
  const message: Message = {
    v: 1, id, kind: 'command', type: 'notes.add', source: 'user:local', workspaceId: workspaceA, payload: { secret: 'x' },
    correlationId: id, context: { locale: 'en' }, priority: 'interactive', createdAt: 1,
  };
  return { message, extension: '@acme/notes', handler: 'command:notes.add', attempt: 1, stored: true, deadlineAt: 60_001 };
}

describe('host frames (ADR 0076)', () => {
  it('M1.6-E34 an invalid frame is the loss of its worker, logged without its content', () => {
    const connection = openKernelDatabase(temporaryDatabaseFile(), betterSqlite3Driver, ulids.next());
    connection.prepare('INSERT INTO workspaces (id, path, name, created_at) VALUES (?, ?, ?, ?)').run(workspaceA, '/w/a', 'A', 1);
    const build = KernelRegistry.build({ extensions: [{ manifest: notes, quarantined: false }], enabled: new Map([[workspaceA, ['@acme/notes']]]) });
    if (!build.ok) throw new Error(build.failure.detail);
    const logged: LogRecord[] = [];
    const lost: ActiveInvocation[] = [];
    const sink: InvocationSink = {
      called: async () => ({ ok: true }), completed: async () => undefined, refused: async () => undefined, loadFailed: async () => undefined,
      timedOut: async () => undefined, aborted: () => undefined, collateral: async () => undefined, interrupted: async () => undefined,
      quarantine: async () => undefined,
      kernelCommand: async () => undefined,
      lost: async (invocation) => {
        lost.push(invocation);
      },
    };
    const { start, started } = fakeThreads();
    const hosts = new HostManager({
      connection, registry: () => build.registry, modules: { entry: () => '/x/notes.ts' }, values: new RecordedValueStore(connection),
      logger: { write: (record) => logged.push(record) }, ids: ulids, poolSize: 1, startThread: start,
      timers: { set: () => ({ cancel: () => undefined }) }, now: () => 1, failures: new HostFailures(),
    });
    hosts.connect(sink);
    const first = ulids.next();
    const second = ulids.next();
    hosts.dispatch(claimFor(first));
    hosts.dispatch(claimFor(second));
    const [thread] = started;
    if (thread === undefined) throw new Error('no thread started');
    const [invoke] = thread.frames;
    if (invoke?.frame !== 'invoke') throw new Error('no invoke frame');

    thread.events.frame({
      frame: 'complete', invocationId: invoke.invocationId, outcome: { ok: 'yes', secret: 'hunter2' },
      unitOfWork: { writes: [], sends: [], publishes: [], replies: [] }, recorded: { id: [], now: [] },
    });

    expect(thread.terminated).toBe(true);
    expect(lost.map((invocation) => invocation.claim.message.id).sort()).toEqual([first, second].sort());
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ level: 'warn', fields: { path: 'outcome' } });
    expect(JSON.stringify(logged)).not.toContain('hunter2');
    connection.close();
  });
});
