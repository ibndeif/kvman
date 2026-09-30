import { z } from 'zod';
import { jsonSchema } from './json.ts';

/** The kernel's error codes (plan 05). */
export const kernelProblemCodes = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'NOT_PUBLIC',
  'NOT_A_COMMAND',
  'READ_ONLY',
  'NO_JOB',
  'TOO_LARGE',
  'TOO_DEEP',
  'TIMEOUT',
  'CANCELLED',
  'WORKER_CRASHED',
  'INTERRUPTED',
  'HANDLER_FAILED',
  'FORBIDDEN_ORIGIN',
  'PROCESS_RUNNING',
  'PORT_IN_USE',
  'EXTENSION_INVALID',
  'KVMAN_RUNNING',
] as const;

/** One of the kernel's error codes. */
export type KernelProblemCode = (typeof kernelProblemCodes)[number];

/** An extension's error code: `<namespace>/UPPER_SNAKE`. */
export const extensionProblemCodePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\/[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

/** Accepts a kernel code or an extension code. */
export const problemCodeSchema = z.union([z.enum(kernelProblemCodes), z.string().regex(extensionProblemCodePattern)]);

/** Accepts a Problem: `{ code, message, params? }`. */
export const problemSchema = z.strictObject({
  code: problemCodeSchema,
  message: z.string(),
  params: z.record(z.string(), jsonSchema).optional(),
});

/** A failure: a catalog code, an English message for logs, and optional JSON params. */
export type Problem = z.infer<typeof problemSchema>;

/** The error that carries a Problem; throwing it fails the job with that Problem. */
export class ProblemError extends Error {
  /** The Problem this error carries. */
  readonly problem: Problem;

  /** Wraps a Problem, using its message as the error message. */
  constructor(problem: Problem) {
    super(problem.message);
    this.name = 'ProblemError';
    this.problem = problem;
  }
}
