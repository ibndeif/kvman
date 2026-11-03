import { z } from '@kvman/sdk';

/** What a delegated run delivers (ADR 0108, 2). */
export const runKinds = ['find', 'change', 'check', 'review'] as const;

/**
 * A helper's run as its session keeps it (ADR 0108, 2): its kind, its goal, the absolute paths a `change` run may
 * change (`null` for the other kinds), the most steps one of its turns takes, and its whole title, which tells the
 * helper who it is (ADR 0116, 2; none on a helper from before it).
 */
export const delegateBriefSchema = z.object({ kind: z.enum(runKinds), goal: z.string(), files: z.array(z.string()).nullable(), budget: z.number().int().min(1).max(60), role: z.string().min(1).exactOptional() });

export type RunBrief = z.output<typeof delegateBriefSchema>;
