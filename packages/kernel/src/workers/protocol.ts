import { callerSchema, extensionSourceSchema, jsonSchema, problemSchema, workspaceSchema, z } from '@kvman/sdk';

// The messages between the main thread and a worker, checked on arrival like any other boundary.

const secretWriteSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set'), extension: z.string(), name: z.string(), value: z.string() }),
  z.object({ action: z.literal('delete'), extension: z.string(), name: z.string() }),
]);

export type SecretWrite = z.infer<typeof secretWriteSchema>;

const scheduleTimingSchema = z.union([z.object({ at: z.string() }), z.object({ cron: z.string() })]);

// What a worker asks the main thread to do, which owns the job and schedule rows (ADR 0009, 19).
const workerRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('write-secret'), write: secretWriteSchema }),
  z.object({
    kind: z.literal('queue-job'),
    name: z.string(),
    input: z.unknown(),
    workspaceId: z.string(),
    caller: callerSchema,
    retries: z.number().int(),
    fromHandler: z.boolean(),
  }),
  z.object({
    kind: z.literal('schedule'),
    name: z.string(),
    input: z.unknown(),
    timing: scheduleTimingSchema,
    key: z.string().optional(),
    workspaceId: z.string(),
    owner: z.string(),
    retries: z.number().int(),
    fromHandler: z.boolean(),
  }),
  z.object({ kind: z.literal('cancel-schedule'), id: z.string(), owner: z.string() }),
  z.object({ kind: z.literal('cancel-job'), jobId: z.string() }),
  z.object({ kind: z.literal('open-workspace'), path: z.string() }),
  z.object({ kind: z.literal('close-workspace'), workspaceId: z.string() }),
  z.object({ kind: z.literal('health') }),
  z.object({
    kind: z.literal('start-process'),
    extension: z.string(),
    workspace: workspaceSchema,
    name: z.string(),
    options: z.object({ command: z.string(), args: z.array(z.string()), cwd: z.string().optional(), env: z.record(z.string(), z.string()) }),
  }),
  z.object({ kind: z.literal('stop-process'), extension: z.string(), workspaceId: z.string(), name: z.string() }),
]);

export type WorkerRequest = z.infer<typeof workerRequestSchema>;

export const workerSetupSchema = z.object({
  home: z.string(),
  homeFolder: z.string(),
  database: z.string(),
  extensions: z.array(
    z.object({ name: z.string(), namespace: z.string(), entryUrl: z.string(), version: z.string(), source: extensionSourceSchema, revision: z.number().int() }),
  ),
  languages: z.array(z.string()),
  presetSettings: z.record(z.string(), jsonSchema),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  terminalLog: z.boolean(),
  checkPresetSettings: z.boolean(),
});

export type WorkerSetup = z.infer<typeof workerSetupSchema>;

export type WorkerExtension = WorkerSetup['extensions'][number];

const rootJobSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
  workspace: workspaceSchema,
  caller: callerSchema,
  async: z.boolean(),
  fromHandler: z.boolean(),
  handlerExtension: z.string().optional(),
});

export type RootJob = z.infer<typeof rootJobSchema>;

export const abortReasons = ['cancel', 'shutdown'] as const;

export type AbortReason = (typeof abortReasons)[number];

export const toWorkerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('run'), requestId: z.number(), job: rootJobSchema }),
  z.object({ kind: z.literal('abort'), requestId: z.number(), reason: z.enum(abortReasons) }),
  z.object({ kind: z.literal('answer'), requestId: z.number(), value: z.unknown().optional(), problem: problemSchema.optional() }),
  z.object({ kind: z.literal('stop') }),
]);

export type ToWorker = z.infer<typeof toWorkerSchema>;

const summarySchema = z.object({
  jobs: z.array(z.object({ name: z.string(), kind: z.enum(['command', 'query']), owner: z.string(), public: z.boolean(), retries: z.number().int(), syncOnly: z.boolean(), maxInputBytes: z.number().int() })),
  handlers: z.array(z.object({ point: z.string(), extension: z.string(), retries: z.number().int() })),
});

export type RegistrySummary = z.infer<typeof summarySchema>;

// A sync job, root or nested, that ended failed or cancelled; the main thread queues the matching handler jobs.
const syncEndSchema = z.object({ point: z.enum(['kernel.job.failed', 'kernel.job.cancelled']), input: z.record(z.string(), z.unknown()), workspaceId: z.string() });

export type SyncEnd = z.infer<typeof syncEndSchema>;

export const toMainSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready'), summary: summarySchema }),
  z.object({ kind: z.literal('failed'), problem: problemSchema }),
  z.object({ kind: z.literal('result'), requestId: z.number(), output: z.unknown() }),
  z.object({ kind: z.literal('problem'), requestId: z.number(), problem: problemSchema }),
  z.object({ kind: z.literal('request'), requestId: z.number(), request: workerRequestSchema }),
  z.object({ kind: z.literal('progress'), rootId: z.string(), chunk: z.object({ source: z.string(), data: jsonSchema }) }),
  z.object({ kind: z.literal('sync-ended'), end: syncEndSchema }),
]);

export type ToMain = z.infer<typeof toMainSchema>;
