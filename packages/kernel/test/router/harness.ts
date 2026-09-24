import type { Capabilities, JsonObject, Manifest, Message, OutboundPublish, OutboundSend } from '@kvman/protocol';
import {
  AdapterPath, betterSqlite3Driver, CommitPipeline, KernelRegistry, openKernelDatabase, PayloadValidators, PendingIndex, Router,
  type AdapterCommand, type CommitResult, type Connection, type GrantsSource, type Sender, type Submission,
} from '../../src/index.ts';
import { command, event, manifest, query, subscription, workspaceA, workspaceB } from '../registry/manifests.ts';
import { now, temporaryDatabaseFile, ulids } from '../storage/harness.ts';

export { workspaceA, workspaceB };

export const person: Sender = { address: 'user:local' };
export const pdfSender: Sender = { address: 'ext:@acme/pdf', extension: '@acme/pdf' };
export const agentSender: Sender = { address: 'ext:@kvman/agent', extension: '@kvman/agent' };
export const agentProcess: Sender = { address: 'proc:job-1', extension: '@kvman/agent' };
export const kernel: Sender = { address: 'kernel' };

export function objectSchema(properties: Record<string, JsonObject>, required: string[] = Object.keys(properties)): JsonObject {
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties, required, additionalProperties: false };
}

const text: JsonObject = { type: 'string' };
const blobId: JsonObject = { type: 'string', pattern: '^[0-9a-f]{64}$', format: 'kvman-blob-id', label: '$t.fields.blob' };

type CommandEntry = Extract<Manifest['types'][number], { kind: 'command' }>;

function withFields(entry: Manifest['types'][number], fields: Partial<CommandEntry>): Manifest['types'][number] {
  return entry.kind === 'command' ? { ...entry, ...fields } : entry;
}

export const pdf = manifest('@acme/pdf', 'pdf', {
  types: [
    withFields(command('pdf.translate'), { input: objectSchema({ fileId: text, lang: text }), lane: 'file:{{ $payload.fileId }}', agentTool: { title: 'Translate' } }),
    withFields(command('pdf.import'), { input: objectSchema({ blobId, source: { type: 'string', format: 'uri' }, meta: objectSchema({ pages: { type: 'integer' } }, []) }, ['blobId']) }),
    withFields(command('pdf.files.prune'), { access: 'internal' }),
    withFields(command('pdf.record'), { access: 'internal' }),
    withFields(command('pdf.approve'), { access: 'user' }),
    withFields(command('pdf.tools.set'), { access: 'extensions' }),
    withFields(command('pdf.batch'), { input: { type: 'object' }, lane: 'batch:{{ $payload.batch }}/{{ $payload.part }}' }),
    query('pdf.files.list'),
    { type: 'pdf.imported', kind: 'event', description: 'Imported.', delivery: 'durable', payload: objectSchema({ fileId: text }) },
    event('pdf.progress.updated', 'live'),
    { type: 'pdf.changed', kind: 'event', description: 'Changed.', delivery: 'transient' },
    { type: 'pdf.exported', kind: 'event', description: 'Exported.', delivery: 'durable', payload: objectSchema({ name: text }) },
  ],
  subscriptions: [subscription('pdf.imported')],
});

export const agent = manifest('@kvman/agent', 'agent', {
  types: [
    command('agent.run'),
    withFields(command('agent.prompt.section.set'), { access: 'extensions' }),
    command('agent.login.start', 'global'),
    withFields(command('agent.tool.record'), { access: 'internal', input: { type: 'object' } }),
    event('agent.ran'),
  ],
  subscriptions: [subscription('pdf.imported'), subscription('pdf.exported')],
});

export const audit = manifest('@acme/audit', 'audit', {
  types: [command('audit.run')],
  subscriptions: [subscription('pdf.imported'), { ...subscription('pdf.*'), lane: 'file:{{ $payload.fileId }}' }],
});

export const ocr = manifest('@acme/ocr', 'ocr', { types: [command('ocr.extract')] });

export class MapGrants implements GrantsSource {
  readonly #grants = new Map<string, Capabilities>();

  grant(extension: string, workspaceId: string | undefined, capabilities: Partial<Capabilities>): void {
    this.#grants.set(`${extension}@${workspaceId ?? ''}`, {
      isolation: 'shared', requested: capabilities.requested ?? [], derived: capabilities.derived ?? { subscribes: [], providesLlm: [] },
    });
  }

  capabilities(extension: string, workspaceId: string | undefined): Capabilities | undefined {
    return this.#grants.get(`${extension}@${workspaceId ?? ''}`);
  }
}

export type RouterFixture = {
  connection: Connection;
  router: Router;
  pipeline: CommitPipeline;
  adapter: AdapterPath;
  grants: MapGrants;
  pending: PendingIndex;
  validators: PayloadValidators;
};

export function openRouterFixture(): RouterFixture {
  const connection = openKernelDatabase(temporaryDatabaseFile(), betterSqlite3Driver, ulids.next());
  const build = KernelRegistry.build({
    extensions: [pdf, agent, audit, ocr].map((installed) => ({ manifest: installed, quarantined: false })),
    enabled: new Map([[workspaceA, ['@acme/pdf', '@kvman/agent', '@acme/audit']], [workspaceB, ['@acme/ocr']]]),
  });
  if (!build.ok) throw new Error(build.failure.detail);
  const grants = new MapGrants();
  const validators = new PayloadValidators();
  const pending = new PendingIndex(now);
  const router = new Router({ registry: () => build.registry, grants, validators, ids: ulids, now, defaultLocale: () => 'en' });
  const pipeline = new CommitPipeline({ connection, admission: router, now, pending });
  return { connection, router, pipeline, adapter: new AdapterPath(pipeline, ulids), grants, pending, validators };
}

export function personCommand(fixture: RouterFixture, command: Omit<AdapterCommand, 'sender'>, sender: Sender = person): Promise<Submission> {
  return fixture.adapter.submitCommand({ sender, workspaceId: workspaceA, idempotencyKey: ulids.next(), ...command });
}

// A committed command whose handler then acts: the cause of the sends and publishes under test.
export async function causeMessage(fixture: RouterFixture, type: string, sender: Sender = person, payload: JsonObject = {}): Promise<Message> {
  const result = await fixture.pipeline.enqueue({
    origin: { kind: 'adapter', sender, workspaceId: workspaceA, messageId: ulids.next() },
    writes: [], sends: [{ type, payload, ...(sender.address === 'kernel' ? {} : { idempotencyKey: ulids.next() }) }], publishes: [],
  });
  const stored = result.committed ? result.inserted[0] : undefined;
  if (stored === undefined) throw new Error(`the cause ${type} was not stored: ${JSON.stringify(result)}`);
  return stored.message;
}

export function handlerUnit(fixture: RouterFixture, cause: Message, extension: string, contents: { sends?: OutboundSend[]; publishes?: OutboundPublish[] }): Promise<CommitResult> {
  return fixture.pipeline.enqueue({
    origin: { kind: 'invocation', invocation: { message: cause, extension, outcome: { ok: true, value: null } } },
    writes: [], sends: contents.sends ?? [], publishes: contents.publishes ?? [],
  });
}

export function problemCode(result: CommitResult | Submission): string | undefined {
  if ('committed' in result) return result.committed ? undefined : result.problem.code;
  return result.ok ? undefined : result.problem.code;
}

export function messageRows(fixture: RouterFixture, where = '1 = 1', ...values: string[]): Array<Record<string, unknown>> {
  return fixture.connection.prepare(`SELECT * FROM messages WHERE ${where} ORDER BY seq`).all(...values);
}

export { now, ulids };
