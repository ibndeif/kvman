import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { errorOutput, jsonOutput, type CallResult } from '../connector-line.ts';
import { resultText } from '../result-text.ts';
import { appendBackground, backgroundText } from '../turns/background.ts';

// `--async` connector calls (plan 08 §8.3): kvcoder's own job runs the command; when it ends, the result is appended
// to the session as a background message, which starts a turn if the session is idle. A cancelled or interrupted run
// reports through kvcoder's job-point handlers instead (ADR 0009, 95).

/** `kvcoder.connector.run`'s options (ADR 0009, 100). */
export const connectorRunOptions = { retries: 0, timeoutMs: 3_600_000 };

export function registerConnectorRun(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.connector.run', {
    description: "Runs a connector's command in the background and reports its result to the session.",
    input: z.object({ sessionId: z.string(), call: z.string(), command: z.string(), input: z.record(z.string(), z.json()) }),
    output: z.object({}),
    ...connectorRunOptions,
    handle: async ({ sessionId, call, command, input }) => {
      let result: CallResult;
      try {
        result = jsonOutput(await ctx.exec(command, input));
      } catch (error) {
        if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
        result = errorOutput(error.problem);
      }
      if (ctx.job.signal.aborted) return {};
      await appendBackground(ctx, sessionId, { kind: 'job', jobId: ctx.job.id }, backgroundText(call, ctx.job.id, resultText(result.output, result.exitCode)), true);
      return {};
    },
  });
}
