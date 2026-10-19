import { z } from '@kvman/sdk';

// One of the person's approval rules (plan 08 §8.3, ADR 0091, 1): the start of a line, or file changes.

export const approvalRuleSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('line'), prefix: z.string().trim().min(1).max(200).describe('The start of a line that runs without asking, as `pnpm exec`.') }),
  z.strictObject({ kind: z.literal('files') }),
]);

export type ApprovalRule = z.output<typeof approvalRuleSchema>;
