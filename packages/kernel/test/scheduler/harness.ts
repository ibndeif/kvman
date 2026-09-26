import type { JsonObject, Manifest, Message, OutboundPublish, OutboundSend, Priority, Problem } from '@kvman/protocol';
import {
  AdapterPath, betterSqlite3Driver, CommitPipeline, insertMessage, kernelProblem, KernelRegistry, openKernelDatabase, PayloadValidators,
  PendingIndex, Router, Scheduler, type AdapterCommand, type CommitResult, type Connection, type InvocationOutcome, type Sender,
} from '../../src/index.ts';
import { event, manifest, query, subscription, workspaceA, workspaceB } from '../registry/manifests.ts';
import { MapGrants, openWorkspaces } from '../router/harness.ts';
import { temporaryDatabaseFile, ulids } from '../storage/harness.ts';
import { ManualTimers, startTime, TestDispatcher, type TestTime } from './doubles.ts';

export { workspaceA, workspaceB };

export const person: Sender = { address: 'user:local' };
export const pdfProcess: Sender = { address: 'proc:job-1', extension: '@acme/pdf' };

type CommandFields = { lane?: string; concurrency?: number; maxAttempts?: number; scope?: 'global' };

function command(type: string, fields: CommandFields = {}): Manifest['types'][number] {
  return { type, kind: 'command', description: 'A command.', input: { type: 'object' }, access: 'all', handler: `command:${type}`, ...fields };
}

export const pdfHandlers = ['pdf.page.render', 'pdf.text.extract', 'pdf.image.resize', 'pdf.file.compress', 'pdf.file.sign'];

const pdf = manifest('@acme/pdf', 'pdf', {
  types: [
    command('pdf.translate', { lane: 'file:{{ $payload.fileId }}' }), command('pdf.import', { concurrency: 2 }), command('pdf.render'),
    command('pdf.convert', { maxAttempts: 4 }), command('pdf.index.rebuild', { scope: 'global' }), ...pdfHandlers.map((type) => command(type)),
    query('pdf.files.list'), event('pdf.imported'),
  ],
});

const agent = manifest('@kvman/agent', 'agent', {
  types: [command('agent.run'), command('agent.step', { lane: 'session:{{ $payload.sessionId }}' })],
});

const audit = manifest('@acme/audit', 'audit', {
  types: [command('audit.run')],
  subscriptions: [subscription('kernel.message.dead-lettered'), subscription('pdf.imported')],
});

export type SchedulerFixture = {
  connection: Connection;
  time: TestTime;
  timers: ManualTimers;
  dispatcher: TestDispatcher;
  router: Router;
  pipeline: CommitPipeline;
  adapter: AdapterPath;
  index: PendingIndex;
  scheduler: Scheduler;
};

function registry(): KernelRegistry {
  const build = KernelRegistry.build({
    extensions: [pdf, agent, audit].map((installed) => ({ manifest: installed, quarantined: false })),
    enabled: new Map([[workspaceA, ['@acme/pdf', '@kvman/agent', '@acme/audit']], [workspaceB, ['@acme/pdf']]]),
  });
  if (!build.ok) throw new Error(build.failure.detail);
  return build.registry;
}

type Shared = { connection: Connection; time: TestTime; index: PendingIndex | undefined };

function assemble({ connection, time, index }: Shared): SchedulerFixture {
  const now = (): number => time.value;
  const built = registry();
  const grants = new MapGrants();
  grants.grant('@acme/audit', workspaceA, { derived: { subscribes: ['pdf.imported'], providesLlm: [] } });
  grants.grant('@acme/pdf', workspaceA, { requested: [{ name: 'calls', types: ['agent.*'] }] });
  const router = new Router({ registry: () => built, grants, workspaces: openWorkspaces, validators: new PayloadValidators(), ids: ulids, now, defaultLocale: () => 'en' });
  const pending = index ?? new PendingIndex(now);
  const pipeline = new CommitPipeline({ connection, admission: router, now });
  const timers = new ManualTimers(time);
  const dispatcher = new TestDispatcher();
  const scheduler = new Scheduler({ connection, pipeline, index: pending, registry: () => built, dispatcher, now, timers, onCommitted: () => undefined });
  return { connection, time, timers, dispatcher, router, pipeline, adapter: new AdapterPath(pipeline, ulids), index: pending, scheduler };
}

export function openSchedulerFixture(): SchedulerFixture {
  const fixture = assemble({ connection: openKernelDatabase(temporaryDatabaseFile(), betterSqlite3Driver, ulids.next()), time: { value: startTime }, index: undefined });
  fixture.scheduler.start();
  return fixture;
}

// A kernel restart on the same database: the index is rebuilt from SQLite and a new scheduler starts on it.
export function restart(fixture: SchedulerFixture): SchedulerFixture {
  const now = (): number => fixture.time.value;
  const restarted = assemble({ connection: fixture.connection, time: fixture.time, index: PendingIndex.rebuild(fixture.connection, now) });
  restarted.scheduler.start();
  return restarted;
}

// Lets the scheduler's requested pass run.
export async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => { queueMicrotask(resolve); });
}

type SendOptions = Omit<AdapterCommand, 'sender' | 'type' | 'payload'>;

export async function submit(fixture: SchedulerFixture, type: string, payload: JsonObject = {}, options: SendOptions & { sender?: Sender } = {}): Promise<string> {
  const { sender, ...rest } = options;
  const submission = await fixture.adapter.submitCommand({ sender: sender ?? person, workspaceId: workspaceA, idempotencyKey: ulids.next(), type, payload, ...rest });
  if (!submission.ok) throw new Error(`${type} was not admitted: ${submission.problem.code}`);
  await nextTurn();
  return submission.id;
}

export function withPriority(priority: Priority): { priority: Priority } {
  return { priority };
}

export function claimOf(fixture: SchedulerFixture, messageId: string): Message {
  const claim = fixture.dispatcher.claims.find((candidate) => candidate.message.id === messageId);
  if (claim === undefined) throw new Error(`${messageId} was never claimed`);
  return claim.message;
}

function extensionOfClaim(fixture: SchedulerFixture, messageId: string): string {
  const claim = fixture.dispatcher.claims.find((candidate) => candidate.message.id === messageId);
  if (claim === undefined) throw new Error(`${messageId} was never claimed`);
  return claim.extension;
}

// The invocation's unit commits (as a host would report it), then the scheduler learns it settled.
export async function complete(
  fixture: SchedulerFixture, messageId: string, outcome: InvocationOutcome = { ok: true, value: null },
  contents: { sends?: OutboundSend[]; publishes?: OutboundPublish[] } = {},
): Promise<CommitResult> {
  const message = claimOf(fixture, messageId);
  const result = await fixture.pipeline.enqueue({
    origin: { kind: 'invocation', invocation: { message, extension: extensionOfClaim(fixture, messageId), outcome, stored: true } },
    writes: [], sends: contents.sends ?? [], publishes: contents.publishes ?? [], replies: [],
  });
  if (!result.committed) throw new Error(`the unit of ${messageId} did not commit: ${result.problem.code}`);
  fixture.dispatcher.end(messageId);
  fixture.scheduler.settled(messageId);
  await nextTurn();
  return result;
}

export function retryableProblem(message: Message): Problem {
  return kernelProblem('INTERNAL', { correlationId: message.correlationId, messageId: message.id });
}

export async function fail(fixture: SchedulerFixture, messageId: string): Promise<CommitResult> {
  fixture.dispatcher.end(messageId);
  const result = await fixture.scheduler.failed(messageId, retryableProblem(claimOf(fixture, messageId)));
  await nextTurn();
  return result;
}

// A command a running handler sends and waits for (what M1.6's ctx.command stores in its own transaction).
export async function commandFrom(fixture: SchedulerFixture, parentId: string, type: string, payload: JsonObject = {}): Promise<string> {
  const parent = claimOf(fixture, parentId);
  const extension = extensionOfClaim(fixture, parentId);
  const admission = fixture.router.admitSend(fixture.connection, {
    send: { type, payload }, sender: { address: `ext:${extension}`, extension }, cause: parent, workspaceId: parent.workspaceId, index: 0,
  });
  if (admission.outcome !== 'admitted') throw new Error(`${type} was not admitted: ${admission.outcome === 'refused' ? admission.problem.code : 'duplicate'}`);
  fixture.index.add([insertMessage(fixture.connection, admission.admitted, 'pending', undefined, fixture.time.value)]);
  await nextTurn();
  return admission.admitted.message.id;
}

export function row(fixture: SchedulerFixture, messageId: string): Record<string, unknown> {
  const found = fixture.connection.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (found === undefined) throw new Error(`no row for ${messageId}`);
  return found;
}
