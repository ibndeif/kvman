import { z } from 'zod';
import { jsonSchema } from './json.ts';
import { problemSchema } from './problem.ts';
import { fileSchema, idSchema, jobSchema } from './rows.ts';

/** Accepts a failed HTTP answer: the Problem, and the job id when a command or query failed. */
export const failureEnvelopeSchema = z.strictObject({
  ok: z.literal(false),
  problem: problemSchema,
  jobId: idSchema.optional(),
});

/** Makes the schema of an HTTP answer: `{ ok: true, …data }` or the failure envelope. */
export function envelopeSchema<Shape extends z.ZodRawShape>(data: Shape) {
  return z.discriminatedUnion('ok', [z.strictObject({ ok: z.literal(true), ...data }), failureEnvelopeSchema]);
}

/** Accepts the answer of a sync command or a query. */
export const outputEnvelopeSchema = envelopeSchema({ output: jsonSchema, jobId: idSchema });

/** Accepts the answer of a command queued with `async: true`. */
export const queuedEnvelopeSchema = envelopeSchema({ jobId: idSchema });

/** Accepts the answer of `GET /api/jobs/:id`. */
export const jobEnvelopeSchema = envelopeSchema({ job: jobSchema });

/** Accepts the answer of a file upload. */
export const fileEnvelopeSchema = envelopeSchema({ file: fileSchema });

/** Accepts an answer that carries no data, such as a cancel. */
export const emptyEnvelopeSchema = envelopeSchema({});
