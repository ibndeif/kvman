import type { Claim } from '../scheduler/dispatcher.ts';
import type { LiveAddress } from './live-bus.ts';
import type { PoolWorker } from './worker-pool.ts';

// One invocation sent to a host and not yet completed; `live` holds the addresses it published to, for resets.
export type ActiveInvocation = { id: string; claim: Claim; worker: PoolWorker; live: Map<string, LiveAddress> };

export function extensionSender(invocation: ActiveInvocation): { address: `ext:${string}`; extension: string } {
  return { address: `ext:${invocation.claim.extension}`, extension: invocation.claim.extension };
}
