import { z } from '@kvman/sdk';

// A background process a session started with `background: true` (ADR 0009, 150). It lives in the global store, since the
// handlers for kvman stopping and starting run in Home. It is running until `end` is set; `reported` says whether the
// session has been told how it ended.
export const processDocSchema = z.object({
  workspaceId: z.string(),
  sessionId: z.string(),
  title: z.string(),
  call: z.string(),
  startedAt: z.string(),
  endedAt: z.string().exactOptional(),
  end: z.enum(['exited', 'agent', 'person', 'interrupted']).exactOptional(),
  exitCode: z.number().int().nullable().exactOptional(),
  signal: z.string().nullable().exactOptional(),
  reported: z.boolean(),
  starting: z.boolean().exactOptional(),
  /** Started with `notify: true`: its watcher, not the exit handler, reports its end (ADR 0108, 16). */
  notify: z.boolean().exactOptional(),
  /** The chat's `nextSeq` when it started, and, once a rewind went back past that, `quiet`: its end is never told (ADR 0118, 1). */
  atSeq: z.number().int().nonnegative().exactOptional(),
  quiet: z.boolean().exactOptional(),
});


export type ProcessDoc = z.output<typeof processDocSchema>;
