import { faultPointNames, faultSettingOf, faultSettingSchema, type FaultPoint, type FaultSetting } from '@kvman/protocol';
import { kernelProblem, ProblemError } from '../problems.ts';

// ADR 0100: the named places where a test run may kill the kernel (14 §14.3). Every build carries the calls; only
// an active setting acts on them.
export interface FaultPoints {
  reach(point: FaultPoint): void;
}

export const inertFaults: FaultPoints = { reach: () => undefined };

// Kills on the setting's hit of its point, once; every other point and hit passes.
export function activeFaults(setting: FaultSetting, kill: () => void): FaultPoints {
  let hits = 0;
  return {
    reach: (point) => {
      if (point !== setting.point) return;
      hits += 1;
      if (hits === setting.hit) kill();
    },
  };
}

// SIGKILL ends the process at once: no finally block, flush, or log line runs after the point.
export function killKernelProcess(): void {
  process.kill(process.pid, 'SIGKILL');
}

// ADR 0100: `KVMAN_FAULTS`, read once when the daemon starts; unset or empty means no fault point is active.
export function faultPointsOf(setting: string | undefined, correlationId: string): FaultPoints {
  if (setting === undefined || setting === '') return inertFaults;
  const parsed = faultSettingSchema.safeParse(setting);
  if (parsed.success) return activeFaults(faultSettingOf(parsed.data), killKernelProcess);
  throw new ProblemError(kernelProblem('VALIDATION_FAILED', {
    correlationId, detail: `KVMAN_FAULTS is not a fault setting: "${setting}"`,
    issues: [{ path: 'KVMAN_FAULTS', message: parsed.error.issues[0]?.message ?? 'expected <point> or <point>@<hit>' }],
    hint: `set KVMAN_FAULTS to <point> or <point>@<hit>, where <point> is one of: ${faultPointNames.join(', ')}`,
  }));
}
