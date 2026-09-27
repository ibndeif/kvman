import { z } from 'zod';
import { blobIdSchema } from './blob-id.ts';
import { packageNameSchema } from './extension/grammar.ts';
import { epochMsSchema, liveAddressSchema, typeNameSchema, typePatternSchema, ulidSchema, workspaceIdSchema } from './identifiers.ts';
import { messageContextSchema } from './message.ts';
import { utf8ByteLength } from './unicode.ts';

// 03 §3.7, ADR 0139: the limits and defaults of the process supervisor.
export const processLimits = {
  maxTimeoutMs: 86_400_000,
  detachedTimeoutMs: 86_400_000,
  defaultLogCapBytes: 10 * 1024 * 1024,
  maxLogCapBytes: 104_857_600,
  stdinBytes: 16 * 1024 * 1024,
  tailBytes: 4096,
  liveWindowMs: 100,
  killGraceMs: 3000,
  retentionMs: 7 * 86_400_000,
} as const;

export const environmentNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'expected an environment variable name');

// 12 §12.4, ADR 0140: what a process may call through kv, and the context its calls add.
export const processTokenSchema = z.strictObject({
  calls: z.array(typePatternSchema),
  context: messageContextSchema.exactOptional(),
  delegate: z.boolean().exactOptional(),
});
export type ProcessToken = z.infer<typeof processTokenSchema>;

export const spawnOptionsSchema = z.strictObject({
  command: z.string().min(1),
  args: z.array(z.string()).exactOptional(),
  cwd: z.string().min(1).exactOptional(),
  env: z.record(environmentNameSchema, z.string()).exactOptional(),
  timeoutMs: z.number().int().positive().max(processLimits.maxTimeoutMs).exactOptional(),
  stdin: z.string().refine((text) => utf8ByteLength(text) <= processLimits.stdinBytes, `stdin is at most ${processLimits.stdinBytes} bytes`).exactOptional(),
  logCapBytes: z.number().int().positive().max(processLimits.maxLogCapBytes).exactOptional(),
  live: liveAddressSchema.exactOptional(),
  token: processTokenSchema.exactOptional(),
  detached: z.boolean().exactOptional(),
  onExit: typeNameSchema.exactOptional(),
});
export type SpawnOptions = z.infer<typeof spawnOptionsSchema>;

export const spawnResultSchema = z.strictObject({ processId: ulidSchema });
export type SpawnResult = z.infer<typeof spawnResultSchema>;

export const processResultSchema = z.strictObject({
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  logBlobId: blobIdSchema,
  tail: z.string(),
  truncated: z.boolean(),
  durationMs: z.number().int().nonnegative(),
});
export type ProcessResult = z.infer<typeof processResultSchema>;

export const processExitReasonSchema = z.enum(['exited', 'killed', 'kernel-restart']);
export type ProcessExitReason = z.infer<typeof processExitReasonSchema>;

// The payload of a detached process's onExit command (03 §3.7).
export const processExitSchema = z.strictObject({ processId: ulidSchema, reason: processExitReasonSchema, ...processResultSchema.shape });
export type ProcessExit = z.infer<typeof processExitSchema>;

export const processStateSchema = z.enum(['running', 'exited', 'killed']);
export type ProcessState = z.infer<typeof processStateSchema>;

// 03 §3.8, ADR 0139: kernel.processes.list; items never carry args, env, stdin, or output.
export const processesListLimits = { defaultLimit: 200, maxLimit: 1000 } as const;

export const processesListRequestSchema = z.strictObject({
  extension: packageNameSchema.exactOptional(),
  state: processStateSchema.exactOptional(),
  limit: z.number().int().min(1).max(processesListLimits.maxLimit).exactOptional(),
});
export type ProcessesListRequest = z.infer<typeof processesListRequestSchema>;

export const processSummarySchema = z.strictObject({
  processId: ulidSchema,
  extension: packageNameSchema,
  messageId: ulidSchema,
  workspaceId: workspaceIdSchema.exactOptional(),
  command: z.string(),
  pid: z.number().int().positive(),
  state: processStateSchema,
  detached: z.boolean(),
  startedAt: epochMsSchema,
  endedAt: epochMsSchema.exactOptional(),
  exitCode: z.number().int().exactOptional(),
  signal: z.string().exactOptional(),
  reason: processExitReasonSchema.exactOptional(),
  logBlobId: blobIdSchema.exactOptional(),
});
export type ProcessSummary = z.infer<typeof processSummarySchema>;

export const processesListResultSchema = z.strictObject({ items: z.array(processSummarySchema), total: z.number().int().nonnegative() });
export type ProcessesListResult = z.infer<typeof processesListResultSchema>;
