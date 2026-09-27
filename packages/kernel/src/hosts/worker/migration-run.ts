import type { MigratedFrame, MigrateFrame } from '@kvman/protocol';
import type { ExtensionRecording } from '../../extension/record-extension.ts';
import { kernelProblem, ProblemError } from '../../problems.ts';
import { problemOfThrownIn } from './host-problems.ts';
import { createMigrationContext, type StepWrites } from './migration-context.ts';
import type { RpcClient } from './rpc-client.ts';

// 04 §4.8, ADR 0143: one migration step in a host. Its writes go back to the kernel, which commits them with the new
// stored version in one unit; a step that throws hands back nothing.
export async function runMigration(frame: MigrateFrame, extension: ExtensionRecording, client: RpcClient): Promise<MigratedFrame> {
  const step: StepWrites = { writes: [], config: new Map() };
  const context = { correlationId: frame.correlationId };
  try {
    const up = extension.migrationSteps.get(frame.to);
    if (up === undefined) throw new ProblemError(kernelProblem('EXT_MANIFEST_INVALID', { ...context, detail: `${frame.extension} binds no migration to version ${frame.to}` }));
    await up(createMigrationContext({ client, invocationId: frame.invocationId, correlationId: frame.correlationId, extension, step }));
    return { frame: 'migrated', invocationId: frame.invocationId, outcome: { ok: true }, writes: step.writes, config: [...step.config.values()] };
  } catch (error) {
    if (!(error instanceof ProblemError)) {
      void client.call(frame.invocationId, { name: 'log', level: 'error', message: 'an unexpected error ended a migration step', fields: { error: error instanceof Error ? error.name : typeof error } });
    }
    return { frame: 'migrated', invocationId: frame.invocationId, outcome: { ok: false, problem: problemOfThrownIn(error, context) }, writes: [], config: [] };
  }
}
