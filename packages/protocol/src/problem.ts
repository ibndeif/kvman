import { z } from 'zod';
import { ulidSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { problemCodePattern } from './naming/name-patterns.ts';

export const issueSchema = z.strictObject({
  path: z.string(),
  message: z.string().min(1),
  hint: z.string().min(1).exactOptional(),
  code: z.string().min(1).exactOptional(),
  params: jsonSchema.exactOptional(),
  severity: z.enum(['error', 'warning']).exactOptional(),
});

export type Issue = z.infer<typeof issueSchema>;

export const problemSchema = z.strictObject({
  code: z.string().regex(problemCodePattern, 'expected a kernel code (UPPER_SNAKE) or "<namespace>/UPPER_SNAKE"'),
  title: z.string().min(1),
  detail: z.string().min(1).exactOptional(),
  hint: z.string().min(1).exactOptional(),
  params: z.record(z.string(), jsonSchema).exactOptional(),
  retryable: z.boolean(),
  retryAfterMs: z.number().int().nonnegative().exactOptional(),
  correlationId: ulidSchema,
  messageId: ulidSchema.exactOptional(),
  issues: z.array(issueSchema).exactOptional(),
});

export type Problem = z.infer<typeof problemSchema>;
