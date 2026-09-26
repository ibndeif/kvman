import type { Claim } from '../scheduler/dispatcher.ts';

// A verified snapshot: its folder, which a sandboxed host may read (ADR 0129), and the extension's entry module.
export type VerifiedSnapshot = { folder: string; entry: string };

// Each extension's snapshot, verified before its first load in this process (06 §6.5).
export interface ExtensionSnapshots {
  verifiedEntry(extension: string): VerifiedSnapshot | undefined;
  verify(extension: string): Promise<boolean>;
}

export type GateOutcome = 'verified' | 'failed' | 'dropped';

// Claims waiting for their extension's rehash. A claim is running from the moment it is claimed, so while it waits a
// cancel drops it (the cancel already ended its message) and a shutdown takes it back for redelivery.
export class SnapshotGate {
  readonly #snapshots: ExtensionSnapshots;
  readonly #waiting = new Map<string, Claim>();

  constructor(snapshots: ExtensionSnapshots) {
    this.#snapshots = snapshots;
  }

  entry(extension: string): VerifiedSnapshot | undefined {
    return this.#snapshots.verifiedEntry(extension);
  }

  async admit(claim: Claim): Promise<GateOutcome> {
    this.#waiting.set(claim.message.id, claim);
    const verified = await this.#snapshots.verify(claim.extension);
    if (!this.#waiting.delete(claim.message.id)) return 'dropped';
    return verified ? 'verified' : 'failed';
  }

  drop(messageIds: ReadonlySet<string>): void {
    for (const id of messageIds) this.#waiting.delete(id);
  }

  takeAll(): Claim[] {
    const claims = [...this.#waiting.values()];
    this.#waiting.clear();
    return claims;
  }
}
