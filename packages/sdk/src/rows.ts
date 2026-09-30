import { z } from 'zod';
import { jsonSchema } from './json.ts';
import { problemSchema } from './problem.ts';

/** Accepts an ISO 8601 time in UTC, such as `2026-09-30T03:00:00.000Z`. */
export const isoTimeSchema = z.iso.datetime();

/** Accepts a kernel-assigned id (UUIDv7). */
export const idSchema = z.uuid({ version: 'v7' });

/** Accepts a workspace: a folder on disk. */
export const workspaceSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  path: z.string().min(1),
});

/** A workspace: a folder on disk; Home's id is `home`. */
export type Workspace = z.infer<typeof workspaceSchema>;

/** Accepts who started a job. */
export const callerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('user') }),
  z.strictObject({ kind: z.literal('extension'), name: z.string().min(1) }),
  z.strictObject({ kind: z.literal('kernel') }),
]);

/** Who started a job: the user (HTTP), an extension (by package name), or the kernel (handler jobs). */
export type Caller = z.infer<typeof callerSchema>;

/** Accepts a job status. */
export const jobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);

/** The status of an async or scheduled job. */
export type JobStatus = z.infer<typeof jobStatusSchema>;

/** Accepts the row of an async or scheduled job. */
export const jobSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  input: jsonSchema,
  workspaceId: z.string().min(1),
  caller: callerSchema,
  status: jobStatusSchema,
  attempts: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  output: jsonSchema.optional(),
  problem: problemSchema.optional(),
  createdAt: isoTimeSchema,
  startedAt: isoTimeSchema.optional(),
  endedAt: isoTimeSchema.optional(),
});

/** The row of an async or scheduled job. */
export type Job = z.infer<typeof jobSchema>;

/** Accepts who owns a file. */
export const fileOwnerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('user') }),
  z.strictObject({ kind: z.literal('extension'), name: z.string().min(1) }),
]);

/** Accepts the row of a file the kernel keeps. */
export const fileSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  type: z.string().min(1),
  size: z.number().int().nonnegative(),
  owner: fileOwnerSchema,
  workspaceId: z.string().min(1),
  createdAt: isoTimeSchema,
});

/** The row of a file the kernel keeps; `type` is its media type. */
export type File = z.infer<typeof fileSchema>;
