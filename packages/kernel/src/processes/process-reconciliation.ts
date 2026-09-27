import { processLimits, type ProcessResult } from '@kvman/protocol';
import { processStartOf } from '../daemon/process-identity.ts';
import { ProblemError } from '../problems.ts';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import type { Connection } from '../storage/driver.ts';
import { runningProcesses, type ProcessEnd } from '../storage/process-rows.ts';
import { signalGroup } from './gated-spawn.ts';
import { commitEnd, finalizeLog, removeLog, tailOfLog, type EndingDeps } from './process-endings.ts';

export type ReconciliationDeps = EndingDeps & { connection: Connection; timers: SchedulerTimers; now: () => number };

// A recorded group is the same process only while its PID runs with the start time recorded; a reused PID never is.
function stillRunning(pid: number, processStart: string): boolean {
  return processStartOf(pid) === processStart;
}

// 03 §3.9 step 6, ADR 0139: every process still recorded as running belongs to a kernel that is gone. A group that
// still matches is killed (SIGTERM, then SIGKILL after 3 s); every such row ends `killed` with reason `kernel-restart`,
// its log finalized, and a detached one's onExit sent.
export async function reconcileProcesses(deps: ReconciliationDeps): Promise<number> {
  const running = runningProcesses(deps.connection);
  for (const record of running) {
    if (stillRunning(record.pid, record.processStart)) {
      signalGroup(record.pid, 'SIGTERM');
      deps.timers.set(processLimits.killGraceMs, () => {
        if (stillRunning(record.pid, record.processStart)) signalGroup(record.pid, 'SIGKILL');
      });
    }
    const logBlobId = await finalizeLog(deps.store, record);
    const endedAt = deps.now();
    const result: ProcessResult = {
      exitCode: null, signal: null, logBlobId, tail: await tailOfLog(record.logPath), truncated: record.truncated, durationMs: Math.max(0, endedAt - record.startedAt),
    };
    const end: ProcessEnd = { processId: record.processId, reason: 'kernel-restart', exitCode: null, signal: null, logBlobId, truncated: record.truncated, endedAt };
    const committed = await commitEnd(deps, record, end, result);
    if (!committed.committed) throw new ProblemError(committed.problem);
    removeLog(record.logPath);
  }
  return running.length;
}
