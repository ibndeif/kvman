import type { HealthResult } from '@kvman/protocol';
import type { Connection } from '../storage/driver.ts';

// Who this kernel is (ADRs 0088, 0089): its version, the lock's nonce and process start, its port and home folder,
// and when it started on the kernel clock.
export type KernelIdentity = { version: string; instanceId: string; processStart: string; port: number; home: string; startedAt: number };

// 03 §3.8, ADR 0092: degraded while at least one extension is quarantined.
export function healthOf(connection: Connection, identity: KernelIdentity, now: number): HealthResult {
  const quarantined = connection.prepare("SELECT 1 AS found FROM extensions WHERE status = 'quarantined' LIMIT 1").get() !== undefined;
  const { startedAt, ...fields } = identity;
  return { status: quarantined ? 'degraded' : 'ok', ...fields, uptimeMs: Math.max(0, now - startedAt) };
}
