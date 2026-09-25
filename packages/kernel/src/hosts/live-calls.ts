import type { LiveChunk, RpcCall, RpcResult, TypeEntry } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import type { ActiveInvocation } from './active-invocation.ts';
import type { LiveBus } from './live-bus.ts';

type LiveCall = Extract<RpcCall, { name: 'live' }>;

function chunkMatches(chunk: LiveChunk, declared: TypeEntry): boolean {
  if (declared.kind !== 'event' || 'reset' in chunk) return false;
  if (declared.chunk === 'text') return 'text' in chunk;
  if (declared.chunk === 'value') return 'value' in chunk;
  return 'data' in chunk;
}

// 02 §2.3: an extension streams only its own live events, in their declared chunk shape; the kernel adds the run
// and remembers the address so an attempt that does not commit can be reset (ADR 0074).
export function publishLive(registry: KernelRegistry, bus: LiveBus, invocation: ActiveInvocation, call: LiveCall): RpcResult {
  const { message, extension } = invocation.claim;
  const refused = (code: 'CAPABILITY_DENIED' | 'VALIDATION_FAILED', detail: string): RpcResult => ({
    ok: false, problem: kernelProblem(code, { correlationId: message.correlationId, messageId: message.id, detail }),
  });
  if (message.kind === 'query') return refused('CAPABILITY_DENIED', 'a query cannot stream live events');
  const lookup = registry.lookup(call.type, message.workspaceId);
  const entry = lookup.ok ? lookup.resolved.entry : undefined;
  if (!lookup.ok || entry?.kind !== 'event' || entry.delivery !== 'live' || lookup.resolved.extension !== extension) {
    return refused('CAPABILITY_DENIED', `"${call.type}" is not a live event of ${extension}`);
  }
  if (!chunkMatches(call.chunk, entry)) return refused('VALIDATION_FAILED', `"${call.type}" streams ${entry.chunk ?? 'text'} chunks`);
  const address = { type: call.type, key: call.key, workspaceId: message.workspaceId };
  invocation.live.set(`${call.type}:${call.key}`, address);
  bus.publish(address, message.id, call.chunk);
  return { ok: true };
}
