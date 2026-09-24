import { z } from 'zod';
import { ulidSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { problemCodePattern } from './naming/name-patterns.ts';

export const issueSchema = z.strictObject({
  path: z.string(),
  message: z.string().min(1),
  hint: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  params: jsonSchema.optional(),
  severity: z.enum(['error', 'warning']).optional(),
});

export type Issue = z.infer<typeof issueSchema>;

export const problemSchema = z.strictObject({
  code: z.string().regex(problemCodePattern, 'expected a kernel code (UPPER_SNAKE) or "<namespace>/UPPER_SNAKE"'),
  title: z.string().min(1),
  detail: z.string().min(1).optional(),
  hint: z.string().min(1).optional(),
  params: z.record(z.string(), jsonSchema).optional(),
  retryable: z.boolean(),
  retryAfterMs: z.number().int().nonnegative().optional(),
  correlationId: ulidSchema,
  messageId: ulidSchema.optional(),
  issues: z.array(issueSchema).optional(),
});

export type Problem = z.infer<typeof problemSchema>;
