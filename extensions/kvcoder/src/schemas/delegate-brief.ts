import { z } from '@kvman/sdk';

/** What a delegated run delivers (ADR 0108, 2). */
export const runKinds = ['find', 'change', 'check', 'review'] as const;

/**
 * A helper's run as its session keeps it (ADR 0108, 2): its kind, its goal, the absolute paths a `change` run may
 * change (`null` for the other kinds), and the most steps one of its turns takes.
 */
export const delegateBriefSchema = z.object({ kind: z.enum(runKinds), goal: z.string(), files: z.array(z.string()).nullable(), budget: z.number().int().min(1).max(60) });

export type RunBrief = z.output<typeof delegateBriefSchema>;
