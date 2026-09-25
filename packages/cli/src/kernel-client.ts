import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { daemonLockSchema, healthResultSchema, type DaemonLock, type HealthResult, type Json } from '@kvman/protocol';

export type RunningKernel = { lock: DaemonLock; health: HealthResult };

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

export function readLock(home: string): DaemonLock | undefined {
  let text: string;
  try {
    text = readFileSync(join(home, 'daemon.lock'), 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined;
    throw error;
  }
  try {
    const parsed = daemonLockSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export function kernelUrl(port: number, path: string): string {
  return `http://127.0.0.1:${port}/api/v1${path}`;
}

// A connection that is refused or reset means no kernel listens there.
function unreachable(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined;
  return ['ECONNREFUSED', 'ECONNRESET', 'EPIPE'].includes(errorCode(cause) ?? '');
}

// 12 §12.5: every command finds the kernel through its home's lock; it runs when its /health names the lock's nonce.
export async function findKernel(home: string): Promise<RunningKernel | undefined> {
  const lock = readLock(home);
  if (lock === undefined) return undefined;
  try {
    const response = await fetch(kernelUrl(lock.port, '/health'));
    if (!response.ok) return undefined;
    const health = healthResultSchema.safeParse(await response.json());
    return health.success && health.data.instanceId === lock.nonce ? { lock, health: health.data } : undefined;
  } catch (error) {
    if (unreachable(error)) return undefined;
    throw error;
  }
}

export async function postCommand(port: number, type: string, payload: Json, idempotencyKey: string): Promise<Response> {
  return fetch(kernelUrl(port, `/commands/${type}`), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payload, idempotencyKey }),
  });
}
