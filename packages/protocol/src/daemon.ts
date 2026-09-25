import { z } from 'zod';
import { epochMsSchema } from './identifiers.ts';
import { problemSchema } from './problem.ts';

// 03 §3.10: without --port, the kernel binds the first free port of this range.
export const kernelPorts = { from: 4173, to: 4199 } as const;

export const portSchema = z.number().int().min(1).max(65_535);

// ADR 0088: who owns a home folder; every client finds the kernel through it. `nonce` is the kernel's instanceId,
// and `processStart` is the opaque `ps -o lstart=` string of `pid`.
export const daemonLockSchema = z.strictObject({
  pid: z.number().int().positive(),
  processStart: z.string().min(1),
  nonce: z.uuidv4(),
  port: portSchema,
  startedAt: epochMsSchema,
});

export type DaemonLock = z.infer<typeof daemonLockSchema>;

// ADR 0087: what the daemon tells the CLI that started it, once, over the IPC channel.
export const daemonStartReportSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), port: portSchema }),
  z.strictObject({ ok: z.literal(false), problem: problemSchema }),
]);

export type DaemonStartReport = z.infer<typeof daemonStartReportSchema>;
