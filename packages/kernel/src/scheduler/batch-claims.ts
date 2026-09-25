import type { PendingSink } from '../storage/commit-pipeline.ts';
import type { AppliedMessages } from '../storage/commit-unit.ts';
import type { InFlight, RunningInvocation } from './in-flight.ts';
import type { PendingIndex } from './pending-index.ts';

export type BatchClaimsDeps = {
  index: PendingIndex;
  inFlight: InFlight;
  // Whether the scheduler claims at all (started, not stopped).
  claiming: () => boolean;
  claimInto: (claimed: RunningInvocation[]) => void;
  dispatch: (claimed: readonly RunningInvocation[]) => void;
};

type Batch = { added: Set<string>; claimed: RunningInvocation[] };

// ADR 0105: the scheduler's side of the commit pipeline. Inside a batch's transaction its messages join the index and
// the runnable ones are claimed there too, so storing a message and claiming it cost one fsync; the claims reach
// their hosts once the batch commits. A batch that rolls back takes its messages out of the index again and puts its
// claims back in their places.
export class BatchClaims implements PendingSink {
  readonly #deps: BatchClaimsDeps;
  #batch: Batch | undefined;
  #undispatched: RunningInvocation[] = [];

  constructor(deps: BatchClaimsDeps) {
    this.#deps = deps;
  }

  enterBatch(applied: readonly AppliedMessages[]): void {
    const { index } = this.#deps;
    const batch: Batch = { added: new Set(), claimed: [] };
    this.#batch = batch;
    for (const { inserted, unstored } of applied) {
      for (const stored of inserted) batch.added.add(stored.message.id);
      for (const delivery of unstored) batch.added.add(delivery.admitted.message.id);
      index.add(inserted);
      if (unstored.length > 0) index.addUnstored(unstored);
    }
    if (this.#deps.claiming()) this.#deps.claimInto(batch.claimed);
  }

  // Claims of committed batches not yet handed to their hosts: they still count against their hosts' room.
  undispatched(): readonly RunningInvocation[] {
    return this.#undispatched;
  }

  batchCommitted(): void {
    const claimed = this.#batch?.claimed ?? [];
    this.#batch = undefined;
    if (claimed.length === 0) return;
    this.#undispatched.push(...claimed);
    queueMicrotask(() => {
      this.#undispatched = this.#undispatched.filter((invocation) => !claimed.includes(invocation));
      this.#deps.dispatch(claimed);
    });
  }

  batchRolledBack(): void {
    const batch = this.#batch;
    this.#batch = undefined;
    if (batch === undefined) return;
    for (const { entry } of batch.claimed) {
      this.#deps.inFlight.finish(entry.id, false);
      if (!batch.added.has(entry.id)) this.#deps.index.placeAtFront(entry);
    }
    this.#deps.index.remove(batch.added);
  }
}
