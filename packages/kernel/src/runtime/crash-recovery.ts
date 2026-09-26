import { kernelProblem, ProblemError } from '../problems.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import { handlerKeyOf } from '../scheduler/pending-index.ts';
import { retryOutcome, retryUnit, schedulerDefaults } from '../scheduler/retry-policy.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { RetryOutcome } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import type { SpillFiles } from '../storage/spill.ts';
import { readMessage } from '../storage/stored-message.ts';

export type CrashRecoveryDeps = {
  connection: Connection;
  files: SpillFiles;
  pipeline: CommitPipeline;
  registry: () => KernelRegistry;
  now: () => number;
};

const interruptedSql = "SELECT id, handler, type, attempts FROM messages WHERE state = 'running' ORDER BY seq";

function maxAttemptsOf(registry: KernelRegistry, handler: string, type: string): number {
  const handlerKey = handlerKeyOf(handler, type);
  const separator = handlerKey.indexOf('|');
  const settings = registry.handler(handlerKey.slice(0, separator), handlerKey.slice(separator + 1));
  return settings?.maxAttempts ?? schedulerDefaults.maxAttempts;
}

// 03 §3.9 step 6, ADR 0091: a row still running at boot was interrupted by a crash (a graceful shutdown sets its rows
// back to pending), so its attempt counts: it is pending again at once, or dead once that reaches maxAttempts. It runs
// before the scheduler starts, so a recovered message keeps its place at the front of its lane. Returns the messages
// that are pending again; a unit that does not commit fails the boot.
export async function recoverInterrupted(deps: CrashRecoveryDeps): Promise<string[]> {
  const { connection, pipeline, now } = deps;
  const recovered: Array<Promise<string | undefined>> = [];
  for (const row of connection.prepare(interruptedSql).all()) {
    const record = readMessage({ connection, files: deps.files }, String(row['id']));
    if (record === undefined) continue;
    const { message } = record;
    const attempts = Number(row['attempts']) + 1;
    const maxAttempts = maxAttemptsOf(deps.registry(), String(row['handler']), String(row['type']));
    const problem = kernelProblem('INTERNAL', { correlationId: message.correlationId, messageId: message.id, detail: 'the kernel stopped while the handler ran' });
    const outcome: RetryOutcome = attempts < maxAttempts ? { state: 'pending', notBefore: now() } : retryOutcome(message, attempts, maxAttempts, problem, now());
    recovered.push(pipeline.enqueue(retryUnit(message, attempts, outcome)).then((result) => {
      if (!result.committed) throw new ProblemError(result.problem);
      return outcome.state === 'pending' ? message.id : undefined;
    }));
  }
  return (await Promise.all(recovered)).filter((messageId) => messageId !== undefined);
}
