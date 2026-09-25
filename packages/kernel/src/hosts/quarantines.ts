import type { ExtensionQuarantined, QuarantineReason } from '@kvman/protocol';
import type { RegistryState } from '../registry/registry-state.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { UlidGenerator } from '../ulid.ts';

// 03 §3.6, ADR 0080: a quarantine is stored and announced in one kernel unit; the registry then refuses the
// extension everywhere and the scheduler leaves its pending messages waiting (ADR 0086).
export class Quarantines {
  readonly #pipeline: CommitPipeline;
  readonly #registry: RegistryState;
  readonly #ids: UlidGenerator;

  constructor(pipeline: CommitPipeline, registry: RegistryState, ids: UlidGenerator) {
    this.#pipeline = pipeline;
    this.#registry = registry;
    this.#ids = ids;
  }

  async quarantine(extension: string, reason: QuarantineReason): Promise<void> {
    if (this.#registry.current().isQuarantined(extension)) return;
    const payload: ExtensionQuarantined = { name: extension, reason };
    const result = await this.#pipeline.enqueue({
      origin: { kind: 'quarantine', extension, reason, correlationId: this.#ids.next() },
      writes: [], sends: [], publishes: [{ type: 'kernel.extension.quarantined', payload }], replies: [],
    });
    if (result.committed) this.#registry.refresh();
  }
}
