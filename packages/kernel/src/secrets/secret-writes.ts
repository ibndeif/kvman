import type { FaultPoints } from '../faults/fault-points.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { SecretChange, SecretStore } from './secret-store.ts';

function isFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string';
}

function namesOf(changes: readonly SecretChange[]): { extensions: string[]; names: string[] } {
  return {
    extensions: [...new Set(changes.map((change) => change.extension))],
    names: changes.flatMap((change) => (change.kind === 'clear-extension' ? [] : [change.name])),
  };
}

// 04 §4.7, ADR 0126: every committed unit's secret changes reach secrets.json after its commit, in commit order. A
// write that fails keeps the old file and values, and is logged with the extensions and secret names, never a value.
export function writeCommittedSecrets(pipeline: CommitPipeline, store: SecretStore, logger: KernelLogger, faults: FaultPoints): () => void {
  return pipeline.observe((applied) => {
    if (applied.secrets.length === 0) return;
    faults.reach('secrets.after-commit-before-file');
    try {
      store.apply(applied.secrets);
    } catch (error) {
      if (!isFileError(error)) throw error;
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
      logger.write({ level: 'error', message: 'the secrets file could not be written; the old values stay', fields: { ...namesOf(applied.secrets), code }, attributes: { correlationId: applied.correlationId } });
    }
  });
}
