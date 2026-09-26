import type { Problem, StoreRead } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { ActiveInvocation } from './active-invocation.ts';
import type { PoolWorker } from './worker-pool.ts';
import type { ReadPool } from './read-pool/read-pool.ts';

export type StoreReadOutcome = { ok: true; value: Uint8Array } | { ok: false; problem: Problem };

// ADR 0131: a sandboxed host's read runs on the read pool for the owner and workspace of its invocation, never ones
// the frame names. Shared and dedicated hosts read through their own connections.
export async function serveStoreRead(pool: ReadPool, worker: PoolWorker, invocation: ActiveInvocation, read: StoreRead): Promise<StoreReadOutcome> {
  const { message, extension } = invocation.claim;
  const failed = (code: 'CAPABILITY_DENIED' | 'WORKSPACE_INVALID' | 'VALIDATION_FAILED' | 'INTERNAL', detail: string, hint?: string): StoreReadOutcome => ({
    ok: false, problem: kernelProblem(code, { correlationId: message.correlationId, messageId: message.id, detail, ...(hint === undefined ? {} : { hint }) }),
  });
  if (worker.thread.postValue === undefined) return failed('CAPABILITY_DENIED', 'shared and dedicated hosts read through their own connection');
  const ws = read.scope === 'global' ? '' : message.workspaceId;
  if (ws === undefined) return failed('WORKSPACE_INVALID', 'this handler has no workspace', 'use ctx.store.global');
  const answer = await pool.read(extension, ws, read);
  return answer.ok ? answer : failed(answer.code, answer.detail);
}
