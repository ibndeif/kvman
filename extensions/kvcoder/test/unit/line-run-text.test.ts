import { describe, expect, it } from 'vitest';
import { lineRunIsError, lineRunText, type LineRun } from '../../src/calls/line-run.ts';
import { exitIsReported } from '../../src/jobs/process-handlers.ts';
import { startedOutcome } from '../../src/jobs/process-run.ts';
import { processDocSchema } from '../../src/schemas/records.ts';

// The record decides what a background start's result says (ADR 0012, 7 and 9).
function backgroundRun(doc: Parameters<typeof startedOutcome>[0], output = ''): LineRun {
  return { output, ...startedOutcome(doc), timedOut: false, leftoverStopped: false, durationMs: 0, timeoutMs: 0, jobId: 'job-1' };
}

describe('what a background start returns (08 §8.3, ADR 0012, 7)', () => {
  it('QA19-E9 the record decides', () => {
    const running = backgroundRun({});
    expect(lineRunText(running)).toBe('started job-1\n[running]');
    expect(lineRunIsError(running)).toBe(false);
    const failed = backgroundRun({ end: 'exited', exitCode: 1, signal: null });
    expect(lineRunText(failed)).toBe('started job-1\n[the process has already ended]\n[exit code 1]');
    expect(lineRunIsError(failed)).toBe(true);
    const killed = backgroundRun({ end: 'exited', signal: 'SIGTERM' });
    expect(lineRunText(killed)).toBe('started job-1\n[the process has already ended]\n[killed by SIGTERM]');
    expect(lineRunIsError(killed)).toBe(true);
    const stopped = backgroundRun({ end: 'person' });
    expect(lineRunText(stopped)).toBe('started job-1\n[the process has already ended]');
    expect(lineRunIsError(stopped)).toBe(false);
  });

  it('QA19-E10 starting and older records', () => {
    const older = processDocSchema.parse({ workspaceId: 'w', sessionId: 's', title: 't', call: 'c', startedAt: 'now', reported: false });
    expect(older.starting).toBeUndefined();
    expect(exitIsReported(older)).toBe(true);
    expect(exitIsReported({ starting: false })).toBe(true);
    expect(exitIsReported({ starting: true })).toBe(false);
  });
});
