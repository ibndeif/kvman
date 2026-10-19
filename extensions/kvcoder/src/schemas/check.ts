import { z } from '@kvman/sdk';

// The person's check after file changes (plan 08 §8.3, ADR 0094, 3): a line, and how long it may run.

export const checkSchema = z
  .strictObject({
    line: z.string().trim().min(1).max(2000).describe('The line to run, as the project checks itself, such as pnpm typecheck.'),
    timeoutMs: z.number().int().min(1000).max(600_000).default(60_000).describe('How long the check may run, in milliseconds.'),
  })
  .nullable();

export type Check = z.output<typeof checkSchema>;
