import { z } from 'zod';
import { portSchema } from './daemon.ts';

// The payloads and results of the kernel's own queries (03 §3.8), added as the milestones that build them land.

export const healthRequestSchema = z.strictObject({});

export type HealthRequest = z.infer<typeof healthRequestSchema>;

// 03 §3.8, ADRs 0088, 0092: `degraded` while an extension is quarantined; `instanceId` is the lock nonce.
export const healthResultSchema = z.strictObject({
  status: z.enum(['ok', 'degraded']),
  version: z.string().min(1),
  instanceId: z.uuidv4(),
  processStart: z.string().min(1),
  uptimeMs: z.number().int().nonnegative(),
  port: portSchema,
  home: z.string().min(1),
});

export type HealthResult = z.infer<typeof healthResultSchema>;
