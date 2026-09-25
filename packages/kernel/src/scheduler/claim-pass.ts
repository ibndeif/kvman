import type { Connection } from '../storage/driver.ts';
import { claimMessage } from './claims.ts';
import { commandSlots, type Dispatcher, type HostLoad } from './dispatcher.ts';
import type { InFlight, RunningInvocation } from './in-flight.ts';
import { invocationDeadline } from './invocation-deadline.ts';
import type { PendingIndex } from './pending-index.ts';
import type { Rotation } from './rotation.ts';
import type { Candidate, PendingEntry } from './run-queues.ts';

export type ClaimPassDeps = {
  connection: Connection;
  index: PendingIndex;
  dispatcher: Dispatcher;
  rotation: Rotation;
  inFlight: InFlight;
  eligible: (entry: PendingEntry) => boolean;
  timeoutMs: (entry: PendingEntry) => number | undefined;
  // Claims already committed whose dispatch is still to come (ADR 0105).
  undispatched: readonly RunningInvocation[];
};

function loadOf(dispatcher: Dispatcher, entry: PendingEntry): HostLoad {
  return dispatcher.load({ extension: entry.extension, workspaceId: entry.workspaceId, kind: entry.kind });
}

// Claims not dispatched yet (this pass's, and committed ones on their way) count against their host here.
function hostHasRoom(dispatcher: Dispatcher, entry: PendingEntry, claimed: readonly RunningInvocation[]): boolean {
  const load = loadOf(dispatcher, entry);
  const waiting = claimed.filter((invocation) => loadOf(dispatcher, invocation.entry).host === load.host).length;
  return load.inFlight + waiting < commandSlots(load.cap);
}

function claim(deps: ClaimPassDeps, entry: PendingEntry, now: number): RunningInvocation | undefined {
  const result = entry.unstored === undefined ? claimMessage(deps.connection, entry, now) : { claimed: true, message: entry.unstored.message } as const;
  if (!result.claimed) return undefined;
  const deadlineAt = invocationDeadline(result.message, deps.timeoutMs(entry), now);
  const invocation: RunningInvocation = { entry, message: result.message, attempt: entry.attempts + 1, conflicts: 0, deadlineAt };
  deps.inFlight.start(invocation);
  return invocation;
}

// 03 §3.4: one scheduler pass takes runnable messages by class, workspace, and lane within the limits and marks them
// running, adding each claim to `claimed` as it goes. The caller holds the write transaction and dispatches the
// claims once it commits, so every claim is durable before its message reaches a host (ADR 0105).
export function claimRunnable(deps: ClaimPassDeps, now: number, initial: Candidate[], claimed: RunningInvocation[]): void {
  let candidates = initial;
  for (let chosen = deps.rotation.choose(candidates); chosen !== undefined; chosen = deps.rotation.choose(candidates)) {
    const current: Candidate = chosen;
    candidates = candidates.filter((candidate) => candidate !== current);
    if (!deps.eligible(current.entry) || !hostHasRoom(deps.dispatcher, current.entry, [...deps.undispatched, ...claimed])) continue;
    deps.index.take(current);
    deps.rotation.served(current);
    const invocation = claim(deps, current.entry, now);
    if (invocation !== undefined) claimed.push(invocation);
    const next = current.queue.candidate(now, deps.eligible);
    if (next !== undefined) candidates.push(next);
  }
}
