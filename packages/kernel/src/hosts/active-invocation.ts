import type { Claim } from '../scheduler/dispatcher.ts';
import type { LiveAddress } from './live-bus.ts';
import type { PoolWorker } from './worker-pool.ts';

// One invocation sent to a host and not yet completed; `live` holds the addresses it published to, for resets, and
// `received` the blob IDs handed to it in its message, its ctx.command replies, and its ctx.query results (ADR 0134).
export type ActiveInvocation = { id: string; claim: Claim; worker: PoolWorker; live: Map<string, LiveAddress>; received: Set<string> };

export function extensionSender(invocation: ActiveInvocation): { address: `ext:${string}`; extension: string } {
  return { address: `ext:${invocation.claim.extension}`, extension: invocation.claim.extension };
}
