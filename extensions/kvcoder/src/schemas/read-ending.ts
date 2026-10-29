import { z } from '@kvman/sdk';

/** That the agent read how `ref` ended, with `background wait` (ADR 0108, 7): a process's or a program worker's run id, or a helper's session id. */
export const readEndingDocSchema = z.object({ sessionId: z.string(), ref: z.string(), createdAt: z.string() });
