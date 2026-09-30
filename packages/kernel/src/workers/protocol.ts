import { callerSchema, jsonSchema, problemSchema, workspaceSchema, z } from '@kvman/sdk';

// The messages between the main thread and a worker, checked on arrival like any other boundary.

const secretWriteSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set'), extension: z.string(), name: z.string(), value: z.string() }),
  z.object({ action: z.literal('delete'), extension: z.string(), name: z.string() }),
]);

export type SecretWrite = z.infer<typeof secretWriteSchema>;

export const workerSetupSchema = z.object({
  home: z.string(),
  database: z.string(),
  extensions: z.array(z.object({ name: z.string(), namespace: z.string(), entryUrl: z.string() })),
  presetSettings: z.record(z.string(), jsonSchema),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  checkPresetSettings: z.boolean(),
});

export type WorkerSetup = z.infer<typeof workerSetupSchema>;

export type WorkerExtension = WorkerSetup['extensions'][number];

const rootJobSchema = z.object({ id: z.string(), name: z.string(), input: z.unknown(), workspace: workspaceSchema, caller: callerSchema });

export type RootJob = z.infer<typeof rootJobSchema>;

export const toWorkerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('run'), requestId: z.number(), job: rootJobSchema }),
  z.object({ kind: z.literal('secret-written'), requestId: z.number(), problem: problemSchema.optional() }),
]);

export type ToWorker = z.infer<typeof toWorkerSchema>;

export const toMainSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready') }),
  z.object({ kind: z.literal('failed'), problem: problemSchema }),
  z.object({ kind: z.literal('result'), requestId: z.number(), output: z.unknown() }),
  z.object({ kind: z.literal('problem'), requestId: z.number(), problem: problemSchema }),
  z.object({ kind: z.literal('write-secret'), requestId: z.number(), write: secretWriteSchema }),
]);

export type ToMain = z.infer<typeof toMainSchema>;
